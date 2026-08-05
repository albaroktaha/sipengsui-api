import { PartialType } from '@nestjs/swagger';

import { CreateRekomtekDto } from './create-rekomtek.dto';

export class UpdateRekomtekDto extends PartialType(CreateRekomtekDto) {}
