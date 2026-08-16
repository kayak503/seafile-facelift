import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getConfig } from '@/lib/config';

const keys = ['SEAFILE_URL', 'PUBLIC_SEAFILE_URL', 'APP_URL', 'SESSION_SECRET', 'APP_VERSION'] as const;
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));

describe('deployment configuration diagnostics', () => {
  beforeEach(() => keys.forEach(key => delete process.env[key]));
  afterEach(() =>
    keys.forEach(key => {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }),
  );

  it('reports each valid deployment value independently', () => {
    process.env.SEAFILE_URL = 'http://192.168.1.115:8081';
    process.env.PUBLIC_SEAFILE_URL = 'https://files.example.com';
    process.env.APP_URL = 'https://drive.example.com';
    process.env.SESSION_SECRET = '95e5d52ee89964f3483a551c3d6557fe52438264b12ca979e7110b921d930c42';

    const config = getConfig();
    expect(config.public.configured).toBe(true);
    expect(config.public.checks).toHaveLength(4);
    expect(config.public.checks.every(check => check.status === 'valid')).toBe(true);
  });

  it('keeps valid URLs visible while identifying an invalid secret', () => {
    process.env.SEAFILE_URL = 'http://192.168.1.115:8081';
    process.env.PUBLIC_SEAFILE_URL = 'https://files.example.com';
    process.env.APP_URL = 'https://drive.example.com';
    process.env.SESSION_SECRET = 'replace-with-at-least-32-random-characters';

    const checks = getConfig().public.checks;
    expect(checks.filter(check => check.key.endsWith('URL')).map(check => check.status)).toEqual([
      'valid',
      'valid',
      'valid',
    ]);
    expect(checks.find(check => check.key === 'SESSION_SECRET')).toMatchObject({ status: 'invalid' });
    expect(getConfig().public.configured).toBe(false);
  });

  it('distinguishes missing values from malformed URLs', () => {
    process.env.SEAFILE_URL = '192.168.1.115:8081';
    const checks = getConfig().public.checks;
    expect(checks.find(check => check.key === 'SEAFILE_URL')).toMatchObject({ status: 'invalid' });
    expect(checks.find(check => check.key === 'APP_URL')).toMatchObject({ status: 'missing' });
  });

  it('exposes the image build version with a development fallback', () => {
    expect(getConfig().public.version).toBe('development');
    process.env.APP_VERSION = '1.4.2';
    expect(getConfig().public.version).toBe('1.4.2');
  });
});
