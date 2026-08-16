'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublicConfig } from '@/lib/config';
import { Icon } from './icons';
/** Seafile credential form; credentials are posted directly to the server-side login route. */
export function Login({ config }: { config: PublicConfig }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<'checking' | 'connected' | 'unavailable'>('checking');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then(response => response.json())
      .then(data => setConnection(data.seafile === 'connected' ? 'connected' : 'unavailable'))
      .catch(() => setConnection('unavailable'));
    return () => controller.abort();
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
      setBusy(false);
    }
  }
  return (
    <main className="auth-page" style={{ '--accent': config.accent } as React.CSSProperties}>
      <div className="auth-orb orb-one" />
      <div className="auth-orb orb-two" />
      <section className="auth-card">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Icon name="drive" />
          </div>
          <span>{config.appName}</span>
        </div>
        <div className="auth-copy">
          <p className="eyebrow">YOUR FILES, IN FOCUS</p>
          <h1>Welcome back</h1>
          <p className="auth-lead">Sign in with your existing Seafile account.</p>
        </div>
        <form onSubmit={submit}>
          <label>
            Email or username
            <input
              name="username"
              type="text"
              autoComplete="username"
              placeholder="you@example.com"
              required
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              required
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="primary wide" disabled={busy}>
            {busy ? <span className="spinner" /> : 'Sign in'}
          </button>
        </form>
        <div className={`security-note ${connection}`}>
          <span>●</span>
          {connection === 'checking'
            ? 'Checking Seafile connection…'
            : connection === 'connected'
              ? 'Seafile Web API connected'
              : 'Seafile is not reachable. Ask the deployment administrator to check the environment configuration.'}
        </div>
      </section>
      <footer className="auth-footer">
        Powered by Seafile · <a href={config.publicSeafileUrl}>Open standard interface</a>
      </footer>
    </main>
  );
}
