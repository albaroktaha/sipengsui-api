import { Injectable } from '@nestjs/common';

import { ExcelHelper } from '../helpers/excel.helper';
import { ExcelPreview } from '../interfaces/excel-preview.interface';

import { ObservationValidator } from '../validators/observation.validator';

import { ImportTypeHelper } from '../helpers/import-type.helper';
import { ParserFactory } from '../parsers/parser.factory';

@Injectable()
export class ImportPreviewService {
  preview(file: Express.Multer.File): ExcelPreview {
    const excel = ExcelHelper.read(file);

    const importType = ImportTypeHelper.detect(excel.rows);

    const parser = ParserFactory.parse(
      importType,
      excel.rows,
      file.originalname,
    );

    const rows = ObservationValidator.validate(parser.observations);

    return {
      filename: file.originalname,

      sheet: excel.sheetName,

      totalRows: excel.rows.length,

      importType,

      metadata: parser.metadata,

      summary: {
        totalRows: rows.length,
        validRows: rows.filter((x) => x.valid).length,
        invalidRows: rows.filter((x) => !x.valid).length,
      },

      rows,
    };
  }
}
