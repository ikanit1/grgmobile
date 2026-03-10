import { IsString, IsOptional } from 'class-validator';

export class CreateBuildingDto {
  @IsString()
  complexId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;
}
