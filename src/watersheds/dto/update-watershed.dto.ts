import { PartialType } from '@nestjs/swagger';
import { CreateWatershedDto } from './create-watershed.dto';

export class UpdateWatershedDto extends PartialType(CreateWatershedDto) {}
