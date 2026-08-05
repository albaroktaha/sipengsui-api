import { PartialType } from '@nestjs/swagger';
import { CreateRiverRegionDto } from './create-river-region.dto';

export class UpdateRiverRegionDto extends PartialType(CreateRiverRegionDto) {}
