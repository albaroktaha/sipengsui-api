import { Module } from '@nestjs/common';
import { RiversService } from './rivers.service';
import { RiversController } from './rivers.controller';

@Module({
  controllers: [RiversController],
  providers: [RiversService],
})
export class RiversModule {}
