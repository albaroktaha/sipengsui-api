import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { FlowchartsService } from './flowcharts.service';

@ApiTags('Flowchart')
@Controller('flowcharts')
export class FlowchartsController {
  constructor(private readonly flowchartsService: FlowchartsService) {}

  @Get('public/:slug')
  @ApiOperation({
    summary: 'Flowchart publik berdasarkan slug (tanpa autentikasi)',
  })
  async getPublic(@Param('slug') slug: string) {
    const flowchart = await this.flowchartsService.getPublicBySlug(slug);

    if (!flowchart) {
      throw new NotFoundException(
        'Flowchart tidak ditemukan atau belum dipublikasikan',
      );
    }

    return flowchart;
  }
}
