import { NewsStorageService } from './news-storage.service';

const STORAGE_ENV_KEYS = [
  'NEWS_STORAGE_DRIVER',
  'NEWS_STORAGE_PUBLIC_URL',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_PUBLIC_BASE_URL',
] as const;

const originalEnvironment = Object.fromEntries(
  STORAGE_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof STORAGE_ENV_KEYS)[number], string | undefined>;

function clearStorageEnvironment(): void {
  for (const key of STORAGE_ENV_KEYS) delete process.env[key];
}

function restoreStorageEnvironment(): void {
  clearStorageEnvironment();
  for (const key of STORAGE_ENV_KEYS) {
    const value = originalEnvironment[key];
    if (value !== undefined) process.env[key] = value;
  }
}

describe('NewsStorageService configuration', () => {
  beforeEach(clearStorageEnvironment);
  afterEach(restoreStorageEnvironment);

  it('defaults to local storage without requiring object-storage credentials', () => {
    expect(() => new NewsStorageService()).not.toThrow();
  });

  it('rejects an unsupported storage driver', () => {
    process.env.NEWS_STORAGE_DRIVER = 'google-cloud';

    expect(() => new NewsStorageService()).toThrow(
      'NEWS_STORAGE_DRIVER tidak didukung: google-cloud',
    );
  });

  it('fails fast when Cloudflare R2 configuration is incomplete', () => {
    process.env.NEWS_STORAGE_DRIVER = 'r2';

    expect(() => new NewsStorageService()).toThrow(
      'Konfigurasi Cloudflare R2 belum lengkap: S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BASE_URL, S3_ENDPOINT.',
    );
  });

  it('accepts a complete Cloudflare R2 configuration', () => {
    process.env.NEWS_STORAGE_DRIVER = 'r2';
    process.env.S3_ENDPOINT = 'https://account-id.r2.cloudflarestorage.com';
    process.env.S3_REGION = 'auto';
    process.env.S3_BUCKET = 'sipengsui-news';
    process.env.S3_ACCESS_KEY_ID = 'test-access-key';
    process.env.S3_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.test';

    expect(() => new NewsStorageService()).not.toThrow();
  });
});
