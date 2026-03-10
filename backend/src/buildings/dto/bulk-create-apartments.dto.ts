import { IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkCreateApartmentsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  from!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  to!: number;
}
