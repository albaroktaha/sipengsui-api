import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryRekomtekDto } from './query-rekomtek.dto';

describe('QueryRekomtekDto', () => {
  it('accepts Persetujuan Teknis as a jenisPermohonan filter', async () => {
    const dto = plainToInstance(QueryRekomtekDto, {
      jenisPermohonan: 'PERSETUJUAN_TEKNIS',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an unsupported jenisPermohonan value', async () => {
    const dto = plainToInstance(QueryRekomtekDto, {
      jenisPermohonan: 'UNKNOWN',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'jenisPermohonan')).toBe(
      true,
    );
  });
});
