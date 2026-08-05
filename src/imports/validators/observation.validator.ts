import { ObservationImportDto } from '../dto/observation-import.dto';

export class ObservationValidator {
  static validate(rows: ObservationImportDto[]): ObservationImportDto[] {
    return rows.map((row) => {
      row.valid = true;
      row.errors = [];

      // ==========================
      // Observation Date
      // ==========================

      if (!row.observationDate) {
        row.valid = false;
        row.errors.push('Tanggal observasi wajib diisi');
      }

      // ==========================
      // Rainfall
      // ==========================

      if (row.rainfall != null && row.rainfall < 0) {
        row.valid = false;
        row.errors.push('Curah hujan tidak boleh negatif');
      }

      // ==========================
      // Water Level
      // ==========================

      if (row.waterLevel != null && row.waterLevel < 0) {
        row.valid = false;
        row.errors.push('Tinggi muka air tidak boleh negatif');
      }

      // ==========================
      // Discharge
      // ==========================

      if (row.discharge != null && row.discharge < 0) {
        row.valid = false;
        row.errors.push('Debit tidak boleh negatif');
      }

      // ==========================
      // Observation Detail (AWLR)
      // ==========================

      if (row.details?.length) {
        let hasValue = false;

        for (const detail of row.details) {
          if (detail.waterLevel !== undefined && detail.waterLevel !== null) {
            hasValue = true;

            if (detail.waterLevel < 0) {
              row.valid = false;
              row.errors.push(
                `Tinggi muka air jam ${detail.observationTime} tidak boleh negatif`,
              );
            }
          }

          if (
            detail.discharge !== undefined &&
            detail.discharge !== null &&
            detail.discharge < 0
          ) {
            row.valid = false;
            row.errors.push(
              `Debit jam ${detail.observationTime} tidak boleh negatif`,
            );
          }
        }

        if (!hasValue) {
          row.valid = false;
          row.errors.push('Minimal harus ada satu pembacaan tinggi muka air.');
        }
      }

      return row;
    });
  }
}
