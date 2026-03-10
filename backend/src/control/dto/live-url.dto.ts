import { IsInt, IsOptional, IsString } from 'class-validator';

export class LiveUrlQueryDto {
  @IsOptional()
  @IsInt()
  channel?: number;

  @IsOptional()
  @IsString()
  stream?: string;
}

