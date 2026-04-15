import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePanelResidentDto } from './create-panel-resident.dto';

export class BulkImportResidentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePanelResidentDto)
  @ArrayMaxSize(200)
  residents!: CreatePanelResidentDto[];
}
