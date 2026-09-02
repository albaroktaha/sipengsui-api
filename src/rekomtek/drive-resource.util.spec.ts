import {
  isAllowedGoogleDriveUrl,
  parseGoogleDriveResource,
} from './drive-resource.util';

describe('Google Drive resource parsing', () => {
  it('parses a Drive blob link and preserves its resource key', () => {
    expect(
      parseGoogleDriveResource(
        'https://drive.google.com/file/d/file-123/view?usp=sharing&resourcekey=0-abc',
      ),
    ).toEqual({
      kind: 'BLOB',
      fileId: 'file-123',
      resourceKey: '0-abc',
    });
  });

  it('parses Google Workspace document resource kinds', () => {
    expect(
      parseGoogleDriveResource(
        'https://docs.google.com/spreadsheets/d/sheet-123/edit',
      ),
    ).toEqual({ kind: 'SHEET', fileId: 'sheet-123' });
    expect(
      parseGoogleDriveResource(
        'https://docs.google.com/presentation/d/slide-123/edit',
      ),
    ).toEqual({ kind: 'SLIDES', fileId: 'slide-123' });
    expect(
      parseGoogleDriveResource(
        'https://docs.google.com/document/d/doc-123/edit',
      ),
    ).toEqual({ kind: 'DOCUMENT', fileId: 'doc-123' });
  });

  it('rejects folders, shortcuts, URL shorteners, and missing file ids', () => {
    expect(
      parseGoogleDriveResource(
        'https://drive.google.com/drive/folders/folder-1',
      ),
    ).toBeNull();
    expect(
      parseGoogleDriveResource('https://drive.google.com/uc?id=file-1'),
    ).toBeNull();
    expect(parseGoogleDriveResource('https://bit.ly/file-1')).toBeNull();
    expect(
      parseGoogleDriveResource('https://docs.google.com/document/d//edit'),
    ).toBeNull();
  });

  it('allows only HTTPS Google Drive hosts with a recognizable file resource', () => {
    expect(
      isAllowedGoogleDriveUrl('https://drive.google.com/file/d/file-1/view'),
    ).toBe(true);
    expect(
      isAllowedGoogleDriveUrl('https://docs.google.com/document/d/doc-1/edit'),
    ).toBe(true);
    expect(
      isAllowedGoogleDriveUrl('http://drive.google.com/file/d/file-1/view'),
    ).toBe(false);
    expect(
      isAllowedGoogleDriveUrl('https://drive.googleusercontent.com/file-1'),
    ).toBe(false);
    expect(
      isAllowedGoogleDriveUrl(
        'https://drive.google.com/drive/folders/folder-1',
      ),
    ).toBe(false);
  });
});
