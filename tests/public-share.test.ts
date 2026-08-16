import { beforeEach, describe, expect, it } from 'vitest';
import {
  openPublicShare,
  passwordDigest,
  passwordsMatch,
  sealPublicShare,
  shareExpired,
} from '@/lib/public-share';

describe('Grapple public shares', () => {
  beforeEach(() => {
    process.env.SEAFILE_URL = 'https://seafile.test';
    process.env.APP_URL = 'https://grapple.test';
    process.env.SESSION_SECRET = 'a-secure-test-secret-that-is-long-enough';
  });
  it('seals link details without exposing the upstream URL', () => {
    const token = sealPublicShare({
      name: 'proposal.pdf',
      type: 'file',
      upstreamLink: 'https://seafile.test/d/abc',
      downloadLink: 'https://seafile.test/f/abc',
      canDownload: true,
    });
    expect(token).not.toContain('seafile');
    expect(openPublicShare(token)).toEqual(
      expect.objectContaining({ name: 'proposal.pdf', canDownload: true }),
    );
  });
  it('rejects tampered and expired shares and compares protected passwords', () => {
    const token = sealPublicShare({
      name: 'proposal.pdf',
      type: 'file',
      upstreamLink: 'https://seafile.test/d/abc',
      downloadLink: '',
      canDownload: false,
      expiresAt: '2020-01-01T00:00:00.000Z',
    });
    const tampered = `${token[0] === 'a' ? 'b' : 'a'}${token.slice(1)}`;
    expect(openPublicShare(tampered)).toBeNull();
    expect(shareExpired(openPublicShare(token)!)).toBe(true);
    expect(passwordsMatch(passwordDigest('correct'), passwordDigest('correct'))).toBe(true);
    expect(passwordsMatch(passwordDigest('wrong'), passwordDigest('correct'))).toBe(false);
  });
});
