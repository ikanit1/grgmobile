import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApplicationStatus } from '../entities/apartment-application.entity';

export class DecideApplicationDto {
  @IsEnum([ApplicationStatus.APPROVED, ApplicationStatus.REJECTED])
  status!: ApplicationStatus.APPROVED | ApplicationStatus.REJECTED;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectReason?: string;
}
