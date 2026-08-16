'use client';
import { useState } from 'react';
import { Icon } from './icons';

type Props = {
  token: string;
  name: string;
  type: 'file' | 'folder';
  description?: string;
  protectedShare: boolean;
  canDownload: boolean;
  appName: string;
  accent: string;
};

/** Recipient-facing viewer for encrypted Grapple share URLs. */
export function PublicShareView({
  token,
  name,
  type,
  description,
  protectedShare,
  canDownload,
  appName,
  accent,
}: Props) {
  const [unlocked, setUnlocked] = useState(!protectedShare);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const source = `/api/public-share/content?token=${encodeURIComponent(token)}`;
  const extension = name.split('.').pop()?.toLowerCase() || '';
  const image = /^(png|jpe?g|gif|webp|svg)$/.test(extension);
  // Browser PDF viewers need the raw bytes to render. We remove their ordinary toolbar and keep
  // Grapple's explicit download endpoint blocked, while acknowledging this is UI-level deterrence.
  const restrictedPdf = extension === 'pdf' && !canDownload;
  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/public-share/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not unlock this link.');
      setUnlocked(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not unlock this link.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="public-share-page" style={{ '--accent': accent } as React.CSSProperties}>
      <header>
        <div className="brand-mark">
          <Icon name="files" />
        </div>
        <strong>{appName}</strong>
      </header>
      <section className={`public-share-card ${type}`}>
        <div className="public-share-heading">
          <div className="public-file-icon">
            <Icon
              name={type === 'folder' ? 'folder' : extension === 'pdf' ? 'pdf' : image ? 'image' : 'file'}
            />
          </div>
          <div>
            <span>
              {type === 'folder' ? 'Shared folder' : `${extension.toUpperCase() || 'File'} · Shared file`}
            </span>
            <h1>{name}</h1>
            {description && <p>{description}</p>}
          </div>
        </div>
        {!unlocked ? (
          <form className="share-unlock" onSubmit={unlock}>
            <div className="lock-art">
              <Icon name="lock" />
            </div>
            <h2>This link is password protected</h2>
            <p>Enter the password supplied by the owner to continue.</p>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
                autoFocus
              />
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary" disabled={busy}>
              {busy ? 'Checking…' : 'Unlock'}
            </button>
          </form>
        ) : type === 'folder' ? (
          <div className="shared-folder-state">
            <Icon name="folder" />
            <h2>Shared folder ready</h2>
            <p>The folder is protected by this Grapple link and the owner’s Seafile permissions.</p>
            {canDownload ? (
              <a className="primary button-link" href={`${source}&download=1`}>
                <Icon name="download" />
                Download folder
              </a>
            ) : (
              <span>Downloads disabled by the owner</span>
            )}
          </div>
        ) : (
          <>
            <div className={`public-preview ${image ? 'image' : ''} ${restrictedPdf ? 'restricted' : ''}`}>
              {image ? (
                <img src={source} alt={name} />
              ) : (
                <iframe
                  src={`${source}${extension === 'pdf' ? '#toolbar=0&navpanes=0&scrollbar=1' : ''}`}
                  title={name}
                />
              )}{' '}
              {restrictedPdf && (
                <div className="view-only-badge">
                  <Icon name="lock" />
                  View only · downloads disabled
                </div>
              )}
            </div>
            <div className="public-share-actions">
              {canDownload ? (
                <a className="primary button-link" href={`${source}&download=1`}>
                  <Icon name="download" />
                  Download
                </a>
              ) : (
                <span>
                  <Icon name="lock" />
                  View only — downloads disabled by the owner
                </span>
              )}
            </div>
          </>
        )}
      </section>
      <footer>Shared securely with {appName}</footer>
    </main>
  );
}
