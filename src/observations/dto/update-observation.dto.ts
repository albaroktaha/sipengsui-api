import { PartialType } from '@nestjs/swagger';

import { CreateObservationDto } from './create-observation.dto';

export class UpdateObservationDto extends PartialType(CreateObservationDto) {}
