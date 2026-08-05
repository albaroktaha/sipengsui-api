import { ObservationImportDto } from '../dto/observation-import.dto';
import { AwlrMetadata } from './awlr-metadata.interface';

export interface AwlrParserResult {
  metadata: AwlrMetadata;

  observations: ObservationImportDto[];

  summary: any;
}
