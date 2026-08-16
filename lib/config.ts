/** Public, non-secret configuration that may be serialized to the browser. */
export type PublicConfig = {
  appName: string;
  accent: string;
  publicSeafileUrl: string;
  appUrl: string;
  adminUrl: string;
  configured: boolean;
  source: 'environment' | 'missing';
};

export function normalizeHttpUrl(value: string | undefined, fallback = '') {
  if (!value) return fallback;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return fallback;
    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

/**
 * Reads deployment-owned configuration without mutating process state.
 * Secret values remain on the server; only the nested `public` object is client-safe.
 */
export function getConfig() {
  const environmentConfigured = Boolean(
    process.env.SEAFILE_URL && process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32,
  );
  const source: PublicConfig['source'] = environmentConfigured ? 'environment' : 'missing';
  const seafileUrl = normalizeHttpUrl(process.env.SEAFILE_URL);
  const publicSeafileUrl = normalizeHttpUrl(process.env.PUBLIC_SEAFILE_URL, seafileUrl);
  const appUrl = normalizeHttpUrl(process.env.APP_URL, 'http://localhost:3000');
  const appName = (process.env.APP_NAME || 'Grapple Drive').slice(0, 60);
  const candidateAccent = process.env.APP_ACCENT;
  const accent = /^#[0-9a-f]{6}$/i.test(candidateAccent || '') ? candidateAccent! : '#1a73e8';
  const configured = Boolean(seafileUrl && environmentConfigured);
  return {
    seafileUrl,
    sessionSecret: environmentConfigured ? process.env.SESSION_SECRET! : '',
    public: {
      appName,
      accent,
      publicSeafileUrl,
      appUrl,
      adminUrl: normalizeHttpUrl(process.env.ADMIN_URL, publicSeafileUrl ? `${publicSeafileUrl}/sys/` : ''),
      configured,
      source,
    } satisfies PublicConfig,
  };
}

/** Returns validated server configuration or fails closed for API callers. */
export function requireConfig() {
  const config = getConfig();
  if (!config.public.configured) throw new Error('CONFIGURATION_MISSING');
  return config;
}
