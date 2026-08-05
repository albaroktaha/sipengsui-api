import { ArrMetadata } from './arr-metadata.interface';
import { ObservationImportDto } from '../dto/observation-import.dto';

export interface ArrParserResult {
  metadata: ArrMetadata;
  observations: ObservationImportDto[];
  summary: any;
}
