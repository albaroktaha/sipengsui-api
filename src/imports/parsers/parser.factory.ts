import { ImportType } from '@prisma/client';

import { ArrParser } from './arr.parser';
import { AwlrParser } from './awlr.parser';

import { BadRequestException } from '@nestjs/common';
import { ExcelRows } from '../interfaces/excel-row.interface';

export class ParserFactory {
  static parse(importType: ImportType, rows: ExcelRows, filename?: string) {
    switch (importType) {
      case ImportType.ARR:
        return ArrParser.parse(rows);

      case ImportType.AWLR:
        return AwlrParser.parse(rows, filename);

      default:
        throw new BadRequestException('Parser belum tersedia.');
    }
  }
}
