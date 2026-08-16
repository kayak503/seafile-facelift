export type ConfigCheck = {
  key: 'SEAFILE_URL' | 'PUBLIC_SEAFILE_URL' | 'APP_URL' | 'SESSION_SECRET';
  status: 'valid' | 'missing' | 'invalid';
  message: string;
};

/** Public, non-secret configuration that may be serialized to the browser. */
export type PublicConfig = {
  appName: string;
  version: string;
  accent: string;
  publicSeafileUrl: string;
  appUrl: string;
  adminUrl: string;
  configured: boolean;
  source: 'environment' | 'missing';
  checks: ConfigCheck[];
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

function urlCheck(key: ConfigCheck['key'], value: string | undefined, description: string): ConfigCheck {
  if (!value?.trim()) return { key, status: 'missing', message: `${description} is not set.` };
  if (!normalizeHttpUrl(value))
    return {
      key,
      status: 'invalid',
      message: `${description} must be a complete HTTP or HTTPS URL without embedded credentials.`,
    };
  return { key, status: 'valid', message: `${description} has a valid URL format.` };
}

function secretCheck(value: string | undefined): ConfigCheck {
  const secret = value?.trim() || '';
  if (!secret)
    return {
      key: 'SESSION_SECRET',
      status: 'missing',
      message: 'No session secret is configured. Generate one with openssl rand -hex 32.',
    };
  const looksLikePlaceholder = /replace|change[ -]?me|example|your[ -]?secret/i.test(secret);
  const hasVariety = new Set(secret).size >= 8;
  if (secret.length < 32 || looksLikePlaceholder || !hasVariety)
    return {
      key: 'SESSION_SECRET',
      status: 'invalid',
      message:
        'The session secret is too short, predictable, or still a placeholder. It is random text—not JSON. Generate it with openssl rand -hex 32.',
    };
  return {
    key: 'SESSION_SECRET',
    status: 'valid',
    message: 'A sufficiently long, non-placeholder session secret is configured.',
  };
}

/**
 * Reads deployment-owned configuration without mutating process state.
 * Secret values remain on the server; only the nested `public` object is client-safe.
 */
export function getConfig() {
  const checks: ConfigCheck[] = [
    urlCheck('SEAFILE_URL', process.env.SEAFILE_URL, 'Internal Seafile address'),
    urlCheck('PUBLIC_SEAFILE_URL', process.env.PUBLIC_SEAFILE_URL, 'Public Seafile address'),
    urlCheck('APP_URL', process.env.APP_URL, 'Public Seafile-Facelift address'),
    secretCheck(process.env.SESSION_SECRET),
  ];
  const seafileUrl = normalizeHttpUrl(process.env.SEAFILE_URL);
  const publicSeafileUrl = normalizeHttpUrl(process.env.PUBLIC_SEAFILE_URL);
  const appUrl = normalizeHttpUrl(process.env.APP_URL);
  const appName = (process.env.APP_NAME || 'Seafile-Facelift').slice(0, 60);
  const version = (process.env.APP_VERSION || 'development').trim().slice(0, 32) || 'development';
  const candidateAccent = process.env.APP_ACCENT;
  const accent = /^#[0-9a-f]{6}$/i.test(candidateAccent || '') ? candidateAccent! : '#1a73e8';
  const configured = checks.every(check => check.status === 'valid');
  const source: PublicConfig['source'] = configured ? 'environment' : 'missing';
  const sessionSecret = checks.find(check => check.key === 'SESSION_SECRET')?.status === 'valid';
  return {
    seafileUrl,
    sessionSecret: sessionSecret ? process.env.SESSION_SECRET!.trim() : '',
    public: {
      appName,
      version,
      accent,
      publicSeafileUrl,
      appUrl,
      adminUrl: normalizeHttpUrl(process.env.ADMIN_URL, publicSeafileUrl ? `${publicSeafileUrl}/sys/` : ''),
      configured,
      source,
      checks,
    } satisfies PublicConfig,
  };
}

/** Returns validated server configuration or fails closed for API callers. */
export function requireConfig() {
  const config = getConfig();
  if (!config.public.configured) throw new Error('CONFIGURATION_MISSING');
  return config;
}
