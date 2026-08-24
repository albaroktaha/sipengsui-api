import { isAllowedGoogleDriveUrl } from './drive-url.util';

describe('isAllowedGoogleDriveUrl', () => {
  it('accepts secure Drive and Google Docs URLs', () => {
    expect(isAllowedGoogleDriveUrl('https://drive.google.com/file/d/example/view')).toBe(true);
    expect(isAllowedGoogleDriveUrl('https://docs.google.com/document/d/example/edit')).toBe(true);
  });

  it('rejects non-HTTPS, unknown hosts, and malformed URLs', () => {
    expect(isAllowedGoogleDriveUrl('http://drive.google.com/file/d/example/view')).toBe(false);
    expect(isAllowedGoogleDriveUrl('https://example.com/document')).toBe(false);
    expect(isAllowedGoogleDriveUrl('not-a-url')).toBe(false);
  });
});
