import { RiversService } from './rivers.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RiversService geometry validation', () => {
  it('rejects polygon geometry instead of storing it as a river', async () => {
    const riverCreate = jest.fn();
    const prisma = {
      river: { create: riverCreate },
    } as unknown as PrismaService;
    const service = new RiversService(prisma);

    await expect(
      service.create({
        watershedId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Sungai Uji',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [106, -6],
              [107, -6],
              [107, -5],
              [106, -5],
              [106, -6],
            ],
          ],
        },
      }),
    ).rejects.toThrow();

    expect(riverCreate).not.toHaveBeenCalled();
  });
});
