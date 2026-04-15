import { PartialType } from '@nestjs/mapped-types';
import { CreatePanelResidentDto } from './create-panel-resident.dto';

export class UpdatePanelResidentDto extends PartialType(CreatePanelResidentDto) {}
