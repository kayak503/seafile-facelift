import { requireConfig } from '@/lib/config';
import { AppError } from '@/lib/errors';
import type { DriveAction, DriveItem, DriveLibrary, SearchResult, StorageUsage } from './types';

type RawEntry = {
  id?: string;
  name: string;
  type: 'file' | 'dir';
  size?: number;
  mtime?: number;
  permission?: string;
  path?: string;
  parent_dir?: string;
};
type RawRepo = {
  id?: string;
  repo_id?: string;
  name?: string;
  repo_name?: string;
  permission?: string;
  encrypted?: boolean;
  mtime?: number;
};
type AuthScheme = 'Bearer' | 'Token';
export type ShareLinkOptions = {
  password?: string;
  expireDays?: number;
  description?: string;
  canDownload?: boolean;
  canEdit?: boolean;
  canUpload?: boolean;
};
export type ShareLink = {
  token: string;
  link: string;
  downloadLink: string;
  expiresAt?: string;
  permissions: { canDownload: boolean; canEdit: boolean; canUpload: boolean };
};
export type ManagedShareLink = ShareLink & {
  name: string;
  type: 'file' | 'folder';
  createdAt?: string;
  description?: string;
  passwordProtected: boolean;
};
const authSchemeKey = Symbol.for('seafile-cover.auth-schemes');
const authSchemes = ((globalThis as typeof globalThis & { [authSchemeKey]?: Map<string, AuthScheme> })[
  authSchemeKey
] ??= new Map());

function join(path: string, name: string) {
  return `${path === '/' ? '' : path}/${name}`;
}
function modified(seconds?: number) {
  return seconds ? new Date(seconds * 1000).toISOString() : undefined;
}
function modifiedValue(value: unknown) {
  if (typeof value === 'number') return modified(value);
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return undefined;
}
function authHeaders(token: string, scheme = authSchemes.get(token) || 'Bearer') {
  return { Authorization: `${scheme} ${token}` };
}
function repoArray(value: unknown): RawRepo[] {
  if (Array.isArray(value)) return value as RawRepo[];
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['repos', 'libraries', 'results', 'data'])
      if (Array.isArray(record[key])) return record[key] as RawRepo[];
  }
  return [];
}

/**
 * Typed compatibility boundary for Seafile Web API variants.
 *
 * UI and route code should consume normalized application models from this class instead of
 * depending on edition-specific endpoints or upstream response shapes.
 */
export class SeafileAdapter {
  readonly baseUrl: string;
  constructor() {
    this.baseUrl = requireConfig().seafileUrl;
  }

  authorizationHeader(token: string) {
    return authHeaders(token).Authorization;
  }

