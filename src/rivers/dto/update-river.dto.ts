import { PartialType } from '@nestjs/swagger';
import { CreateRiverDto } from './create-river.dto';

export class UpdateRiverDto extends PartialType(CreateRiverDto) {}
