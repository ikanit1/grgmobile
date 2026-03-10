import { IsArray, IsNumber } from 'class-validator';

export class SyncConfigDto {
  @IsArray()
  @IsNumber({}, { each: true })
  deviceIds: number[];
}
