import http from 'node:http';

const port = Number(process.env.FAKE_SEAFILE_PORT || 4100);
const now = Math.floor(Date.now() / 1000);

function initialState() {
  return {
    entries: [
      { id: 'folder-plans', name: 'Plans', type: 'dir', mtime: now - 300, permission: 'rw' },
      {
        id: 'file-report',
        name: 'Quarterly Report.pdf',
        type: 'file',
        size: 8_400_000,
        mtime: now - 180,
        permission: 'rw',
      },
      {
        id: 'file-photo',
        name: 'Team Photo.jpg',
        type: 'file',
        size: 1_250_000,
        mtime: now - 60,
        permission: 'rw',
      },
      {
        id: 'file-notes',
        name: 'Release Notes.txt',
        type: 'file',
        size: 2400,
        mtime: now - 30,
        permission: 'rw',
      },
    ],
    starred: [],
    shares: [
      {
        token: 'existing-share',
        link: `http://127.0.0.1:${port}/d/existing-share`,
        download_link: `http://127.0.0.1:${port}/f/existing-share`,
        obj_name: 'Quarterly Report.pdf',
        is_dir: false,
        expire_date: null,
        permissions: { can_download: true, can_edit: false, can_upload: false },
      },
    ],
  };
}

let state = initialState();

