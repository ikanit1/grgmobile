import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class BulkDeleteResidentsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  panelUserIds!: string[];
}
