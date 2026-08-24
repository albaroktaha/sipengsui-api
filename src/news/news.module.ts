import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { NewsController } from './news.controller';
import { PublicNewsController } from './public-news.controller';
import { NewsSchedulerService } from './news-scheduler.service';
import { NewsService } from './news.service';
import { NewsStorageService } from './news-storage.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [NewsController, PublicNewsController],
  providers: [NewsService, NewsStorageService, NewsSchedulerService],
  exports: [NewsService],
})
export class NewsModule {}
