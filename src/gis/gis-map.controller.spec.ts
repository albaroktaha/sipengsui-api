import { PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { GisMapController } from './gis-map.controller';

describe('GisMapController protected original download', () => {
  it('exposes the file route only to authenticated GIS readers', () => {
    const handler = Object.getOwnPropertyDescriptor(
      GisMapController.prototype,
      'downloadFile',
    )?.value as object;

    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id/file');
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['gis.read']);
  });
});
