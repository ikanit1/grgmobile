import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Apartment } from './entities/apartment.entity';
import { Building } from '../buildings/entities/building.entity';
import { AccessService } from '../access/access.service';
import { RequestUser } from '../auth/request-user.interface';

const MAX_IMPORT_ROWS = 1000;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ImportApartmentRow {
  number: string;
  floor?: number;
  rooms?: number;
  area?: number;
}

@Injectable()
export class ApartmentsImportService {
  constructor(
    @InjectRepository(Apartment)
    private readonly apartmentsRepo: Repository<Apartment>,
    @InjectRepository(Building)
    private readonly buildingsRepo: Repository<Building>,
    private readonly accessService: AccessService,
  ) {}

  async importFromFile(
    buildingId: number,
    file: { buffer: Buffer; originalname: string; size: number },
    user: RequestUser,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    await this.accessService.assertCanAccessBuilding(user, buildingId);
    const building = await this.buildingsRepo.findOne({ where: { id: buildingId } });
    if (!building) throw new NotFoundException('Здание не найдено');

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`Размер файла не более ${MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ`);
    }

    const ext = (file.originalname || '').toLowerCase().split('.').pop();
    let rows: ImportApartmentRow[];
    if (ext === 'csv') {
      rows = this.parseCsv(file.buffer);
    } else if (ext === 'xlsx' || ext === 'xls') {
      rows = this.parseExcel(file.buffer);
    } else {
      throw new BadRequestException('Файл должен быть CSV или Excel (.csv, .xlsx, .xls)');
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`Не более ${MAX_IMPORT_ROWS} строк за один импорт`);
    }

    return this.upsertApartments(buildingId, rows);
  }

  async importFromJson(
    buildingId: number,
    body: { apartments: ImportApartmentRow[] },
    user: RequestUser,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    await this.accessService.assertCanAccessBuilding(user, buildingId);
    const building = await this.buildingsRepo.findOne({ where: { id: buildingId } });
    if (!building) throw new NotFoundException('Здание не найдено');

    const rows = body.apartments || [];
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`Не более ${MAX_IMPORT_ROWS} строк за один импорт`);
    }

    return this.upsertApartments(buildingId, rows);
  }

  private parseCsv(buffer: Buffer): ImportApartmentRow[] {
    const text = buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    const header = lines[0].toLowerCase().split(sep).map((h) => h.trim());
    const numberIdx = header.findIndex((h) => h === 'number' || h === 'номер' || h === 'no' || h === '№');
    const floorIdx = header.findIndex((h) => h === 'floor' || h === 'этаж' || h === 'floor');
    const roomsIdx = header.findIndex((h) => h === 'rooms' || h === 'комнат');
    const areaIdx = header.findIndex((h) => h === 'area' || h === 'площадь');
    const rows: ImportApartmentRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(sep).map((c) => c.trim());
      const number = numberIdx >= 0 ? (cells[numberIdx] ?? '').trim() : (cells[0] ?? '').trim();
      if (!number) continue;
      rows.push({
        number: String(number),
        floor: floorIdx >= 0 && cells[floorIdx] ? parseInt(cells[floorIdx], 10) : undefined,
        rooms: roomsIdx >= 0 && cells[roomsIdx] ? parseInt(cells[roomsIdx], 10) : undefined,
        area: areaIdx >= 0 && cells[areaIdx] ? parseFloat(cells[areaIdx]) : undefined,
      });
    }
    return rows;
  }

  private parseExcel(buffer: Buffer): ImportApartmentRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as string[][];
    if (data.length < 2) return [];
    const header = (data[0] || []).map((h) => String(h || '').toLowerCase().trim());
    const numberIdx = header.findIndex((h) => h === 'number' || h === 'номер' || h === 'no' || h === '№');
    const floorIdx = header.findIndex((h) => h === 'floor' || h === 'этаж');
    const roomsIdx = header.findIndex((h) => h === 'rooms' || h === 'комнат');
    const areaIdx = header.findIndex((h) => h === 'area' || h === 'площадь');
    const rows: ImportApartmentRow[] = [];
    for (let i = 1; i < data.length; i++) {
      const cells = data[i] || [];
      const number = numberIdx >= 0 ? String(cells[numberIdx] ?? '').trim() : String(cells[0] ?? '').trim();
      if (!number) continue;
      rows.push({
        number,
        floor: floorIdx >= 0 && cells[floorIdx] != null && cells[floorIdx] !== '' ? parseInt(String(cells[floorIdx]), 10) : undefined,
        rooms: roomsIdx >= 0 && cells[roomsIdx] != null && cells[roomsIdx] !== '' ? parseInt(String(cells[roomsIdx]), 10) : undefined,
        area: areaIdx >= 0 && cells[areaIdx] != null && cells[areaIdx] !== '' ? parseFloat(String(cells[areaIdx])) : undefined,
      });
    }
    return rows;
  }

  private async upsertApartments(
    buildingId: number,
    rows: ImportApartmentRow[],
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    const existing = await this.apartmentsRepo.find({
      where: { buildingId },
      select: { number: true },
    });
    const existingNumbers = new Set(existing.map((a) => a.number));
    const toCreate: ImportApartmentRow[] = [];
    const errors: string[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const num = String(row?.number ?? '').trim();
      if (!num) {
        errors.push(`Row ${i + 2}: empty apartment number`);
        continue;
      }
      if (seen.has(num)) {
        errors.push(`Row ${i + 2}: duplicate number in file: ${num}`);
        continue;
      }
      seen.add(num);
      if (existingNumbers.has(num)) {
        continue; // skip, already exists
      }
      toCreate.push({ number: num, floor: row?.floor, rooms: row?.rooms, area: row?.area });
    }

    for (const row of toCreate) {
      const apt = this.apartmentsRepo.create({
        buildingId,
        number: row.number,
        floor: row.floor,
      });
      await this.apartmentsRepo.save(apt);
      existingNumbers.add(row.number);
    }

    return {
      created: toCreate.length,
      skipped: rows.length - toCreate.length - errors.length,
      errors,
    };
  }
}
