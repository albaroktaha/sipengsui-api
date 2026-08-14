import { TurnstileService } from './turnstile.service';

describe('TurnstileService', () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
  let service: TurnstileService;
  let capturedBody = '';

  beforeEach(() => {
    service = new TurnstileService();
    global.fetch = fetchMock;
    fetchMock.mockReset();
    capturedBody = '';
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.TURNSTILE_SECRET_KEY;
    } else {
      process.env.TURNSTILE_SECRET_KEY = originalSecret;
    }
  });

  it('fails closed when the secret is missing', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;

    await expect(service.verify('token')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when the token is missing', async () => {
    await expect(service.verify('')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns true for a successful Cloudflare response', async () => {
    fetchMock.mockImplementation((_input, init) => {
      capturedBody = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    await expect(service.verify('token')).resolves.toBe(true);
    const body = new URLSearchParams(capturedBody);
    expect(body.get('secret')).toBe('test-secret');
    expect(body.get('response')).toBe('token');
  });

  it('returns false for an unsuccessful Cloudflare response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
    });

    await expect(service.verify('token')).resolves.toBe(false);
  });

  it('returns false for a non-success HTTP response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(service.verify('token')).resolves.toBe(false);
  });

  it('returns false when Cloudflare verification fails to connect', async () => {
    fetchMock.mockRejectedValue(new Error('network failure'));

    await expect(service.verify('token')).resolves.toBe(false);
  });
});
