import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NewsService } from './news.service';

@Injectable()
export class NewsSchedulerService {
  constructor(private readonly newsService: NewsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async publishDueNews() {
    await this.newsService.publishScheduled();
  }
}
