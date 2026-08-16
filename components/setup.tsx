'use client';
import { useEffect, useState } from 'react';
import type { PublicConfig } from '@/lib/config';
import { Icon } from './icons';

/** Read-only deployment guidance shown only when required environment variables are absent. */
export function Setup({ config }: { config: PublicConfig }) {
  const seafileUrlValid = config.checks.find(check => check.key === 'SEAFILE_URL')?.status === 'valid';
  const [seafileConnection, setSeafileConnection] = useState<
    'checking' | 'connected' | 'unavailable' | 'not-configured'
  >(seafileUrlValid ? 'checking' : 'not-configured');

  useEffect(() => {
    if (!seafileUrlValid) return;
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal, cache: 'no-store' })
      .then(response => response.json())
      .then(data => setSeafileConnection(data.seafile === 'connected' ? 'connected' : 'unavailable'))
      .catch(error => {
        if (error instanceof Error && error.name !== 'AbortError') setSeafileConnection('unavailable');
      });
    return () => controller.abort();
  }, [seafileUrlValid]);

  return (
    <main className="setup-page" style={{ '--accent': config.accent } as React.CSSProperties}>
      <header className="setup-top">
        <div className="drive-wordmark">
          <div className="mini-mark">
            <Icon name="drive" />
          </div>
          <span>{config.appName}</span>
        </div>
        <span>Deployment setup required</span>
      </header>
      <div className="setup-layout">
        <aside className="setup-guide">
          <p className="step-label">ADMINISTRATOR ACTION REQUIRED</p>
          <h1>Connect your Seafile server</h1>
          <p>
            One or more required environment values are missing or invalid. Each check below is evaluated
            independently so you can fix only what is wrong. For security, values cannot be changed here.
          </p>
          <div className="need-card">
            <span className="need-number">1</span>
            <div>
              <strong>Edit Docker Compose or your environment file</strong>
              <p>
                Add the variables shown on this page to the app container. Do not put them in Seafile itself.
              </p>
            </div>
          </div>
          <div className="need-card">
            <span className="need-number">2</span>
            <div>
              <strong>Create a private session secret</strong>
              <p>
                Run <code>openssl rand -hex 32</code> on the Docker host and use its output as{' '}
                <code>SESSION_SECRET</code>.
              </p>
            </div>
          </div>
          <div className="need-card">
            <span className="need-number">3</span>
            <div>
              <strong>Restart the app container</strong>
              <p>
                After the environment is updated, recreate or restart this container. The sign-in screen will
                replace this page automatically.
              </p>
            </div>
          </div>
        </aside>
        <section className="connection-card setup-instructions">
          <div className="connection-heading">
            <div className="connection-icon">
              <Icon name="drive" />
            </div>
            <div>
              <p>ENVIRONMENT CONFIGURATION</p>
              <h2>Required deployment values</h2>
            </div>
          </div>
          <div className="managed-note">
            <span>i</span>
            <p>
              This page is intentionally read-only. Configuration is accepted only when the process starts.
            </p>
          </div>
          <div className="config-diagnostics" aria-live="polite">
            {config.checks.map(check => {
              const isSeafile = check.key === 'SEAFILE_URL' && check.status === 'valid';
              const status = isSeafile
                ? seafileConnection === 'checking'
                  ? 'checking'
                  : seafileConnection === 'connected'
                    ? 'valid'
                    : 'invalid'
                : check.status;
              const message = isSeafile
                ? seafileConnection === 'checking'
                  ? 'URL format is valid. Checking whether Seafile responds…'
                  : seafileConnection === 'connected'
                    ? 'URL format is valid and Seafile responded successfully.'
                    : 'URL format is valid, but Seafile did not respond. Check the local IP, port, and firewall.'
                : check.message;
              return (
                <div className={`config-diagnostic ${status}`} key={check.key}>
                  <span className="config-diagnostic-icon">
                    {status === 'checking' ? (
                      <span className="spinner dark" />
                    ) : (
                      <Icon name={status === 'valid' ? 'check' : 'close'} />
                    )}
                  </span>
                  <span>
                    <strong>{check.key}</strong>
                    <small>{message}</small>
                  </span>
                </div>
              );
            })}
          </div>
          <h3>Docker Compose</h3>
          <pre>
            <code>{`services:\n  seafile-facelift:\n    image: ghcr.io/kayak503/seafile-facelift:latest\n    container_name: seafile-facelift\n    restart: unless-stopped\n    environment:\n      SEAFILE_URL: http://192.168.1.115:8081\n      PUBLIC_SEAFILE_URL: https://seafile.grapple.link\n      APP_URL: https://drive.grapple.link\n      SESSION_SECRET: <output-of-openssl-rand-hex-32>\n      APP_NAME: Seafile-Facelift\n      APP_ACCENT: '#2563EB'\n      ADMIN_URL: https://seafile.grapple.link/profile/\n    ports:\n      - "8082:3000"`}</code>
          </pre>
          <h3>Environment file</h3>
          <pre>
            <code>{`SEAFILE_URL=http://192.168.1.115:8081\nPUBLIC_SEAFILE_URL=https://seafile.grapple.link\nAPP_URL=https://drive.grapple.link\nSESSION_SECRET=<output-of-openssl-rand-hex-32>`}</code>
          </pre>
          <dl className="env-reference">
            <div>
              <dt>SEAFILE_URL</dt>
              <dd>
                Internal server-to-server address, such as a local IP and port reachable from the container.
              </dd>
            </div>
            <div>
              <dt>PUBLIC_SEAFILE_URL</dt>
              <dd>The Seafile address users can open in their browser.</dd>
            </div>
            <div>
              <dt>APP_URL</dt>
              <dd>The public address of this drive app.</dd>
            </div>
            <div>
              <dt>SESSION_SECRET</dt>
              <dd>
                Random text of at least 32 characters—not JSON. Generate it with{' '}
                <code>openssl rand -hex 32</code> and never expose it to the browser.
              </dd>
            </div>
          </dl>
          <p className="setup-restart">
            After restarting, refresh this page. No API key is required; users sign in with their normal
            Seafile accounts.
          </p>
        </section>
      </div>
    </main>
  );
}