function json(response, value, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

function text(response, value, status = 200, type = 'text/plain') {
  response.writeHead(status, { 'Content-Type': type });
  response.end(value);
}

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

function findEntry(pathname) {
  const name = pathname.split('/').filter(Boolean).pop();
  return state.entries.find(entry => entry.name === name);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
  const method = request.method || 'GET';

  if (url.pathname === '/__reset' && method === 'POST') {
    state = initialState();
    return json(response, { ok: true });
  }
  if (url.pathname === '/__state') return json(response, state);
  if (url.pathname === '/api2/ping/') return text(response, 'pong');
  if (url.pathname === '/api2/auth-token/' && method === 'POST') {
    const credentials = new URLSearchParams(await body(request));
    return credentials.get('password') === 'wrong'
      ? json(response, { error: 'Invalid credentials' }, 400)
      : json(response, { token: 'e2e-token' });
  }
  if (url.pathname === '/api2/repos/' && method === 'GET') {
    if (['shared', 'group', 'org'].includes(url.searchParams.get('type') || '')) return json(response, []);
    return json(response, [
      { id: 'library-1', name: 'My Library', permission: 'rw', encrypted: false, mtime: now },
    ]);
  }
  if (url.pathname === '/api2/repos/' && method === 'POST') {
    const values = new URLSearchParams(await body(request));
    return json(response, { repo_id: `library-${values.get('name')?.toLowerCase().replace(/\s+/g, '-')}` });
  }
  if (url.pathname === '/api2/account/info/')
    return json(response, { usage: 34_000_000, total: 50_000_000_000 });
  if (url.pathname === '/api/v2.1/starred-items/' && method === 'GET') return json(response, state.starred);
  if (url.pathname === '/api/v2.1/starred-items/' && method === 'POST') {
    const values = new URLSearchParams(await body(request));
    const path = values.get('path') || '/';
    const entry = findEntry(path);
    if (entry)
      state.starred = [
        {
          repo_id: 'library-1',
          repo_name: 'My Library',
          path,
          obj_name: entry.name,
          is_dir: entry.type === 'dir',
          mtime: entry.mtime,
        },
      ];
    return json(response, { ok: true });
  }
  if (url.pathname === '/api/v2.1/starred-items/' && method === 'DELETE') {
    state.starred = [];
    return json(response, { ok: true });
  }
  if (url.pathname === '/api/v2.1/share-links/' && method === 'GET') {
    const path = url.searchParams.get('path');
    return json(response, path ? state.shares.filter(share => `/${share.obj_name}` === path) : state.shares);
  }
  if (url.pathname === '/api/v2.1/share-links/' && method === 'POST') {
    const values = new URLSearchParams(await body(request));
    const itemPath = values.get('path') || '/Shared item';
    const name = itemPath.split('/').filter(Boolean).pop() || 'Shared item';
    const token = `share-${state.shares.length + 1}`;
    const share = {
      token,
      link: `http://127.0.0.1:${port}/d/${token}`,
      download_link: `http://127.0.0.1:${port}/f/${token}`,
      obj_name: name,
      is_dir: findEntry(itemPath)?.type === 'dir',
      expire_date: values.get('expire_days')
        ? new Date(Date.now() + Number(values.get('expire_days')) * 86_400_000).toISOString()
        : null,
      description: values.get('description') || '',
      password: Boolean(values.get('password')),
      permissions: JSON.parse(values.get('permissions') || '{}'),
    };
    state.shares.push(share);
    return json(response, share);
  }
  if (url.pathname.startsWith('/api/v2.1/share-links/') && method === 'DELETE') {
    const token = url.pathname.split('/').filter(Boolean).pop();
    state.shares = state.shares.filter(share => share.token !== token);
    return json(response, { ok: true });
  }
  if (url.pathname.includes('/trash/')) return json(response, []);
  if (url.pathname === '/api2/search/') return json(response, { detail: 'Not supported' }, 404);
  if (/\/api2\/repos\/[^/]+\/dir\/$/.test(url.pathname) && method === 'GET') {
    const path = url.searchParams.get('p') || '/';
    if (path !== '/') return json(response, []);
    return json(
      response,
      url.searchParams.get('recursive')
        ? state.entries.map(entry => ({ ...entry, path: `/${entry.name}` }))
        : state.entries,
    );
  }
  if (/\/api2\/repos\/[^/]+\/dir\/$/.test(url.pathname) && method === 'POST') {
    const path = url.searchParams.get('p') || '/New folder';
    const values = new URLSearchParams(await body(request));
    if (values.get('operation') === 'mkdir')
      state.entries.push({
        id: `folder-${Date.now()}`,
        name: path.split('/').filter(Boolean).pop(),
        type: 'dir',
        mtime: now,
        permission: 'rw',
      });
    return json(response, { ok: true });
  }
  if (/\/api2\/repos\/[^/]+\/(file|dir)\/$/.test(url.pathname) && method === 'POST') {
    const path = url.searchParams.get('p') || '';
    const values = new URLSearchParams(await body(request));
    if (values.get('operation') === 'rename') {
      const entry = findEntry(path);
      if (entry) entry.name = values.get('newname') || entry.name;
    }
    return json(response, { ok: true });
  }
  if (/\/api2\/repos\/[^/]+\/(file|dir)\/$/.test(url.pathname) && method === 'DELETE') {
    const path = url.searchParams.get('p') || '';
    state.entries = state.entries.filter(entry => entry !== findEntry(path));
    return json(response, { ok: true });
  }
  if (/\/api2\/repos\/[^/]+\/thumbnail\/$/.test(url.pathname)) {
    return text(
      response,
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#d7e7ff"/></svg>',
      200,
      'image/svg+xml',
    );
  }
  if (/\/api2\/repos\/[^/]+\/file\/$/.test(url.pathname) && method === 'GET') {
    return text(
      response,
      `http://127.0.0.1:${port}/files/download?path=${encodeURIComponent(url.searchParams.get('p') || '')}`,
    );
  }
  if (/\/api2\/repos\/[^/]+\/upload-link\/$/.test(url.pathname))
    return text(response, `http://127.0.0.1:${port}/files/upload`);
  if (url.pathname === '/files/download') return text(response, 'E2E preview content', 200, 'text/plain');
  if (url.pathname === '/files/upload' && method === 'POST') return json(response, { uploaded: true });
  if (url.pathname.startsWith('/f/')) return text(response, 'shared content', 200, 'application/pdf');

  return json(response, { error: 'not_found', path: url.pathname }, 404);
});

server.listen(port, '127.0.0.1', () => console.log(`Fake Seafile listening on ${port}`));