  /** Applies timeouts and converts upstream HTTP/network failures into stable application errors. */
  private async fetch(path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        cache: 'no-store',
      });
      if (path === '/api2/auth-token/' && response.status === 400)
        throw new AppError(401, 'invalid_credentials', 'The email, username, or password is incorrect.');
      if (response.status === 401 || response.status === 403)
        throw new AppError(
          response.status,
          response.status === 401 ? 'session_expired' : 'permission_denied',
          response.status === 401
            ? 'Your Seafile session has expired.'
            : 'You do not have permission to do that.',
        );
      if (response.status === 404)
        throw new AppError(404, 'not_found', 'That file or folder no longer exists.');
      if (response.status === 409)
        throw new AppError(409, 'name_conflict', 'An item with that name already exists.');
      if (!response.ok)
        throw new AppError(502, 'seafile_error', 'Seafile rejected the request. Please try again.');
      return response;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'seafile_unavailable', 'Seafile is unavailable right now.');
    } finally {
      clearTimeout(timeout);
    }
  }

  async authenticate(username: string, password: string) {
    const body = new URLSearchParams({ username, password });
    const response = await this.fetch('/api2/auth-token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await response.json()) as { token?: string };
    if (!data.token) throw new AppError(502, 'invalid_response', 'Seafile did not return an account token.');
    return data.token;
  }

  async listLibraries(token: string): Promise<DriveLibrary[]> {
    const preferred = authSchemes.get(token) || 'Bearer';
    const schemes: AuthScheme[] = preferred === 'Bearer' ? ['Bearer', 'Token'] : ['Token', 'Bearer'];
    let denied = 0;
    let lastAuthError: AppError | null = null;
    for (const scheme of schemes) {
      const collected: RawRepo[] = [];
      for (const type of ['', 'mine', 'shared', 'group', 'org']) {
        try {
          const response = await this.fetch(type ? `/api2/repos/?type=${type}` : '/api2/repos/', {
            headers: authHeaders(token, scheme),
          });
          collected.push(...repoArray(await response.json()));
        } catch (error) {
          if (error instanceof AppError && [401, 403].includes(error.status)) {
            denied += 1;
            lastAuthError = error;
            break;
          }
          throw error;
        }
      }
      const unique = [...new Map(collected.map(repo => [repo.id || repo.repo_id, repo])).values()].filter(
        repo => repo.id || repo.repo_id,
      );
      if (unique.length) {
        authSchemes.set(token, scheme);
        return unique.map(repo => ({
          id: repo.id || repo.repo_id!,
          name: repo.name || repo.repo_name || 'Untitled drive',
          permission: repo.permission === 'r' ? 'r' : 'rw',
          encrypted: Boolean(repo.encrypted),
          modifiedAt: modified(repo.mtime),
        }));
      }
    }
    if (denied === schemes.length && lastAuthError) throw lastAuthError;
    return [];
  }

  async listDirectory(token: string, libraryId: string, path: string): Promise<DriveItem[]> {
    const response = await this.fetch(
      `/api2/repos/${encodeURIComponent(libraryId)}/dir/?p=${encodeURIComponent(path)}`,
      { headers: authHeaders(token) },
    );
    const entries = (await response.json()) as RawEntry[];
    return entries.map(entry => ({
      id: entry.id || `${libraryId}:${join(path, entry.name)}`,
      name: entry.name,
      type: entry.type === 'dir' ? 'folder' : 'file',
      path: join(path, entry.name),
      libraryId,
      size: entry.size,
      modifiedAt: modified(entry.mtime),
      permission: entry.permission === 'r' ? 'r' : 'rw',
    }));
  }

  async listRecent(token: string): Promise<SearchResult[]> {
    const libraries = await this.listLibraries(token);
    const collected: SearchResult[] = [];
    for (const library of libraries) {
      try {
        const response = await this.fetch(
          `/api2/repos/${encodeURIComponent(library.id)}/dir/?p=%2F&recursive=1`,
          { headers: authHeaders(token) },
        );
        const entries = (await response.json()) as RawEntry[];
        for (const entry of entries) {
          const entryPath = entry.path || join(entry.parent_dir || '/', entry.name);
          collected.push({
            id: entry.id || `${library.id}:${entryPath}`,
            name: entry.name,
            type: entry.type === 'dir' ? 'folder' : 'file',
            path: entryPath,
            libraryId: library.id,
            size: entry.size,
            modifiedAt: modified(entry.mtime),
            permission: library.permission,
            location: `${library.name}${parentPath(entryPath) === '/' ? '' : ` · ${parentPath(entryPath)}`}`,
          });
        }
      } catch {
        /* A single inaccessible/encrypted library should not break Recent. */
      }
    }
    return collected
      .filter(item => item.modifiedAt)
      .sort((a, b) => new Date(b.modifiedAt!).getTime() - new Date(a.modifiedAt!).getTime())
      .slice(0, 100);
  }

  async listStarred(token: string): Promise<SearchResult[]> {
    const response = await this.fetch('/api/v2.1/starred-items/', { headers: authHeaders(token) });
    const data = (await response.json()) as
      | Array<Record<string, unknown>>
      | {
          results?: Array<Record<string, unknown>>;
          items?: Array<Record<string, unknown>>;
          data?: Array<Record<string, unknown>>;
          starred_item_list?: Array<Record<string, unknown>>;
        };
    const entries = Array.isArray(data)
      ? data
      : data.starred_item_list || data.results || data.items || data.data || [];
    return entries
      .map<SearchResult>(entry => {
        const libraryId = String(entry.repo_id || entry.library_id || '');
        const path = String(entry.path || '/');
        const name = String(entry.obj_name || entry.name || path.split('/').filter(Boolean).pop() || 'Drive');
        const isDir =
          Boolean(entry.is_dir) || entry.obj_type === 'dir' || entry.type === 'dir' || path === '/';
        return {
          id: `${libraryId}:${path}`,
          name,
          type: isDir ? 'folder' : 'file',
          path,
          libraryId,
          size: typeof entry.size === 'number' ? entry.size : undefined,
          modifiedAt: modifiedValue(entry.mtime),
          location: String(entry.repo_name || entry.library_name || parentPath(path) || 'My files'),
        };
      })
      .filter(item => item.libraryId);
  }

  async createLibrary(token: string, name: string): Promise<DriveLibrary> {
    const response = await this.fetch('/api2/repos/', {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name }),
    });
    const raw = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* Older servers may return only the repository ID. */
    }
    const id = String(data.repo_id || data.id || raw.replace(/^"|"$/g, ''));
    if (!id)
      throw new AppError(502, 'invalid_response', 'Seafile created the library but did not return its ID.');
    return { id, name, permission: 'rw', encrypted: false };
  }

  async listSharedLibraries(token: string): Promise<DriveLibrary[]> {
    const collected: RawRepo[] = [];
    for (const type of ['shared', 'group', 'org']) {
      try {
        const response = await this.fetch(`/api2/repos/?type=${type}`, { headers: authHeaders(token) });
        collected.push(...repoArray(await response.json()));
      } catch {
        /* Some editions do not expose every sharing category. */
      }
    }
    return [...new Map(collected.map(repo => [repo.id || repo.repo_id, repo])).values()]
      .filter(repo => repo.id || repo.repo_id)
      .map(repo => ({
        id: repo.id || repo.repo_id!,
        name: repo.name || repo.repo_name || 'Shared drive',
        permission: repo.permission === 'r' ? 'r' : 'rw',
        encrypted: Boolean(repo.encrypted),
        modifiedAt: modified(repo.mtime),
      }));
  }

  async listTrash(token: string): Promise<SearchResult[]> {
    const libraries = await this.listLibraries(token);
    const collected: SearchResult[] = [];
    for (const library of libraries) {
      try {
        const response = await this.fetch(
          `/api/v2.1/repos/${encodeURIComponent(library.id)}/trash/?path=%2F&show_days=100`,
          { headers: authHeaders(token) },
        );
        const data = (await response.json()) as
          | Array<Record<string, unknown>>
          | { data?: Array<Record<string, unknown>>; items?: Array<Record<string, unknown>> };
        const entries = Array.isArray(data) ? data : data.data || data.items || [];
        for (const entry of entries) {
          if (entry.scan_stat) continue;
          const name = String(entry.obj_name || entry.name || '');
          if (!name) continue;
          const base = String(entry.basedir || entry.parent_dir || entry.path || '/');
          const path = base.endsWith(`/${name}`) ? base : join(base, name);
          const deleted = entry.delete_time || entry.deleted_at || entry.mtime;
          collected.push({
            id: `${library.id}:trash:${path}:${String(entry.commit_id || deleted || '')}`,
            name,
            type: entry.is_dir || entry.obj_type === 'dir' || entry.type === 'dir' ? 'folder' : 'file',
            path,
            libraryId: library.id,
            size: typeof entry.size === 'number' ? entry.size : undefined,
            modifiedAt:
              typeof deleted === 'number'
                ? modified(deleted)
                : typeof deleted === 'string'
                  ? deleted
                  : undefined,
            location: `${library.name} · ${parentPath(path)}`,
          });
        }
      } catch {
        /* Keep the rest of Trash usable if one library is unavailable. */
      }
    }
    return collected.sort(
      (a, b) => new Date(b.modifiedAt || 0).getTime() - new Date(a.modifiedAt || 0).getTime(),
    );
  }

  async mutate(token: string, action: DriveAction) {
    if (action.operation === 'mkdir') {
      const body = new URLSearchParams({ operation: 'mkdir' });
      await this.fetch(
        `/api2/repos/${action.libraryId}/dir/?p=${encodeURIComponent(join(action.path, action.name))}`,
        {
          method: 'POST',
          headers: { ...authHeaders(token), 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        },
      );
      return;
    }
    const endpoint = action.itemType === 'folder' ? 'dir' : 'file';
    if (action.operation === 'delete') {
      await this.fetch(`/api2/repos/${action.libraryId}/${endpoint}/?p=${encodeURIComponent(action.path)}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
      return;
    }
    const body =
      action.operation === 'rename'
        ? new URLSearchParams({ operation: 'rename', newname: action.name })
        : new URLSearchParams({
            operation: action.operation,
            dst_repo: action.destinationLibraryId,
            dst_dir: action.destinationPath,
          });
    await this.fetch(`/api2/repos/${action.libraryId}/${endpoint}/?p=${encodeURIComponent(action.path)}`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  }

  async setStarred(token: string, libraryId: string, path: string, starred: boolean) {
    const query = `repo_id=${encodeURIComponent(libraryId)}&path=${encodeURIComponent(path)}`;
    if (starred) {
      await this.fetch('/api/v2.1/starred-items/', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ repo_id: libraryId, path }),
      });
    } else
      await this.fetch(`/api/v2.1/starred-items/?${query}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
  }

  async createShareLink(
    token: string,
    libraryId: string,
    path: string,
    options: ShareLinkOptions = {},
  ): Promise<ShareLink> {
    let data: Record<string, unknown>;
    const permissions = {
      can_download: options.canDownload !== false,
      can_edit: Boolean(options.canEdit),
      can_upload: Boolean(options.canUpload),
    };
    const form = new URLSearchParams({ repo_id: libraryId, path, permissions: JSON.stringify(permissions) });
    if (options.password) form.set('password', options.password);
    if (options.expireDays) form.set('expire_days', String(options.expireDays));
    if (options.description) form.set('description', options.description);
    try {
      const response = await this.fetch('/api/v2.1/share-links/', {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      data = (await response.json()) as Record<string, unknown>;
    } catch (error) {
      if (!(error instanceof AppError) || !['name_conflict', 'seafile_error'].includes(error.code))
        throw error;
      const response = await this.fetch(
        `/api/v2.1/share-links/?repo_id=${encodeURIComponent(libraryId)}&path=${encodeURIComponent(path)}`,
        { headers: authHeaders(token) },
      );
      const body = (await response.json()) as
        | Record<string, unknown>[]
        | { data?: Record<string, unknown>[]; results?: Record<string, unknown>[] };
      const links = Array.isArray(body) ? body : body.data || body.results || [];
      data = links[0] || {};
    }
    const link = String(data.link || data.share_link || data.url || '');
    if (!link)
      throw new AppError(502, 'invalid_response', 'Seafile created the share but did not return a link.');
    const rawPermissions =
      data.permissions && typeof data.permissions === 'object'
        ? (data.permissions as Record<string, unknown>)
        : {};
    return {
      token: String(data.token || link.split('/').filter(Boolean).pop() || ''),
      link,
      downloadLink: String(data.download_link || ''),
      expiresAt: typeof data.expire_date === 'string' ? data.expire_date : undefined,
      permissions: {
        canDownload: rawPermissions.can_download !== false && options.canDownload !== false,
        canEdit: Boolean(rawPermissions.can_edit ?? options.canEdit),
        canUpload: Boolean(rawPermissions.can_upload ?? options.canUpload),
      },
    };
  }

  async listShareLinks(token: string, libraryId: string, path: string): Promise<ManagedShareLink[]> {
    const response = await this.fetch(
      `/api/v2.1/share-links/?repo_id=${encodeURIComponent(libraryId)}&path=${encodeURIComponent(path)}`,
      { headers: authHeaders(token) },
    );
    const body = (await response.json()) as
      | Record<string, unknown>[]
      | { data?: Record<string, unknown>[]; results?: Record<string, unknown>[] };
    const links = Array.isArray(body) ? body : body.data || body.results || [];
    return links
      .map(data => {
        const rawPermissions =
          data.permissions && typeof data.permissions === 'object'
            ? (data.permissions as Record<string, unknown>)
            : {};
        return {
          token: String(data.token || ''),
          link: String(data.link || data.share_link || data.url || ''),
          downloadLink: String(data.download_link || ''),
          name: String(data.obj_name || data.name || path.split('/').filter(Boolean).pop() || 'Shared item'),
          type: data.is_dir === true ? ('folder' as const) : ('file' as const),
          createdAt:
            typeof data.ctime === 'string'
              ? data.ctime
              : typeof data.created_at === 'string'
                ? data.created_at
                : undefined,
          expiresAt: typeof data.expire_date === 'string' ? data.expire_date : undefined,
          description: typeof data.description === 'string' ? data.description : undefined,
          passwordProtected: Boolean(data.password || data.has_password),
          permissions: {
            canDownload: rawPermissions.can_download !== false,
            canEdit: Boolean(rawPermissions.can_edit),
            canUpload: Boolean(rawPermissions.can_upload),
          },
        };
      })
      .filter(link => Boolean(link.token && link.link));
  }

  async deleteShareLink(token: string, shareToken: string) {
    await this.fetch(`/api/v2.1/share-links/${encodeURIComponent(shareToken)}/`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
  }

  async storageUsage(token: string): Promise<StorageUsage> {
    const response = await this.fetch('/api2/account/info/', { headers: authHeaders(token) });
    const data = (await response.json()) as Record<string, unknown>;
    const used = Number(data.usage ?? data.used ?? 0);
    const rawTotal = Number(data.total ?? data.quota ?? 0);
    return {
      used: Number.isFinite(used) ? used : 0,
      total: Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : undefined,
    };
  }

  /**
   * Searches every accessible library. Pro search is preferred; bounded Community Edition
   * fallbacks preserve partial-name and extension matching when that endpoint is unavailable.
   */
  async search(token: string, query: string): Promise<SearchResult[]> {
    type RawSearch = Record<string, unknown>;
    const normalize = (entry: RawSearch, library?: DriveLibrary): SearchResult | null => {
      const libraryId = String(entry.repo_id || entry.library_id || library?.id || '');
      const path = String(entry.path || entry.obj_path || '');
      const name = String(entry.name || entry.obj_name || path.split('/').filter(Boolean).pop() || '');
      if (!libraryId || !path || !name) return null;
      const rawType = String(entry.type || entry.obj_type || '');
      const isFolder = Boolean(entry.is_dir) || rawType === 'dir' || rawType === 'folder';
      return {
        id: `${libraryId}:${path}`,
        name,
        type: isFolder ? 'folder' : 'file',
        path,
        libraryId,
        size: typeof entry.size === 'number' ? entry.size : undefined,
        modifiedAt: modified(typeof entry.mtime === 'number' ? entry.mtime : undefined),
        permission: library?.permission,
        location: String(
          entry.repo_name || entry.library_name || library?.name || parentPath(path) || 'My files',
        ),
      };
    };

    // Seafile Pro exposes a fast cross-library search endpoint. Community Edition
    // commonly does not, so progressively fall back to its per-library and directory APIs.
    let globalResults: SearchResult[] = [];
    try {
      const response = await this.fetch(
        `/api2/search/?q=${encodeURIComponent(query)}&page=1&per_page=50&search_repo=all`,
        { headers: authHeaders(token) },
      );
      const data = (await response.json()) as RawSearch[] | { results?: RawSearch[]; data?: RawSearch[] };
      globalResults = (Array.isArray(data) ? data : data.results || data.data || [])
        .map(entry => normalize(entry))
        .filter((item): item is SearchResult => Boolean(item));
    } catch {
      /* Continue with Community Edition-compatible endpoints. */
    }

    const libraries = await this.listLibraries(token);
    const matches: SearchResult[] = [];
    const needle = query.toLocaleLowerCase();
    let visitedFolders = 0;
    // Community Edition fallback: current releases expose a recursive directory
    // listing even when cross-library full-text search is unavailable.
    for (const library of libraries) {
      try {
        const response = await this.fetch(
          `/api2/repos/${encodeURIComponent(library.id)}/dir/?p=%2F&recursive=1`,
          { headers: authHeaders(token) },
        );
        const data = (await response.json()) as RawEntry[] | { entries?: RawEntry[]; data?: RawEntry[] };
        const entries = Array.isArray(data) ? data : data.entries || data.data || [];
        for (const entry of entries) {
          const entryPath = entry.path || join(entry.parent_dir || '/', entry.name);
          if (!`${entry.name} ${entryPath}`.toLocaleLowerCase().includes(needle)) continue;
          matches.push({
            id: entry.id || `${library.id}:${entryPath}`,
            name: entry.name,
            type: entry.type === 'dir' ? 'folder' : 'file',
            path: entryPath,
            libraryId: library.id,
            size: entry.size,
            modifiedAt: modifiedValue(entry.mtime),
            permission: library.permission,
            location: `${library.name}${parentPath(entryPath) === '/' ? '' : ` · ${parentPath(entryPath)}`}`,
          });
        }
      } catch {
        /* Older servers are covered by the traversal below. */
      }
      if (matches.some(item => item.libraryId === library.id)) continue;
      const pending = ['/'];
      while (pending.length && matches.length < 100 && visitedFolders < 500) {
        const directory = pending.shift()!;
        visitedFolders += 1;
        try {
          const entries = await this.listDirectory(token, library.id, directory);
          for (const entry of entries) {
            if (entry.type === 'folder') pending.push(entry.path);
            if (!`${entry.name} ${entry.path}`.toLocaleLowerCase().includes(needle)) continue;
            matches.push({
              ...entry,
              permission: library.permission,
              location: `${library.name}${parentPath(entry.path) === '/' ? '' : ` · ${parentPath(entry.path)}`}`,
            });
            if (matches.length >= 100) break;
          }
        } catch {
          /* An inaccessible directory should not break other libraries. */
        }
      }
    }
    return [
      ...new Map(
        [...globalResults, ...matches].map(item => [`${item.libraryId}:${item.path}`, item]),
      ).values(),
    ].slice(0, 100);
  }

  async thumbnail(token: string, libraryId: string, path: string, size: number) {
    return this.fetch(
      `/api2/repos/${encodeURIComponent(libraryId)}/thumbnail/?p=${encodeURIComponent(path)}&size=${size}`,
      { headers: authHeaders(token) },
    );
  }

  async transferUrl(token: string, libraryId: string, path: string, kind: 'download' | 'upload') {
    const route =
      kind === 'download'
        ? `file/?p=${encodeURIComponent(path)}`
        : `upload-link/?p=${encodeURIComponent(path)}`;
    const response = await this.fetch(`/api2/repos/${libraryId}/${route}`, { headers: authHeaders(token) });
    return (await response.text()).replace(/^"|"$/g, '');
  }

  async health() {
    const started = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/api2/ping/`, {
        signal: AbortSignal.timeout(5_000),
        cache: 'no-store',
      });
      return { connected: response.ok, latencyMs: Date.now() - started };
    } catch {
      return { connected: false, latencyMs: Date.now() - started };
    }
  }
}

function parentPath(path: string) {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return `/${parts.join('/')}`;
}
