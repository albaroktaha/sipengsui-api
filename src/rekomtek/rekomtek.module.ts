import { Module } from '@nestjs/common';

import { RekomtekController } from './rekomtek.controller';
import { RekomtekService } from './rekomtek.service';
import { BerkasController } from './berkas.controller';
import { BerkasService } from './berkas.service';
import { BerkasTemplateService } from './berkas-template.service';

@Module({
  controllers: [RekomtekController, BerkasController],
  providers: [
    RekomtekService,
    BerkasService,
    BerkasTemplateService,
  ],
})
export class RekomtekModule {}
