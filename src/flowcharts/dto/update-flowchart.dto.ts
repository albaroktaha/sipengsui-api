import { PartialType } from '@nestjs/swagger';
import { CreateFlowchartDto } from './create-flowchart.dto';

export class UpdateFlowchartDto extends PartialType(CreateFlowchartDto) {}
