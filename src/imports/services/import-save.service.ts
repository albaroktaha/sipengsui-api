import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

import { ConfirmImportDto } from '../dto/confirm-import.dto';
import { ObservationImportDto } from '../dto/observation-import.dto';

import { ImportObservationService } from './import-observation.service';
import { ImportMetadata, ImportSummary } from '../interfaces/draft.interface';
import { ImportResult } from '../interfaces/import-result.interface';

@Injectable()
export class ImportSaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly importObservationService: ImportObservationService,
  ) {}

  async confirm(dto: ConfirmImportDto) {
    return this.prisma.$transaction(async (tx) => {
      // ===========================
      // Ambil Draft
      // ===========================
      const draft = await tx.importDraft.findUnique({
        where: {
          id: dto.draftId,
        },
      });

      if (!draft) {
        throw new NotFoundException('Import Draft tidak ditemukan');
      }

      // ===========================
      // Ambil Station
      // ===========================
      const station = await tx.station.findUnique({
        where: {
          id: dto.stationId,
        },
      });

      if (!station) {
        throw new NotFoundException('Station tidak ditemukan');
      }

      const metadata = draft.metadata as unknown as ImportMetadata;

      // ===========================
      // Validasi Kode Station
      // ===========================
      if (metadata.stationCode !== station.code) {
        throw new BadRequestException(
          `Kode station pada file (${metadata.stationCode}) tidak sesuai dengan station yang dipilih (${station.code}).`,
        );
      }

      // ===========================
      // Validasi Type
      // ===========================
      if (station.type !== draft.importType) {
        throw new BadRequestException(
          `Station harus bertipe ${draft.importType}.`,
        );
      }

      const rows = draft.rows as unknown as ObservationImportDto[];

      const summary = draft.summary as unknown as ImportSummary;

      // ===========================
      // Simpan History
      // ===========================
      const history = await this.createHistory(tx, dto, draft, summary);

      // ===========================
      // Simpan Observation
      // ===========================
      const observationResult = await this.importObservationService.save(
        tx,
        dto.importType,
        history.id,
        dto.stationId,
        rows,
      );

      await this.updateHistoryResult(tx, history.id, observationResult);

      // ===========================
      // Simpan Error
      // ===========================
      await this.saveErrors(tx, history.id, rows);

      // ===========================
      // Finish History
      // ===========================
      await this.finishHistory(tx, history.id);

      // ===========================
      // Hapus Draft
      // ===========================
      await tx.importDraft.delete({
        where: {
          id: dto.draftId,
        },
      });

      return {
        success: true,
        historyId: history.id,
        totalRows: summary.totalRows,
        successRows: observationResult.insertedRows,
        duplicateRows: observationResult.duplicateRows,
        failedRows: summary.invalidRows,
      };
    });
  }

  private async createHistory(
    tx: Prisma.TransactionClient,
    dto: ConfirmImportDto,
    draft: {
      filename: string;
    },
    summary: ImportSummary,
  ) {
    return tx.importHistory.create({
      data: {
        filename: draft.filename,
        stationId: dto.stationId,
        importType: dto.importType,
        totalRows: summary.totalRows,
        successRows: summary.validRows,
        failedRows: summary.invalidRows,
        importedBy: dto.importedBy,
        startedAt: new Date(),
      },
    });
  }

  private async updateHistoryResult(
    tx: Prisma.TransactionClient,
    historyId: string,
    result: ImportResult,
  ) {
    return tx.importHistory.update({
      where: {
        id: historyId,
      },
      data: {
        successRows: result.insertedRows,
        duplicateRows: result.duplicateRows,
      },
    });
  }

  private async saveErrors(
    tx: Prisma.TransactionClient,
    historyId: string,
    rows: ObservationImportDto[],
  ) {
    for (const row of rows) {
      if (row.valid) {
        continue;
      }

      for (const message of row.errors) {
        await tx.importError.create({
          data: {
            historyId,
            rowNumber: row.row,
            columnName: null,
            message,
          },
        });
      }
    }
  }

  private async finishHistory(tx: Prisma.TransactionClient, historyId: string) {
    return tx.importHistory.update({
      where: {
        id: historyId,
      },
      data: {
        finishedAt: new Date(),
      },
    });
  }
}
