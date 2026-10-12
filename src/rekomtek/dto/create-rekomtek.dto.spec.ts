import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRekomtekDto } from './create-rekomtek.dto';
import { UpdateRekomtekDto } from './update-rekomtek.dto';

const basePayload = {
  nomor: 'REK-20260914-001',
  judul: 'Pemanfaatan Air Permukaan',
  jenisPermohonan: 'IZIN_BARU',
  jenisSumberAir: 'SUNGAI',
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

async function validateJenisPermohonan(jenisPermohonan: string) {
  return validate(
    plainToInstance(CreateRekomtekDto, {
      ...basePayload,
      jenis: 'APU',
      jenisPermohonan,
    }),
  );
}

async function validateJenisSumberAir(jenisSumberAir: string | undefined) {
  return validate(
    plainToInstance(CreateRekomtekDto, {
      ...basePayload,
      jenis: 'APU',
      jenisSumberAir,
    }),
  );
}

describe('CreateRekomtekDto jenis', () => {
  it.each([
    'APU',
    'PLTA_PLTM',
    'PEMINDAHAN_ALUR_SUNGAI',
    'PERSETUJUAN_KONSTRUKSI_DI_BADAN_SUNGAI',
    'PERTAMBANGAN_MINERAL_BUKAN_LOGAM_DAN_BATUAN_DI_SUNGAI',
  ])('accepts the supported recommendation type %s', async (jenis) => {
    await expect(validateJenis(jenis)).resolves.toHaveLength(0);
  });

  it.each([
    'PLTA',
    'PLTM',
    'GALIAN_C',
    'AMDES',
    'IRIGASI',
    'AIR_BERSIH',
    'OTHER',
  ])('rejects the retired recommendation type %s', async (jenis) => {
    const errors = await validateJenis(jenis);
    expect(errors.some((error) => error.property === 'jenis')).toBe(true);
  });
});

describe('CreateRekomtekDto jenisPermohonan', () => {
  it.each(['IZIN_BARU', 'PERPANJANGAN', 'PERSETUJUAN_TEKNIS'])(
    'accepts the supported request type %s',
    async (jenisPermohonan) => {
      await expect(
        validateJenisPermohonan(jenisPermohonan),
      ).resolves.toHaveLength(0);
    },
  );

  it('rejects an unsupported request type', async () => {
    const errors = await validateJenisPermohonan('UNKNOWN');
    expect(errors.some((error) => error.property === 'jenisPermohonan')).toBe(
      true,
    );
  });
});

describe('CreateRekomtekDto jenisSumberAir', () => {
  it.each([
    'SUNGAI',
    'DANAU',
    'EMBUNG',
    'SALURAN_IRIGASI',
    'SALURAN_ALAMI_PEMBUANG',
    'MATA_AIR',
    'TAMPUNGAN_LAINNYA',
  ])('accepts supported water source %s', async (jenisSumberAir) => {
    await expect(validateJenisSumberAir(jenisSumberAir)).resolves.toHaveLength(
      0,
    );
  });

  it.each(['UNKNOWN', ''])(
    'rejects unsupported water source %s',
    async (value) => {
      const errors = await validateJenisSumberAir(value);
      expect(errors.some((error) => error.property === 'jenisSumberAir')).toBe(
        true,
      );
    },
  );

  it('requires a water source', async () => {
    const errors = await validateJenisSumberAir(undefined);
    expect(errors.some((error) => error.property === 'jenisSumberAir')).toBe(
      true,
    );
  });
});

describe('UpdateRekomtekDto legacy recommendation types', () => {
  it.each([
    'PLTA',
    'PLTM',
    'GALIAN_C',
    'AMDES',
    'IRIGASI',
    'AIR_BERSIH',
    'OTHER',
  ])(
    'continues to accept existing records with legacy type %s',
    async (jenis) => {
      const dto = plainToInstance(UpdateRekomtekDto, { jenis });
      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );
});
