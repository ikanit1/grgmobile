import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ImageConfigDto {
  @IsBoolean()
  wdrEnabled: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  wdrLevel?: number;
}
