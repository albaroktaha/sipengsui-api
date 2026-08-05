import { Module } from '@nestjs/common';

import { FlowchartsController } from './flowcharts.controller';
import { AdminFlowchartsController } from './admin-flowcharts.controller';
import { FlowchartsService } from './flowcharts.service';

@Module({
  controllers: [FlowchartsController, AdminFlowchartsController],
  providers: [FlowchartsService],
})
export class FlowchartsModule {}
