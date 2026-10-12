import { isPrivateGisMapAssetRequest } from './gis-static-assets.policy';

describe('isPrivateGisMapAssetRequest', () => {
  it('matches GIS upload URLs without blocking unrelated uploads or lookalike paths', () => {
    expect(isPrivateGisMapAssetRequest('/uploads/gis-maps/file.kml')).toBe(
      true,
    );
    expect(isPrivateGisMapAssetRequest('/uploads/GIS-MAPS/file.kmz')).toBe(
      true,
    );
    expect(isPrivateGisMapAssetRequest('/uploads/avatars/user.png')).toBe(
      false,
    );
    expect(
      isPrivateGisMapAssetRequest('/uploads/gis-maps-archive/file.kml'),
    ).toBe(false);
  });

  it('blocks encoded separators and backslash variants that normalize into the GIS directory', () => {
    expect(isPrivateGisMapAssetRequest('/uploads/gis-maps%2Ffile.kml')).toBe(
      true,
    );
    expect(isPrivateGisMapAssetRequest('/uploads%5Cgis-maps%5Cfile.kml')).toBe(
      true,
    );
  });
});
