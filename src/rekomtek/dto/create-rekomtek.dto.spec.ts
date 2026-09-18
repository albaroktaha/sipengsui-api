import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRekomtekDto } from './create-rekomtek.dto';

const basePayload = {
  nomor: 'REK-20260914-001',
  judul: 'Pemanfaatan Air Permukaan',
  jenisPermohonan: 'IZIN_BARU',
  createdBy: 'Pemohon Contoh',
};

async function validateJenis(jenis: string) {
  return validate(
    plainToInstance(CreateRekomtekDto, {
      ...basePayload,
      jenis,
    }),
  );
}

describe('CreateRekomtekDto jenis', () => {
  it.each(['APU', 'PLTA', 'PLTM', 'GALIAN_C'])(
    'accepts the supported recommendation type %s',
    async (jenis) => {
      await expect(validateJenis(jenis)).resolves.toHaveLength(0);
    },
  );

  it.each(['AMDES', 'IRIGASI', 'AIR_BERSIH', 'OTHER'])(
    'rejects the retired recommendation type %s',
    async (jenis) => {
      const errors = await validateJenis(jenis);
      expect(errors.some((error) => error.property === 'jenis')).toBe(true);
    },
  );
});
