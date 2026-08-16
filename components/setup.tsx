import type { PublicConfig } from '@/lib/config';
import { Icon } from './icons';

/** Read-only deployment guidance shown only when required environment variables are absent. */
export function Setup({ config }: { config: PublicConfig }) {
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
            This deployment is missing required environment variables. For security, server addresses and
            session secrets cannot be entered or changed in the browser.
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
          <h3>Docker Compose</h3>
          <pre>
            <code>{`services:\n  grapple-drive:\n    environment:\n      SEAFILE_URL: http://seafile\n      PUBLIC_SEAFILE_URL: https://seafile.example.com\n      APP_URL: https://drive.example.com\n      SESSION_SECRET: <output-of-openssl-rand-hex-32>`}</code>
          </pre>
          <h3>Environment file</h3>
          <pre>
            <code>{`SEAFILE_URL=http://seafile\nPUBLIC_SEAFILE_URL=https://seafile.example.com\nAPP_URL=https://drive.example.com\nSESSION_SECRET=<output-of-openssl-rand-hex-32>`}</code>
          </pre>
          <dl className="env-reference">
            <div>
              <dt>SEAFILE_URL</dt>
              <dd>
                Private server-to-server address. In Compose, this is usually <code>http://seafile</code>.
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
              <dd>A random secret of at least 32 characters. Never expose it to the browser.</dd>
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
