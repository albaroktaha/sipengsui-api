import { Injectable } from '@nestjs/common';
import { ImportType, Prisma } from '@prisma/client';

import { IMPORT_SOURCE } from '../constants/import.constant';
import { ObservationImportDto } from '../dto/observation-import.dto';

type ObservationDetailDto = NonNullable<
  ObservationImportDto['details']
>[number];

@Injectable()
export class ImportObservationService {
  async save(
    tx: Prisma.TransactionClient,
    importType: ImportType,
    historyId: string,
    stationId: string,
    rows: ObservationImportDto[],
  ) {
    if (importType === ImportType.ARR) {
      return this.saveArrObservations(tx, historyId, stationId, rows);
    }

    return this.saveAwlrObservations(tx, historyId, stationId, rows);
  }

  private async saveArrObservations(
    tx: Prisma.TransactionClient,
    historyId: string,
    stationId: string,
    rows: ObservationImportDto[],
  ) {
    const observations: Prisma.ObservationCreateManyInput[] = [];

    let duplicateRows = 0;

    for (const row of rows) {
      if (!row.valid) {
        continue;
      }

      const exists = await tx.observation.findUnique({
        where: {
          stationId_observationDate: {
            stationId,
            observationDate: new Date(row.observationDate),
          },
        },
      });

      if (exists) {
        duplicateRows++;

        await tx.importError.create({
          data: {
            historyId,
            rowNumber: row.row,
            columnName: 'observationDate',
            message: 'Data observasi sudah ada.',
          },
        });

        continue;
      }

      observations.push({
        stationId,

        observationDate: new Date(row.observationDate),

        rainfall: this.toDecimal(row.rainfall),

        waterLevel: this.toDecimal(row.waterLevel),

        discharge: this.toDecimal(row.discharge),

        observerName: row.observerName ?? 'IMPORT',

        source: IMPORT_SOURCE.EXCEL,

        note: row.note,

        importHistoryId: historyId,
      });
    }

    if (observations.length > 0) {
      await tx.observation.createMany({
        data: observations,
      });
    }

    return {
      insertedRows: observations.length,
      duplicateRows,
    };
  }

  private async saveAwlrObservations(
    tx: Prisma.TransactionClient,
    historyId: string,
    stationId: string,
    rows: ObservationImportDto[],
  ) {
    let insertedRows = 0;
    let duplicateRows = 0;

    for (const row of rows) {
      if (!row.valid) {
        continue;
      }

      const exists = await tx.observation.findUnique({
        where: {
          stationId_observationDate: {
            stationId,
            observationDate: new Date(row.observationDate),
          },
        },
      });

      if (exists) {
        duplicateRows++;

        await tx.importError.create({
          data: {
            historyId,
            rowNumber: row.row,
            columnName: 'observationDate',
            message: 'Data observasi sudah ada.',
          },
        });

        continue;
      }

      const observation = await tx.observation.create({
        data: {
          stationId,
          observationDate: new Date(row.observationDate),
          rainfall: this.toDecimal(row.rainfall),
          waterLevel: this.toDecimal(row.waterLevel),
          discharge: this.toDecimal(row.discharge),
          observerName: row.observerName ?? 'IMPORT',
          source: IMPORT_SOURCE.EXCEL,
          note: row.note,
          importHistoryId: historyId,
        },
      });

      insertedRows++;

      if (row.details?.length) {
        const details = row.details.map((detail: ObservationDetailDto) => ({
          observationId: observation.id,
          observationTime: detail.observationTime,
          waterLevel: this.toDecimal(detail.waterLevel),
          discharge: this.toDecimal(detail.discharge),
          note: detail.note,
        }));

        await tx.observationDetail.createMany({
          data: details,
        });
      }
    }

    return {
      insertedRows,
      duplicateRows,
    };
  }

  private toDecimal(value?: number | null): Prisma.Decimal | null {
    if (value === undefined || value === null) {
      return null;
    }

    return new Prisma.Decimal(value);
  }
}
