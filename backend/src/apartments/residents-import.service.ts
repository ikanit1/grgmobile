import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import * as bcrypt from 'bcrypt';
import { Apartment } from './entities/apartment.entity';
import { Building } from '../buildings/entities/building.entity';
import { UserApartment } from '../users/entities/user-apartment.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { AccessService } from '../access/access.service';
import { RequestUser } from '../auth/request-user.interface';

const MAX_IMPORT_ROWS = 1000;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const TEMP_PASSWORD_LENGTH = 12;

export interface ImportResidentRow {
  apartmentNumber: string;
  email?: string;
  phone?: string;
  name?: string;
  role?: string; // owner | resident | guest
}

@Injectable()
export class ResidentsImportService {
  constructor(
    @InjectRepository(Apartment)
    private readonly apartmentsRepo: Repository<Apartment>,
    @InjectRepository(Building)
    private readonly buildingsRepo: Repository<Building>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(UserApartment)
    private readonly userApartmentsRepo: Repository<UserApartment>,
    private readonly accessService: AccessService,
  ) {}

  async importFromFile(
    buildingId: number,
    file: { buffer: Buffer; originalname: string; size: number },
    user: RequestUser,
  ): Promise<{ created: number; linked: number; errors: string[] }> {
    await this.accessService.assertCanAccessBuilding(user, buildingId);
    const building = await this.buildingsRepo.findOne({ where: { id: buildingId } });
    if (!building) throw new NotFoundException('Здание не найдено');

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`Размер файла не более ${MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ`);
    }

    const ext = (file.originalname || '').toLowerCase().split('.').pop();
    let rows: ImportResidentRow[];
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

    return this.upsertResidents(buildingId, rows);
  }

  async importFromJson(
    buildingId: number,
    body: { residents: ImportResidentRow[] },
    user: RequestUser,
  ): Promise<{ created: number; linked: number; errors: string[] }> {
    await this.accessService.assertCanAccessBuilding(user, buildingId);
    const building = await this.buildingsRepo.findOne({ where: { id: buildingId } });
    if (!building) throw new NotFoundException('Здание не найдено');

    const rows = body.residents || [];
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`Не более ${MAX_IMPORT_ROWS} строк за один импорт`);
    }

    return this.upsertResidents(buildingId, rows);
  }

  private parseCsv(buffer: Buffer): ImportResidentRow[] {
    const text = buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    const header = lines[0].toLowerCase().split(sep).map((h) => h.trim());
    const aptIdx = header.findIndex((h) => h === 'apartment' || h === 'apartmentnumber' || h === 'квартира' || h === 'номер');
    const emailIdx = header.findIndex((h) => h === 'email' || h === 'почта');
    const phoneIdx = header.findIndex((h) => h === 'phone' || h === 'телефон' || h === 'tel');
    const nameIdx = header.findIndex((h) => h === 'name' || h === 'fio' || h === 'фио' || h === 'fullname');
    const roleIdx = header.findIndex((h) => h === 'role' || h === 'роль');
    const rows: ImportResidentRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(sep).map((c) => c.trim());
      const apartmentNumber = aptIdx >= 0 ? (cells[aptIdx] ?? '').trim() : (cells[0] ?? '').trim();
      if (!apartmentNumber) continue;
      rows.push({
        apartmentNumber: String(apartmentNumber),
        email: emailIdx >= 0 ? (cells[emailIdx] ?? '').trim() || undefined : undefined,
        phone: phoneIdx >= 0 ? (cells[phoneIdx] ?? '').trim() || undefined : undefined,
        name: nameIdx >= 0 ? (cells[nameIdx] ?? '').trim() || undefined : undefined,
        role: roleIdx >= 0 ? this.normalizeRole((cells[roleIdx] ?? '').trim()) : undefined,
      });
    }
    return rows;
  }

  private parseExcel(buffer: Buffer): ImportResidentRow[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as string[][];
    if (data.length < 2) return [];
    const header = (data[0] || []).map((h) => String(h || '').toLowerCase().trim());
    const aptIdx = header.findIndex((h) => h === 'apartment' || h === 'apartmentnumber' || h === 'квартира' || h === 'номер');
    const emailIdx = header.findIndex((h) => h === 'email' || h === 'почта');
    const phoneIdx = header.findIndex((h) => h === 'phone' || h === 'телефон' || h === 'tel');
    const nameIdx = header.findIndex((h) => h === 'name' || h === 'fio' || h === 'фио' || h === 'fullname');
    const roleIdx = header.findIndex((h) => h === 'role' || h === 'роль');
    const rows: ImportResidentRow[] = [];
    for (let i = 1; i < data.length; i++) {
      const cells = data[i] || [];
      const apartmentNumber = aptIdx >= 0 ? String(cells[aptIdx] ?? '').trim() : String(cells[0] ?? '').trim();
      if (!apartmentNumber) continue;
      rows.push({
        apartmentNumber,
        email: emailIdx >= 0 ? String(cells[emailIdx] ?? '').trim() || undefined : undefined,
        phone: phoneIdx >= 0 ? String(cells[phoneIdx] ?? '').trim() || undefined : undefined,
        name: nameIdx >= 0 ? String(cells[nameIdx] ?? '').trim() || undefined : undefined,
        role: roleIdx >= 0 ? this.normalizeRole(String(cells[roleIdx] ?? '').trim()) : undefined,
      });
    }
    return rows;
  }

  private normalizeRole(v: string): string | undefined {
    if (!v) return undefined;
    const lower = v.toLowerCase();
    if (lower === 'owner' || lower === 'владелец') return 'owner';
    if (lower === 'guest' || lower === 'гость') return 'guest';
    return 'resident';
  }

  private randomPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return s;
  }

  private async upsertResidents(
    buildingId: number,
    rows: ImportResidentRow[],
  ): Promise<{ created: number; linked: number; errors: string[] }> {
    const apartments = await this.apartmentsRepo.find({
      where: { buildingId },
      select: { id: true, number: true },
    });
    const apartmentByNumber = new Map(apartments.map((a) => [a.number, a.id]));

    let created = 0;
    let linked = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const aptNum = String(row?.apartmentNumber ?? '').trim();
      if (!aptNum) {
        errors.push(`Row ${i + 2}: empty apartment number`);
        continue;
      }
      const apartmentId = apartmentByNumber.get(aptNum);
      if (!apartmentId) {
        errors.push(`Row ${i + 2}: apartment "${aptNum}" not found in building`);
        continue;
      }
      const email = row?.email?.trim() || undefined;
      const phone = row?.phone?.trim() || undefined;
      if (!email && !phone) {
        errors.push(`Row ${i + 2}: email or phone required`);
        continue;
      }

      let targetUser: User | null = null;
      if (email) targetUser = await this.usersRepo.findOne({ where: { email } });
      if (!targetUser && phone) targetUser = await this.usersRepo.findOne({ where: { phone } });

      if (!targetUser) {
        const tempPassword = this.randomPassword();
        const hash = await bcrypt.hash(tempPassword, 10);
        targetUser = this.usersRepo.create({
          email: email || undefined,
          phone: phone || undefined,
          name: row?.name?.trim() || undefined,
          passwordHash: hash,
          role: UserRole.RESIDENT,
        });
        await this.usersRepo.save(targetUser);
        created++;
      }

      const existing = await this.userApartmentsRepo.findOne({
        where: { userId: targetUser.id, apartmentId },
      });
      if (!existing) {
        const ua = this.userApartmentsRepo.create({
          userId: targetUser.id,
          apartmentId,
          role: row?.role ?? 'resident',
        });
        await this.userApartmentsRepo.save(ua);
        linked++;
        this.accessService.invalidateAccessCache(targetUser.id).catch(() => {});
      }
    }

    return { created, linked, errors };
  }
}
