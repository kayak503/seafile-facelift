import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeafileAdapter } from '@/lib/seafile';

describe('SeafileAdapter', () => {
  beforeEach(() => {
    process.env.SEAFILE_URL = 'https://seafile.test';
    process.env.PUBLIC_SEAFILE_URL = 'https://files.test';
    process.env.APP_URL = 'https://facelift.test';
    process.env.SESSION_SECRET = 'a-secure-test-secret-that-is-long-enough';
  });
  afterEach(() => vi.restoreAllMocks());
  it('authenticates without exposing the password in the URL', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ token: 'secret-token' }), { status: 200 }));
    await expect(new SeafileAdapter().authenticate('ari@example.com', 'password')).resolves.toBe(
      'secret-token',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://seafile.test/api2/auth-token/');
    expect(String(init?.body)).toContain('password=password');
    expect(String(url)).not.toContain('password');
  });
  it('normalizes libraries and permissions', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify([{ id: 'abc', name: 'Documents', permission: 'r', encrypted: true, mtime: 10 }]),
          { status: 200 },
        ),
    );
    const libraries = await new SeafileAdapter().listLibraries('token');
    expect(libraries[0]).toMatchObject({ id: 'abc', name: 'Documents', permission: 'r', encrypted: true });
  });
  it('supports wrapped responses and legacy Token authorization', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const authorization = new Headers(init?.headers).get('Authorization') || '';
      return authorization.startsWith('Token ')
        ? new Response(
            JSON.stringify({ repos: [{ repo_id: 'legacy-id', repo_name: 'My Library', permission: 'rw' }] }),
            { status: 200 },
          )
        : new Response('[]', { status: 200 });
    });
    const adapter = new SeafileAdapter();
    const libraries = await adapter.listLibraries('legacy-token');
    expect(libraries).toEqual([expect.objectContaining({ id: 'legacy-id', name: 'My Library' })]);
    expect(
      fetchMock.mock.calls.some(([, init]) =>
        new Headers(init?.headers).get('Authorization')?.startsWith('Token '),
      ),
    ).toBe(true);
    expect(adapter.authorizationHeader('legacy-token')).toBe('Token legacy-token');
  });
  it('normalizes directory entries', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: '1', name: 'Plans', type: 'dir', mtime: 10 },
          { id: '2', name: 'note.txt', type: 'file', size: 4 },
        ]),
        { status: 200 },
      ),
    );
    const items = await new SeafileAdapter().listDirectory('token', 'abc', '/Work');
    expect(items.map(item => [item.name, item.type, item.path])).toEqual([
      ['Plans', 'folder', '/Work/Plans'],
      ['note.txt', 'file', '/Work/note.txt'],
    ]);
  });
  it('maps expired sessions and permission failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
    await expect(new SeafileAdapter().listLibraries('expired')).rejects.toMatchObject({
      code: 'session_expired',
      status: 401,
    });
  });
  it('maps unavailable Seafile cleanly', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    await expect(new SeafileAdapter().listLibraries('token')).rejects.toMatchObject({
      code: 'seafile_unavailable',
      status: 503,
    });
  });
  it('creates folders through the directory API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await new SeafileAdapter().mutate('token', {
      operation: 'mkdir',
      libraryId: 'abc',
      path: '/Work',
      name: 'Plans',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api2/repos/abc/dir/?p=%2FWork%2FPlans');
    expect(String(fetchMock.mock.calls[0][1]?.body)).toBe('operation=mkdir');
  });
  it('renames files without changing their parent path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await new SeafileAdapter().mutate('token', {
      operation: 'rename',
      libraryId: 'abc',
      path: '/Work/old.txt',
      itemType: 'file',
      name: 'new.txt',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/file/?p=%2FWork%2Fold.txt');
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('newname=new.txt');
  });
  it('moves folders through Seafile permission checks', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await new SeafileAdapter().mutate('token', {
      operation: 'move',
      libraryId: 'abc',
      path: '/Plans',
      itemType: 'folder',
      destinationLibraryId: 'def',
      destinationPath: '/Archive',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/dir/?p=%2FPlans');
    expect(String(fetchMock.mock.calls[0][1]?.body)).toBe('operation=move&dst_repo=def&dst_dir=%2FArchive');
  });
  it('copies items to a chosen library and folder', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await new SeafileAdapter().mutate('token', {
      operation: 'copy',
      libraryId: 'abc',
      path: '/note.txt',
      itemType: 'file',
      destinationLibraryId: 'def',
      destinationPath: '/Copies',
    });
    expect(String(fetchMock.mock.calls[0][1]?.body)).toBe('operation=copy&dst_repo=def&dst_dir=%2FCopies');
  });
  it('stars, unstars, and creates share links', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: 'share',
            link: 'https://seafile.test/d/share',
            download_link: 'https://seafile.test/f/share',
            permissions: { can_download: true, can_edit: true, can_upload: false },
          }),
          { status: 200 },
        ),
      );
    const adapter = new SeafileAdapter();
    await adapter.setStarred('token', 'abc', '/note.txt', true);
    await adapter.setStarred('token', 'abc', '/note.txt', false);
    await expect(
      adapter.createShareLink('token', 'abc', '/note.txt', {
        password: 'secret',
        expireDays: 7,
        canEdit: true,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        token: 'share',
        link: 'https://seafile.test/d/share',
        downloadLink: 'https://seafile.test/f/share',
        permissions: { canDownload: true, canEdit: true, canUpload: false },
      }),
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE');
    const shareBody = String(fetchMock.mock.calls[2][1]?.body);
    expect(shareBody).toContain('password=secret');
    expect(shareBody).toContain('expire_days=7');
    expect(shareBody).toContain('can_edit%22%3Atrue');
  });
  it('lists and revokes external share links', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              token: 'public-token',
              link: 'https://seafile.test/d/public-token',
              obj_name: 'proposal.pdf',
              is_dir: false,
              password: true,
              expire_date: '2026-09-01T00:00:00Z',
              permissions: { can_download: false, can_edit: false, can_upload: false },
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    const adapter = new SeafileAdapter();
    await expect(adapter.listShareLinks('token', 'abc', '/proposal.pdf')).resolves.toEqual([
      expect.objectContaining({
        token: 'public-token',
        name: 'proposal.pdf',
        passwordProtected: true,
        permissions: { canDownload: false, canEdit: false, canUpload: false },
      }),
    ]);
    await adapter.deleteShareLink('token', 'public-token');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/api/v2.1/share-links/public-token/');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE');
  });
  it('normalizes the starred-item wrapper used by current Seafile releases', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          starred_item_list: [
            {
              repo_id: 'abc',
              repo_name: 'Documents',
              is_dir: true,
              path: '/Plans/',
              obj_name: 'Plans',
              mtime: '2026-08-15T18:20:06-04:00',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const results = await new SeafileAdapter().listStarred('token');
    expect(results).toEqual([
      expect.objectContaining({
        libraryId: 'abc',
        location: 'Documents',
        name: 'Plans',
        type: 'folder',
        modifiedAt: '2026-08-15T22:20:06.000Z',
      }),
    ]);
  });
  it('creates a new library through the authenticated repository API', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ repo_id: 'new-library-id' }), { status: 200 }));
    await expect(new SeafileAdapter().createLibrary('token', 'Project files')).resolves.toEqual({
      id: 'new-library-id',
      name: 'Project files',
      permission: 'rw',
      encrypted: false,
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://seafile.test/api2/repos/');
    expect(String(fetchMock.mock.calls[0][1]?.body)).toBe('name=Project+files');
  });
  it('normalizes account storage usage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ usage: 1024, total: 4096 }), { status: 200 }),
    );
    await expect(new SeafileAdapter().storageUsage('token')).resolves.toEqual({ used: 1024, total: 4096 });
  });
  it('deletes through the correct file endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    await new SeafileAdapter().mutate('token', {
      operation: 'delete',
      libraryId: 'abc',
      path: '/note.txt',
      itemType: 'file',
    });
    expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE');
  });
  it('normalizes search results without inventing recents', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            results: [
              { repo_id: 'abc', repo_name: 'Documents', name: 'note.txt', path: '/Work/note.txt', size: 4 },
            ],
          }),
          { status: 200 },
        ),
    );
    const results = await new SeafileAdapter().search('token', 'note');
    expect(results[0]).toMatchObject({ libraryId: 'abc', location: 'Documents', name: 'note.txt' });
  });
  it('falls back to directory traversal when Community Edition search has no usable results', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      const value = String(url);
      if (value.includes('/api2/search/'))
        return new Response(JSON.stringify({ data: [{ path: '/annual-report.pdf', type: 'file' }] }), {
          status: 200,
        });
      if (value.includes('/api2/repos/?')) return new Response('[]', { status: 200 });
      if (value.endsWith('/api2/repos/'))
        return new Response(JSON.stringify([{ id: 'abc', name: 'Documents', permission: 'rw' }]), {
          status: 200,
        });
      if (value.includes('/api2/repos/abc/dir/'))
        return new Response(
          JSON.stringify([{ id: 'file-1', name: 'annual-report.pdf', type: 'file', size: 2048 }]),
          { status: 200 },
        );
      return new Response('[]', { status: 200 });
    });
    const results = await new SeafileAdapter().search('token', 'annual');
    expect(results).toEqual([
      expect.objectContaining({ libraryId: 'abc', name: 'annual-report.pdf', size: 2048 }),
    ]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api2/repos/abc/dir/'))).toBe(true);
  });
  it('adds middle-of-name and extension matches even when native search returns other results', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      const value = String(url);
      if (value.includes('/api2/search/'))
        return new Response(
          JSON.stringify({
            results: [{ repo_id: 'abc', repo_name: 'Documents', name: 'summary.pdf', path: '/summary.pdf' }],
          }),
          { status: 200 },
        );
      if (value.includes('/api2/repos/?')) return new Response('[]', { status: 200 });
      if (value.endsWith('/api2/repos/'))
        return new Response(JSON.stringify([{ id: 'abc', name: 'Documents', permission: 'rw' }]), {
          status: 200,
        });
      if (value.includes('/api2/repos/abc/dir/'))
        return new Response(JSON.stringify([{ id: 'file-1', name: 'invoice-001.pdf', type: 'file' }]), {
          status: 200,
        });
      return new Response('[]', { status: 200 });
    });
    const results = await new SeafileAdapter().search('token', '001');
    expect(results.map(item => item.name)).toContain('invoice-001.pdf');
  });
  it('requests bounded Seafile thumbnails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('image', { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    const response = await new SeafileAdapter().thumbnail('token', 'abc', '/photo.jpg', 64);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api2/repos/abc/thumbnail/?p=%2Fphoto.jpg&size=64');
  });
  it('obtains authorized upload and download transfer URLs', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('"https://seafile.test/upload"', { status: 200 }))
      .mockResolvedValueOnce(new Response('"https://seafile.test/download"', { status: 200 }));
    const adapter = new SeafileAdapter();
    await expect(adapter.transferUrl('token', 'abc', '/Work', 'upload')).resolves.toBe(
      'https://seafile.test/upload',
    );
    await expect(adapter.transferUrl('token', 'abc', '/Work/note.txt', 'download')).resolves.toBe(
      'https://seafile.test/download',
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain('upload-link');
  });
});
