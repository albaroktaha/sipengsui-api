import {
  DriveAccessValidator,
  type DriveValidationPolicy,
} from './drive-access.service';

describe('DriveAccessValidator', () => {
  const policy: DriveValidationPolicy = {
    allowedMimeTypes: ['application/pdf'],
    maxFileSize: 1024,
    allowedExportFormats: ['pdf'],
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts an anonymously accessible blob with an allowed MIME type and size', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('%PDF-1.7', {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-length': '8',
        },
      }),
    );

    const result = await new DriveAccessValidator().validate(
      'https://drive.google.com/file/d/file-123/view',
      policy,
    );

    expect(result).toMatchObject({ status: 'VALID', code: 'ACCESSIBLE' });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'drive.google.com/uc?export=download&id=file-123',
      ),
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('accepts a PDF when Google Drive reports application/octet-stream', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('%PDF-1.7', {
        status: 200,
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': '8',
        },
      }),
    );

    await expect(
      new DriveAccessValidator().validate(
        'https://drive.google.com/file/d/pdf-123/view',
        policy,
      ),
    ).resolves.toMatchObject({
      status: 'VALID',
      code: 'ACCESSIBLE',
      mimeType: 'application/pdf',
      size: 8,
    });
  });

  it('does not wait forever when a generic binary response exceeds the sample limit', async () => {
    const payload = Buffer.concat([
      Buffer.from('%PDF-1.7'),
      Buffer.alloc(128 * 1024),
    ]);
    const sampleResponse = {
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(payload);
        },
        cancel() {
          return new Promise<void>(() => undefined);
        },
      }),
    } as Response;
    const response = {
      status: 200,
      ok: true,
      headers: new Headers({
        'content-type': 'application/octet-stream',
        'content-length': String(payload.length),
      }),
      clone: () => sampleResponse,
    } as unknown as Response;
    jest.spyOn(global, 'fetch').mockResolvedValue(response);

    const timeout = Symbol('timeout');
    const result = await Promise.race([
      new DriveAccessValidator().validate(
        'https://drive.google.com/file/d/pdf-large/view',
        { ...policy, maxFileSize: 1024 * 1024 },
      ),
      new Promise<typeof timeout>((resolve) =>
        setTimeout(() => resolve(timeout), 250),
      ),
    ]);

    expect(result).not.toBe(timeout);
    expect(result).toMatchObject({
      status: 'VALID',
      code: 'ACCESSIBLE',
      mimeType: 'application/pdf',
    });
  });

  it('rejects an access wall even when Google returns HTTP 200 HTML', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('<html>You need access to this file</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(
      new DriveAccessValidator().validate(
        'https://drive.google.com/file/d/private-123/view',
        policy,
      ),
    ).resolves.toMatchObject({
      status: 'INVALID',
      code: 'DRIVE_PERMISSION_REQUIRED',
    });
  });

  it('reports a Google login redirect as a permission problem', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://accounts.google.com/signin/v2/identifier',
        },
      }),
    );

    await expect(
      new DriveAccessValidator().validate(
        'https://drive.google.com/file/d/private-redirect/view',
        policy,
      ),
    ).resolves.toMatchObject({
      status: 'INVALID',
      code: 'DRIVE_PERMISSION_REQUIRED',
    });
  });

  it('returns Pending Check for transient network failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));

    await expect(
      new DriveAccessValidator().validate(
        'https://drive.google.com/file/d/file-123/view',
        policy,
      ),
    ).resolves.toMatchObject({
      status: 'PENDING_CHECK',
      code: 'DRIVE_UNREACHABLE',
    });
  });

  it('uses the configured export format for a Google Sheet', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('a,b\n1,2', {
        status: 200,
        headers: {
          'content-type': 'text/csv',
          'content-length': '7',
        },
      }),
    );

    await expect(
      new DriveAccessValidator().validate(
        'https://docs.google.com/spreadsheets/d/sheet-123/edit?resourcekey=0-key',
        {
          ...policy,
          allowedMimeTypes: ['text/csv'],
          allowedExportFormats: ['csv'],
        },
      ),
    ).resolves.toMatchObject({ status: 'VALID', code: 'ACCESSIBLE' });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/spreadsheets/d/sheet-123/export?format=csv'),
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        headers: expect.objectContaining({
          'X-Goog-Drive-Resource-Keys': 'sheet-123/0-key',
        }),
      }),
    );
  });
});
