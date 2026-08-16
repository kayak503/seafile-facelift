'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicConfig } from '@/lib/config';
import type { DriveItem, DriveLibrary, SearchResult } from '@/lib/seafile';
import { Icon } from './icons';

type View = 'list' | 'grid';
type Modal = {
  type: 'new-library' | 'new-folder' | 'move' | 'copy' | 'delete' | 'preview' | 'share' | 'manage-shares';
  item?: DriveItem;
  items?: DriveItem[];
} | null;
type UploadStatus = 'queued' | 'uploading' | 'complete' | 'error' | 'canceled';
type UploadTask = {
  id: string;
  name: string;
  size: number;
  loaded: number;
  progress: number;
  status: UploadStatus;
  error?: string;
};
type Toast = { message: string; tone: 'success' | 'error' | 'info' };
type SectionData = { items?: SearchResult[]; libraries?: DriveLibrary[] };
type SearchFilters = {
  libraryId: string;
  type: string;
  after: string;
  before: string;
  minSize: string;
  maxSize: string;
  sort: string;
};
const emptyFilters: SearchFilters = {
  libraryId: '',
  type: 'any',
  after: '',
  before: '',
  minSize: '',
  maxSize: '',
  sort: 'relevance',
};
const nav = [
  { id: 'files', label: 'My files', icon: 'files' },
  { id: 'recent', label: 'Recent', icon: 'recent' },
  { id: 'starred', label: 'Starred', icon: 'star' },
  { id: 'shared', label: 'Shared', icon: 'shared' },
];

function formatSize(size?: number) {
  if (size == null) return '—';
  if (size < 1000) return `${size} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = size / 1000;
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}
function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 86_400_000 && date.getDate() === new Date().getDate())
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diff < 604_800_000) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}
function parent(path: string) {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return `/${parts.join('/')}`;
}
function canPreview(item: DriveItem) {
  return /\.(png|jpe?g|gif|webp|svg|pdf|txt|md|json|mp4|webm|mp3|wav)$/i.test(item.name);
}
function isImage(item: DriveItem) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(item.name);
}
function previewUrl(item: DriveItem) {
  return `/api/preview?libraryId=${encodeURIComponent(item.libraryId)}&path=${encodeURIComponent(item.path)}`;
}
function thumbnailUrl(item: DriveItem, size: 64 | 256 | 512 | 1024) {
  return `/api/thumbnail?libraryId=${encodeURIComponent(item.libraryId)}&path=${encodeURIComponent(item.path)}&size=${size}`;
}
function fileIcon(item: DriveItem) {
  if (item.type === 'folder') return 'folder';
  const name = item.name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|heic)$/.test(name)) return 'image';
  if (/\.pdf$/.test(name)) return 'pdf';
  if (/\.(docx?|odt|rtf)$/.test(name)) return 'document';
  if (/\.(xlsx?|csv|ods)$/.test(name)) return 'sheet';
  if (/\.(pptx?|odp)$/.test(name)) return 'slides';
  if (/\.(zip|rar|7z|tar|gz)$/.test(name)) return 'archive';
  if (/\.(mp4|webm|mov)$/.test(name)) return 'video';
  if (/\.(mp3|wav|m4a|flac)$/.test(name)) return 'audio';
  if (/\.(txt|md|json|xml|ya?ml|js|ts|tsx|css|html)$/.test(name)) return 'text';
  return 'file';
}
function fileExtension(item: Pick<DriveItem, 'name' | 'type'>) {
  if (item.type === 'folder') return '';
  const dot = item.name.lastIndexOf('.');
  return dot > 0 && dot < item.name.length - 1 ? item.name.slice(dot + 1) : '';
}
function displayName(item: Pick<DriveItem, 'name' | 'type'>) {
  const extension = fileExtension(item);
  return extension ? item.name.slice(0, -(extension.length + 1)) : item.name;
}
function renamedFile(item: DriveItem, basename: string) {
  const extension = fileExtension(item);
  return extension ? `${basename}.${extension}` : basename;
}

/** Authenticated file workspace and coordinator for all user-facing drive interactions. */
export function DriveShell({ username, config }: { username: string; config: PublicConfig }) {
  const router = useRouter();
  const [active, setActive] = useState('files');
  const [view, setView] = useState<View>('list');
  const [mobileNav, setMobileNav] = useState(false);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [libraries, setLibraries] = useState<DriveLibrary[]>([]);
  const [library, setLibrary] = useState<DriveLibrary | null>(null);
  const [path, setPath] = useState('/');
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<string | null>(null);
  const [newMenu, setNewMenu] = useState(false);
  const [libraryMenu, setLibraryMenu] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [details, setDetails] = useState<DriveItem | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(emptyFilters);
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(emptyFilters);
  const [sectionData, setSectionData] = useState<SectionData | null>(null);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [storage, setStorage] = useState<{ used: number; total?: number } | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [uploadsExpanded, setUploadsExpanded] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const uploadXhrs = useRef(new Map<string, XMLHttpRequest>());
  const uploadFiles = useRef(new Map<string, File>());
  const uploadRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentLocation = useRef<{ libraryId?: string; path: string }>({ path: '/' });

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);
  const handleUnauthorized = useCallback(
    (response: Response) => {
      if (response.status === 401) {
        router.replace('/');
        router.refresh();
        return true;
      }
      return false;
    },
    [router],
  );
  const loadLibraries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/drive');
      if (handleUnauthorized(response)) return;
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      const nextLibraries = data.libraries || [];
      setLibraries(nextLibraries);
      if (nextLibraries.length === 1) {
        setLibrary(nextLibraries[0]);
        setPath('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your files.');
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);
  const loadDirectory = useCallback(
    async (currentLibrary: DriveLibrary, currentPath: string, quietly = false) => {
      if (!quietly) setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ libraryId: currentLibrary.id, path: currentPath });
        const response = await fetch(`/api/drive?${params}`);
        if (handleUnauthorized(response)) return;
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        setItems(data.items);
        if (!quietly) setSelected(new Set());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not open this folder.');
      } finally {
        if (!quietly) setLoading(false);
      }
    },
    [handleUnauthorized],
  );
  useEffect(() => {
    loadLibraries();
  }, [loadLibraries]);
  useEffect(() => {
    fetch('/api/account')
      .then(response => (response.ok ? response.json() : null))
      .then(data => data && setStorage(data))
      .catch(() => {});
    fetch('/api/sections?section=starred')
      .then(response => (response.ok ? response.json() : null))
      .then(
        data =>
          data?.items &&
          setStarred(new Set((data.items as SearchResult[]).map(item => `${item.libraryId}:${item.path}`))),
      )
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (library) loadDirectory(library, path);
  }, [library, path, loadDirectory]);
  useEffect(() => {
    currentLocation.current = { libraryId: library?.id, path };
  }, [library, path]);
  useEffect(() => {
    const saved = localStorage.getItem('seafile-facelift-theme');
    const next =
      saved === 'dark' || saved === 'light'
        ? saved
        : matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    document.documentElement.dataset.theme = next;
    setThemeMode(next);
    const savedView = localStorage.getItem('seafile-facelift-view');
    if (savedView === 'list' || savedView === 'grid') setView(savedView);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setModal(null);
        setMenu(null);
        setNewMenu(false);
        setProfileMenu(false);
        setDetails(null);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const needle = query.trim().toLocaleLowerCase();
    const localMatches: SearchResult[] = items
      .filter(item => `${item.name} ${item.path}`.toLocaleLowerCase().includes(needle))
      .filter(item => !searchFilters.libraryId || item.libraryId === searchFilters.libraryId)
      .filter(
        item =>
          searchFilters.type === 'any' ||
          (searchFilters.type === 'other'
            ? fileIcon(item) === 'file'
            : fileIcon(item) === searchFilters.type),
      )
      .filter(
        item =>
          !searchFilters.after ||
          Boolean(
            item.modifiedAt &&
              new Date(item.modifiedAt).getTime() >= new Date(`${searchFilters.after}T00:00:00`).getTime(),
          ),
      )
      .filter(
        item =>
          !searchFilters.before ||
          Boolean(
            item.modifiedAt &&
              new Date(item.modifiedAt).getTime() <=
                new Date(`${searchFilters.before}T23:59:59.999`).getTime(),
          ),
      )
      .filter(item => !searchFilters.minSize || (item.size || 0) >= Number(searchFilters.minSize) * 1_000_000)
      .filter(item => !searchFilters.maxSize || (item.size || 0) <= Number(searchFilters.maxSize) * 1_000_000)
      .map(item => ({
        ...item,
        location: `${library?.name || 'Current library'}${parent(item.path) === '/' ? '' : ` · ${parent(item.path)}`}`,
      }));
    setResults(localMatches);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim() });
        Object.entries(searchFilters).forEach(([key, value]) => {
          if (value && value !== 'any' && value !== 'relevance') params.set(key, value);
        });
        const response = await fetch(`/api/search?${params}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        setResults([
          ...new Map(
            [...localMatches, ...(data.results || [])].map(item => [`${item.libraryId}:${item.path}`, item]),
          ).values(),
        ]);
      } catch (err) {
        if ((err as Error).name !== 'AbortError' && !localMatches.length)
          showToast('Search is unavailable right now.', 'error');
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchFilters, showToast, items, library]);

  const visibleItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1,
      ),
    [items],
  );
  const selectedItems = useMemo(
    () => visibleItems.filter(item => selected.has(item.id)),
    [visibleItems, selected],
  );
  const breadcrumbs = useMemo(() => {
    const parts = path.split('/').filter(Boolean);
    return [
      { label: library?.name || 'My files', path: '/' },
      ...parts.map((part, i) => ({ label: part, path: `/${parts.slice(0, i + 1).join('/')}` })),
    ];
  }, [library, path]);
  const activeFilterCount = Object.entries(searchFilters).filter(
    ([key, value]) => value && value !== 'any' && value !== 'relevance' && !(key === 'libraryId' && !value),
  ).length;
  function openLibrary(value: DriveLibrary) {
    setLibrary(value);
    setPath('/');
    setDetails(null);
    setResults(null);
    setQuery('');
  }
  function openResult(result: SearchResult) {
    const lib = libraries.find(item => item.id === result.libraryId);
    if (!lib) {
      showToast('That drive is no longer available.', 'error');
      return;
    }
    setActive('files');
    setLibrary(lib);
    setPath(result.type === 'folder' ? result.path : parent(result.path));
    setResults(null);
    setSectionData(null);
    setQuery('');
  }
  function openItem(item: DriveItem) {
    setDetails(null);
    if (item.type === 'folder') setPath(item.path);
    else if (canPreview(item)) setModal({ type: 'preview', item });
    else download(item);
  }
  function toggle(item: DriveItem, additive: boolean) {
    setSelected(current => {
      const next = additive ? new Set(current) : new Set<string>();
      if (current.has(item.id) && additive) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }
  function download(item: DriveItem) {
    const link = document.createElement('a');
    link.href = `/api/download?libraryId=${encodeURIComponent(item.libraryId)}&path=${encodeURIComponent(item.path)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  function downloadAll(chosen: DriveItem[]) {
    chosen
      .filter(item => item.type === 'file')
      .forEach((item, index) =>
        setTimeout(() => {
          const link = document.createElement('a');
          link.href = `/api/download?libraryId=${encodeURIComponent(item.libraryId)}&path=${encodeURIComponent(item.path)}`;
          link.download = item.name;
          document.body.appendChild(link);
          link.click();
          link.remove();
        }, index * 350),
      );
  }
  async function action(body: Record<string, unknown>, success: string) {
    const response = await fetch('/api/drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    if (library && body.operation !== 'create-library') await loadDirectory(library, path);
    showToast(success);
    return data;
  }
  async function renameInline(item: DriveItem, name: string) {
    if (name.trim() === item.name) return;
    await action(
      {
        operation: 'rename',
        libraryId: item.libraryId,
        path: item.path,
        itemType: item.type,
        name: name.trim(),
      },
      `Renamed to ${name.trim()}`,
    );
  }
  async function itemAction(item: DriveItem, operation: 'star' | 'unstar') {
    try {
      const response = await fetch('/api/item-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, libraryId: item.libraryId, path: item.path }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setStarred(current => {
        const next = new Set(current);
        const key = `${item.libraryId}:${item.path}`;
        if (operation === 'star') next.add(key);
        else next.delete(key);
        return next;
      });
      if (operation === 'unstar' && active === 'starred')
        setSectionData(current => ({
          ...current,
          items: current?.items?.filter(
            value => !(value.libraryId === item.libraryId && value.path === item.path),
          ),
        }));
      showToast(operation === 'star' ? 'Added to Starred' : 'Removed from Starred');
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : 'That action could not be completed.', 'error');
      throw reason;
    }
  }
  function updateUpload(id: string, patch: Partial<UploadTask>) {
    setUploadTasks(current => current.map(task => (task.id === id ? { ...task, ...patch } : task)));
  }
  function startUpload(file: File, id = crypto.randomUUID()) {
    if (!library || library.permission === 'r') {
      showToast(!library ? 'Open a drive before uploading files.' : 'This drive is view only.', 'info');
      return;
    }
    const targetLibrary = library;
    const targetPath = path;
    uploadFiles.current.set(id, file);
    setUploadsExpanded(true);
    setUploadTasks(current =>
      current.some(task => task.id === id)
        ? current.map(task =>
            task.id === id
              ? { id, name: file.name, size: file.size, loaded: 0, progress: 0, status: 'queued' }
              : task,
          )
        : [...current, { id, name: file.name, size: file.size, loaded: 0, progress: 0, status: 'queued' }],
    );
    const form = new FormData();
    form.append('file', file);
    form.append('parent_dir', targetPath);
    form.append('replace', '0');
    const xhr = new XMLHttpRequest();
    uploadXhrs.current.set(id, xhr);
    xhr.open(
      'POST',
      `/api/upload?libraryId=${encodeURIComponent(targetLibrary.id)}&path=${encodeURIComponent(targetPath)}`,
    );
    xhr.upload.onprogress = event => {
      if (event.lengthComputable)
        updateUpload(id, {
          loaded: Math.min(file.size, Math.round((file.size * event.loaded) / event.total)),
          progress: Math.min(99, Math.round((event.loaded / event.total) * 100)),
          status: 'uploading',
        });
    };
    xhr.onload = () => {
      uploadXhrs.current.delete(id);
      if (xhr.status >= 200 && xhr.status < 300) {
        updateUpload(id, { loaded: file.size, progress: 100, status: 'complete', error: undefined });
        showToast(`${file.name} uploaded`);
        if (
          currentLocation.current.libraryId === targetLibrary.id &&
          currentLocation.current.path === targetPath
        ) {
          if (uploadRefreshTimer.current) clearTimeout(uploadRefreshTimer.current);
          uploadRefreshTimer.current = setTimeout(
            () => void loadDirectory(targetLibrary, targetPath, true),
            180,
          );
        }
        return;
      }
      if (xhr.status === 401) {
        router.replace('/');
        router.refresh();
        return;
      }
      let message = 'Upload failed. Try again.';
      try {
        message = JSON.parse(xhr.responseText).message || message;
      } catch {}
      updateUpload(id, { status: 'error', error: message });
    };
    xhr.onerror = () => {
      uploadXhrs.current.delete(id);
      updateUpload(id, { status: 'error', error: 'Network error. Check the connection and try again.' });
      showToast(`${file.name} could not be uploaded.`, 'error');
    };
    xhr.onabort = () => {
      uploadXhrs.current.delete(id);
      updateUpload(id, { status: 'canceled', error: undefined });
    };
    updateUpload(id, { status: 'uploading' });
    xhr.send(form);
  }
  function upload(files: FileList | File[]) {
    Array.from(files).forEach(file => startUpload(file));
  }
  function cancelUpload(id: string) {
    uploadXhrs.current.get(id)?.abort();
  }
  function retryUpload(id: string) {
    const file = uploadFiles.current.get(id);
    if (file) startUpload(file, id);
  }
  function clearFinishedUploads() {
    setUploadTasks(current => {
      const removable = new Set(
        current
          .filter(task => task.status === 'complete' || task.status === 'canceled' || task.status === 'error')
          .map(task => task.id),
      );
      removable.forEach(id => uploadFiles.current.delete(id));
      return current.filter(task => !removable.has(task.id));
    });
  }
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
    router.refresh();
  }
  async function changeSection(id: string) {
    setActive(id);
    setMobileNav(false);
    setSelected(new Set());
    setDetails(null);
    setResults(null);
    setQuery('');
    setError('');
    if (id === 'files') {
      setSectionData(null);
      if (!library && libraries.length === 1) setLibrary(libraries[0]);
      setPath('/');
      return;
    }
    setSectionData(null);
    setSectionLoading(true);
    try {
      const response = await fetch(`/api/sections?section=${encodeURIComponent(id)}`);
      if (handleUnauthorized(response)) return;
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setSectionData(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not load ${id}.`);
    } finally {
      setSectionLoading(false);
    }
  }
  function theme() {
    const next = themeMode === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setThemeMode(next);
    localStorage.setItem('seafile-facelift-theme', next);
  }
  function changeView(next: View) {
    setView(next);
    localStorage.setItem('seafile-facelift-view', next);
  }

  const canEdit = Boolean(library && library.permission !== 'r');
  return (
    <div
      className="app"
      style={{ '--accent': config.accent } as React.CSSProperties}
      onClick={() => {
        setMenu(null);
        setNewMenu(false);
        setLibraryMenu(false);
        setProfileMenu(false);
        setAdvancedOpen(false);
      }}
    >
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation">
          <span />
          <span />
          <span />
        </button>
        <div className="library-switcher-wrap">
          <button
            className="library-switcher"
            onClick={event => {
              event.stopPropagation();
              setLibraryMenu(value => !value);
              setNewMenu(false);
              setProfileMenu(false);
            }}
            aria-haspopup="menu"
            aria-expanded={libraryMenu}
          >
            <span className="library-switcher-icon">
              <Icon name="folder" />
            </span>
            <span>
              <small>Library</small>
              <strong>{library?.name || 'Select a library'}</strong>
            </span>
            <Icon name="chevron" />
          </button>
          {libraryMenu && (
            <div className="popover library-popover" role="menu" onClick={event => event.stopPropagation()}>
              {libraries.map(value => (
                <button
                  key={value.id}
                  role="menuitem"
                  className={library?.id === value.id ? 'active' : ''}
                  onClick={() => {
                    setActive('files');
                    openLibrary(value);
                    setLibraryMenu(false);
                  }}
                >
                  <Icon name="folder" />
                  <span>{value.name}</span>
                  {library?.id === value.id && (
                    <span className="current-mark">
                      <Icon name="check" />
                    </span>
                  )}
                </button>
              ))}
              <div />
              <button
                role="menuitem"
                onClick={() => {
                  setModal({ type: 'new-library' });
                  setLibraryMenu(false);
                }}
              >
                <Icon name="plus" />
                New library
              </button>
            </div>
          )}
        </div>
        <div className="search-wrap">
          <Icon name="search" />
          <input
            ref={searchRef}
            value={query}
            onFocus={() => {
              setProfileMenu(false);
              setNewMenu(false);
              setMenu(null);
            }}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search files and folders"
            aria-label="Search files and folders"
          />
          <kbd>⌘ K</kbd>
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search">
              <Icon name="close" />
            </button>
          )}
          <button
            className={`advanced-trigger ${activeFilterCount ? 'active' : ''}`}
            onClick={event => {
              event.stopPropagation();
              setDraftFilters(searchFilters);
              setAdvancedOpen(value => !value);
            }}
            aria-label="Advanced search"
            aria-expanded={advancedOpen}
          >
            <Icon name="filter" />
            {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
          </button>
        </div>
        <div className="top-actions">
          <button
            className="icon-button"
            onClick={theme}
            aria-label={`Use ${themeMode === 'dark' ? 'light' : 'dark'} theme`}
            title={`Use ${themeMode === 'dark' ? 'light' : 'dark'} theme`}
          >
            <Icon name={themeMode === 'dark' ? 'sun' : 'moon'} />
          </button>
          <div className="profile-wrap">
            <button
              className="avatar"
              onClick={event => {
                event.stopPropagation();
                setNewMenu(false);
                setMenu(null);
                setProfileMenu(value => !value);
              }}
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={profileMenu}
            >
              {username.slice(0, 2).toUpperCase()}
            </button>
            {profileMenu && (
              <div className="popover profile-popover" role="menu" onClick={event => event.stopPropagation()}>
                <div className="profile-summary">
                  <span>{username.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{username}</strong>
                    <small>Seafile account</small>
                  </div>
                </div>
                <a href={`${config.publicSeafileUrl}/profile/`} target="_blank">
                  <Icon name="info" />
                  Manage profile
                </a>
                <a href={config.publicSeafileUrl} target="_blank">
                  <Icon name="files" />
                  Open Seafile
                </a>
                <div className="menu-divider" />
                <button onClick={logout}>
                  <Icon name="logout" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
        {advancedOpen && (
          <AdvancedSearch
            filters={draftFilters}
            setFilters={setDraftFilters}
            libraries={libraries}
            apply={() => {
              setSearchFilters(draftFilters);
              setAdvancedOpen(false);
              searchRef.current?.focus();
            }}
            clear={() => {
              setDraftFilters(emptyFilters);
              setSearchFilters(emptyFilters);
              setAdvancedOpen(false);
            }}
            close={() => setAdvancedOpen(false)}
          />
        )}
      </header>
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="sidebar-mobile-head">
          <strong>{config.appName}</strong>
          <button onClick={() => setMobileNav(false)} aria-label="Close navigation">
            <Icon name="close" />
          </button>
        </div>
        <div className="new-wrap">
          <button
            className="new-button"
            aria-haspopup="menu"
            aria-expanded={newMenu}
            onClick={e => {
              e.stopPropagation();
              setProfileMenu(false);
              setLibraryMenu(false);
              setMenu(null);
              setNewMenu(!newMenu);
            }}
          >
            <Icon name="plus" />
            New
          </button>
          {newMenu && (
            <div className="popover new-popover" role="menu" onClick={e => e.stopPropagation()}>
              <button
                role="menuitem"
                onClick={() => {
                  setModal({ type: 'new-library' });
                  setNewMenu(false);
                }}
              >
                <Icon name="files" />
                New library
              </button>
              <div />
              <button
                role="menuitem"
                disabled={!canEdit}
                onClick={() => {
                  setModal({ type: 'new-folder' });
                  setNewMenu(false);
                }}
              >
                <Icon name="folder" />
                New folder
              </button>
              <button
                role="menuitem"
                disabled={!canEdit}
                onClick={() => {
                  uploadRef.current?.click();
                  setNewMenu(false);
                }}
              >
                <Icon name="upload" />
                Upload files
              </button>
              {!canEdit && (
                <p>{library ? 'This drive is view only.' : 'Open a drive to create folders or upload.'}</p>
              )}
            </div>
          )}
          <input
            ref={uploadRef}
            hidden
            type="file"
            multiple
            onChange={e => {
              if (e.currentTarget.files) upload(e.currentTarget.files);
              e.currentTarget.value = '';
            }}
          />
        </div>
        <nav>
          {nav.map(item => (
            <button
              key={item.id}
              className={active === item.id ? 'active' : ''}
              aria-current={active === item.id ? 'page' : undefined}
              onClick={() => void changeSection(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="nav-divider" />
        <nav>
          <button
            className={active === 'trash' ? 'active' : ''}
            aria-current={active === 'trash' ? 'page' : undefined}
            onClick={() => void changeSection('trash')}
          >
            <Icon name="trash" />
            Trash
          </button>
        </nav>
        <div className="storage">
          <div className="storage-summary">
            <strong>Storage</strong>
            <span>
              {storage
                ? storage.total
                  ? `${formatSize(storage.used)} of ${formatSize(storage.total)}`
                  : `${formatSize(storage.used)} used`
                : 'Loading usage…'}
            </span>
          </div>
          <div
            className="storage-track"
            role="progressbar"
            aria-label="Storage used"
            aria-valuemin={0}
            aria-valuemax={storage?.total || 100}
            aria-valuenow={storage?.used || 0}
          >
            <span
              style={{
                width: storage?.total ? `${Math.min(100, (storage.used / storage.total) * 100)}%` : '0%',
              }}
            />
          </div>
        </div>
        <div className="sidebar-bottom">
          <a href={config.adminUrl || config.publicSeafileUrl} target="_blank">
            Open administration ↗
          </a>
          <span title={`Seafile-Facelift ${config.version}`}>Version {config.version}</span>
        </div>
      </aside>
      {mobileNav && (
        <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />
      )}
      <main
        className="content"
        onDragEnter={e => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={e => e.preventDefault()}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
        }}
        onDrop={e => {
          e.preventDefault();
          setDragActive(false);
          upload(e.dataTransfer.files);
        }}
      >
        <div className="content-head">
          <div>
            {results ? (
              <>
                <p className="eyebrow">SEARCH RESULTS</p>
                <h1>“{query}”</h1>
              </>
            ) : active === 'files' && library ? (
              <div className="breadcrumbs">
                {breadcrumbs.map((crumb, i) => (
                  <span key={crumb.path + i}>
                    {i > 0 && <Icon name="chevron" />}
                    <button
                      onClick={() => {
                        setDetails(null);
                        setPath(crumb.path);
                      }}
                    >
                      {crumb.label}
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <>
                <p className="eyebrow">WORKSPACE</p>
                <h1>
                  {active === 'trash' ? 'Trash' : nav.find(item => item.id === active)?.label || 'My files'}
                </h1>
              </>
            )}
          </div>
          {active !== 'trash' && (
            <div className="view-actions">
              <button
                className={view === 'list' ? 'active' : ''}
                aria-pressed={view === 'list'}
                onClick={() => changeView('list')}
                aria-label="List view"
              >
                <Icon name="list" />
              </button>
              <button
                className={view === 'grid' ? 'active' : ''}
                aria-pressed={view === 'grid'}
                onClick={() => changeView('grid')}
                aria-label="Grid view"
              >
                <Icon name="grid" />
              </button>
            </div>
          )}
        </div>
        {selected.size > 0 && (
          <div className="selection-bar">
            <span className="selection-count">
              <span>
                <Icon name="check" />
              </span>
              <strong>
                {selected.size} {selected.size === 1 ? 'item' : 'items'} selected
              </strong>
            </span>
            <div className="selection-actions">
              {selectedItems.length === 1 && <button onClick={() => openItem(selectedItems[0])}>Open</button>}
              <button
                onClick={() => downloadAll(selectedItems)}
                disabled={!selectedItems.some(item => item.type === 'file')}
              >
                <Icon name="download" />
                Download
              </button>
              {canEdit && (
                <>
                  <button onClick={() => setModal({ type: 'move', items: selectedItems })}>
                    <Icon name="move" />
                    Move
                  </button>
                  <button
                    className="bulk-danger"
                    onClick={() => setModal({ type: 'delete', items: selectedItems })}
                  >
                    <Icon name="trash" />
                    Trash
                  </button>
                </>
              )}
              {selectedItems.length === 1 && (
                <button onClick={() => setDetails(selectedItems[0])}>Details</button>
              )}
              <button
                className="clear-selection"
                onClick={() => setSelected(new Set())}
                aria-label="Clear selection"
              >
                <Icon name="close" />
              </button>
            </div>
          </div>
        )}
        {error ? (
          <ErrorState
            message={error}
            retry={() =>
              active === 'files'
                ? library
                  ? loadDirectory(library, path)
                  : loadLibraries()
                : void changeSection(active)
            }
          />
        ) : loading || sectionLoading ? (
          <Loading view={view} />
        ) : results ? (
          <SearchResults results={results} open={openResult} />
        ) : active !== 'files' ? (
          <SectionView
            section={active}
            data={sectionData}
            openLibrary={value => {
              setActive('files');
              openLibrary(value);
            }}
            openItem={openResult}
            seafileUrl={config.publicSeafileUrl}
          />
        ) : !library ? (
          <LibraryView libraries={libraries} open={openLibrary} />
        ) : visibleItems.length === 0 ? (
          <Empty onNew={() => setModal({ type: 'new-folder' })} onUpload={() => uploadRef.current?.click()} />
        ) : (
          <FileView
            view={view}
            items={visibleItems}
            selected={selected}
            setSelected={setSelected}
            menu={menu}
            setMenu={setMenu}
            toggle={toggle}
            open={openItem}
            download={download}
            rename={renameInline}
            itemAction={itemAction}
            starred={starred}
            setModal={setModal}
            setDetails={setDetails}
            canEdit={canEdit}
          />
        )}
        {dragActive && (
          <div className="drop-overlay">
            <div>
              <Icon name="upload" />
              <strong>{canEdit ? 'Drop files to upload' : 'Uploads unavailable'}</strong>
              <span>
                {canEdit
                  ? `They’ll be added to ${path === '/' ? 'this drive' : path}.`
                  : library
                    ? 'This drive is view only.'
                    : 'Open a drive first.'}
              </span>
            </div>
          </div>
        )}
      </main>
      <nav className="bottom-nav">
        {nav.slice(0, 4).map(item => (
          <button
            key={item.id}
            className={active === item.id ? 'active' : ''}
            aria-current={active === item.id ? 'page' : undefined}
            onClick={() => void changeSection(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label.replace('My ', '')}</span>
          </button>
        ))}
      </nav>
      {details && <Details item={details} close={() => setDetails(null)} />}{' '}
      {modal && (
        <ModalView
          modal={modal}
          library={library}
          path={path}
          libraries={libraries}
          close={() => setModal(null)}
          submit={async body => {
            const data = await action(
              body,
              modal.type === 'new-library'
                ? 'Library created'
                : modal.type === 'delete'
                  ? `${modal.items?.length || 1} item${modal.items?.length === 1 ? '' : 's'} moved to trash`
                  : modal.type === 'copy'
                    ? 'Copy created'
                    : 'Changes saved',
            );
            if (modal.type === 'new-library' && data.library) {
              setLibraries(current => [
                ...current.filter(value => value.id !== data.library.id),
                data.library,
              ]);
              setActive('files');
              openLibrary(data.library);
            }
            setSelected(new Set());
            setModal(null);
            setMenu(null);
          }}
          download={download}
        />
      )}{' '}
      {uploadTasks.length > 0 && (
        <UploadPanel
          tasks={uploadTasks}
          expanded={uploadsExpanded}
          setExpanded={setUploadsExpanded}
          cancel={cancelUpload}
          retry={retryUpload}
          clearFinished={clearFinishedUploads}
        />
      )}{' '}
      {toast && (
        <div className={`toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          <span>{toast.tone === 'error' ? '!' : toast.tone === 'info' ? 'i' : <Icon name="check" />}</span>
          {toast.message}
        </div>
      )}
    </div>
  );
}

function AdvancedSearch({
  filters,
  setFilters,
  libraries,
  apply,
  clear,
  close,
}: {
  filters: SearchFilters;
  setFilters: (filters: SearchFilters) => void;
  libraries: DriveLibrary[];
  apply: () => void;
  clear: () => void;
  close: () => void;
}) {
  const update = (key: keyof SearchFilters, value: string) => setFilters({ ...filters, [key]: value });
  return (
    <form
      className="advanced-search"
      role="dialog"
      aria-label="Advanced search filters"
      onClick={event => event.stopPropagation()}
      onSubmit={event => {
        event.preventDefault();
        apply();
      }}
    >
      <div className="advanced-head">
        <div>
          <Icon name="filter" />
          <div>
            <strong>Advanced search</strong>
            <span>Narrow results by location, type, date, or size.</span>
          </div>
        </div>
        <button type="button" onClick={close} aria-label="Close advanced search">
          <Icon name="close" />
        </button>
      </div>
      <div className="advanced-fields">
        <label>
          Library
          <select value={filters.libraryId} onChange={event => update('libraryId', event.target.value)}>
            <option value="">All libraries</option>
            {libraries.map(library => (
              <option key={library.id} value={library.id}>
                {library.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          File type
          <select value={filters.type} onChange={event => update('type', event.target.value)}>
            <option value="any">Any type</option>
            <option value="folder">Folders</option>
            <option value="image">Images</option>
            <option value="pdf">PDFs</option>
            <option value="document">Documents</option>
            <option value="sheet">Spreadsheets</option>
            <option value="slides">Presentations</option>
            <option value="video">Videos</option>
            <option value="audio">Audio</option>
            <option value="archive">Archives</option>
            <option value="text">Text and code</option>
            <option value="other">Other files</option>
          </select>
        </label>
        <label>
          Modified after
          <input type="date" value={filters.after} onChange={event => update('after', event.target.value)} />
        </label>
        <label>
          Modified before
          <input
            type="date"
            value={filters.before}
            onChange={event => update('before', event.target.value)}
          />
        </label>
        <label>
          Minimum size <span>MB</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={filters.minSize}
            onChange={event => update('minSize', event.target.value)}
            placeholder="No minimum"
          />
        </label>
        <label>
          Maximum size <span>MB</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={filters.maxSize}
            onChange={event => update('maxSize', event.target.value)}
            placeholder="No maximum"
          />
        </label>
        <label>
          Sort results
          <select value={filters.sort} onChange={event => update('sort', event.target.value)}>
            <option value="relevance">Best match</option>
            <option value="name">Name</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="largest">Largest first</option>
            <option value="smallest">Smallest first</option>
          </select>
        </label>
      </div>
      <div className="advanced-actions">
        <button type="button" className="secondary" onClick={clear}>
          Clear filters
        </button>
        <button className="primary">Apply filters</button>
      </div>
    </form>
  );
}

function LibraryView({
  libraries,
  open,
}: {
  libraries: DriveLibrary[];
  open: (library: DriveLibrary) => void;
}) {
  return libraries.length ? (
    <div className="library-grid">
      {libraries.map(lib => (
        <button
          className="library-card"
          key={lib.id}
          onDoubleClick={() => open(lib)}
          onClick={() => open(lib)}
        >
          <div className="folder-art">
            <Icon name="folder" />
          </div>
          <div>
            <strong>{lib.name}</strong>
            <span>
              {lib.encrypted ? 'Encrypted drive' : lib.permission === 'r' ? 'View only' : 'Your drive'}
            </span>
          </div>
          <Icon name="chevron" className="card-arrow" />
        </button>
      ))}
    </div>
  ) : (
    <div className="empty no-drives">
      <div className="error-mark">!</div>
      <h2>Seafile returned no drives</h2>
      <p>
        Your connection is working, but this account has no accessible libraries. Confirm the account has a
        library in Seafile or contact your administrator.
      </p>
    </div>
  );
}
function SectionView({
  section,
  data,
  openLibrary,
  openItem,
  seafileUrl,
}: {
  section: string;
  data: SectionData | null;
  openLibrary: (library: DriveLibrary) => void;
  openItem: (item: SearchResult) => void;
  seafileUrl: string;
}) {
  if (section === 'shared')
    return data?.libraries?.length ? (
      <LibraryView libraries={data.libraries} open={openLibrary} />
    ) : (
      <Empty
        title="Nothing shared with you"
        description="Libraries and folders shared through Seafile will appear here."
      />
    );
  const items = data?.items || [];
  if (section === 'trash')
    return items.length ? (
      <>
        <div className="section-note">
          <span>Deleted items are shown from Seafile.</span>
          <a href={seafileUrl} target="_blank">
            Open Seafile to restore or permanently delete
          </a>
        </div>
        <div className="section-list">
          {items.map(item => (
            <div key={item.id}>
              <div className={`file-icon ${item.type}`}>
                <Icon name={item.type === 'folder' ? 'folder' : 'file'} />
              </div>
              <div>
                <strong>{item.name}</strong>
                <span>{item.location}</span>
              </div>
              <span>Deleted {formatDate(item.modifiedAt)}</span>
            </div>
          ))}
        </div>
      </>
    ) : (
      <Empty
        title="Trash is empty"
        description="Items moved to trash will appear here when the server retains them."
      />
    );
  if (!items.length)
    return (
      <Empty
        title={section === 'starred' ? 'No starred items' : 'No recent items'}
        description={
          section === 'starred'
            ? 'Starred Seafile files, folders, and drives will appear here.'
            : 'Recently modified items will appear here.'
        }
      />
    );
  return <SearchResults results={items} open={openItem} showStars={section === 'starred'} />;
}
function SearchResults({
  results,
  open,
  showStars = false,
}: {
  results: SearchResult[];
  open: (result: SearchResult) => void;
  showStars?: boolean;
}) {
  return results.length ? (
    <div className={`search-results ${showStars ? 'with-stars' : ''}`}>
      {results.map(result => (
        <button key={result.id} onClick={() => open(result)}>
          {showStars && (
            <span className="result-star">
              <Icon name="star" />
            </span>
          )}
          <div className={`file-icon ${fileIcon(result)}`}>
            <Icon name={fileIcon(result)} />
          </div>
          <div>
            <strong>{displayName(result)}</strong>
            <span>
              {fileExtension(result).toUpperCase() || result.location}{' '}
              {fileExtension(result) && `· ${result.location}`}
            </span>
          </div>
          <span>{formatDate(result.modifiedAt)}</span>
          <Icon name="chevron" />
        </button>
      ))}
    </div>
  ) : (
    <Empty title="No matches" description="Try a broader search or check the spelling." />
  );
}
function FileView({
  view,
  items,
  selected,
  setSelected,
  menu,
  setMenu,
  toggle,
  open,
  download,
  rename,
  itemAction,
  starred,
  setModal,
  setDetails,
  canEdit,
}: {
  view: View;
  items: DriveItem[];
  selected: Set<string>;
  setSelected: (value: Set<string>) => void;
  menu: string | null;
  setMenu: (id: string | null) => void;
  toggle: (item: DriveItem, additive: boolean) => void;
  open: (item: DriveItem) => void;
  download: (item: DriveItem) => void;
  rename: (item: DriveItem, name: string) => Promise<void>;
  itemAction: (item: DriveItem, operation: 'star' | 'unstar') => Promise<void>;
  starred: Set<string>;
  setModal: (modal: Modal) => void;
  setDetails: (item: DriveItem) => void;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<DriveItem | null>(null);
  const [draft, setDraft] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const renameBusyRef = useRef(false);
  const cancelRenameRef = useRef(false);
  function beginRename(item: DriveItem) {
    cancelRenameRef.current = false;
    setEditing(item);
    setDraft(displayName(item));
    setMenu(null);
  }
  async function finishRename() {
    if (!editing || !draft.trim() || renameBusyRef.current || cancelRenameRef.current) return;
    // Submit and blur can fire together. The ref closes that race before React commits state.
    renameBusyRef.current = true;
    setRenameBusy(true);
    try {
      await rename(editing, renamedFile(editing, draft.trim()));
      setEditing(null);
    } finally {
      renameBusyRef.current = false;
      setRenameBusy(false);
    }
  }
  const menuFor = (item: DriveItem) => (
    <ItemMenu
      item={item}
      open={open}
      download={download}
      beginRename={beginRename}
      itemAction={itemAction}
      isStarred={starred.has(`${item.libraryId}:${item.path}`)}
      setModal={setModal}
      setDetails={setDetails}
      close={() => setMenu(null)}
      canEdit={canEdit}
    />
  );
  const nameFor = (item: DriveItem) =>
    editing?.id === item.id ? (
      <form
        className="inline-rename"
        onSubmit={event => {
          event.preventDefault();
          event.stopPropagation();
          void finishRename();
        }}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
      >
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          autoFocus
          disabled={renameBusy}
          aria-label={`Rename ${item.name}`}
          onBlur={() => {
            if (!cancelRenameRef.current) void finishRename();
          }}
          onKeyDown={event => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              void finishRename();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelRenameRef.current = true;
              setEditing(null);
            }
          }}
        />
      </form>
    ) : (
      <strong>{displayName(item)}</strong>
    );
  const starFor = (item: DriveItem, className = '') => {
    const isStarred = starred.has(`${item.libraryId}:${item.path}`);
    return (
      <button
        className={`star-toggle ${isStarred ? 'active' : ''} ${className}`}
        aria-label={`${isStarred ? 'Remove star from' : 'Star'} ${item.name}`}
        aria-pressed={isStarred}
        onClick={event => {
          event.stopPropagation();
          void itemAction(item, isStarred ? 'unstar' : 'star').catch(() => {});
        }}
      >
        <Icon name="star" />
      </button>
    );
  };
  if (view === 'grid')
    return (
      <div className="file-grid" role="grid">
        {items.map(item => {
          const isSelected = selected.has(item.id);
          return (
            <div
              key={item.id}
              className={`grid-item ${isSelected ? 'selected' : ''}`}
              role="gridcell"
              aria-selected={isSelected}
              tabIndex={0}
              onClick={() => editing?.id !== item.id && open(item)}
              onKeyDown={event => {
                if (event.key === 'Enter' && editing?.id !== item.id) open(item);
                if (event.key === ' ') {
                  event.preventDefault();
                  toggle(item, true);
                }
              }}
            >
              {starFor(item, 'grid-star')}
              <button
                className={`selection-indicator ${isSelected ? 'checked' : ''}`}
                role="checkbox"
                aria-checked={isSelected}
                aria-label={`${isSelected ? 'Deselect' : 'Select'} ${item.name}`}
                onClick={event => {
                  event.stopPropagation();
                  toggle(item, true);
                }}
              >
                {isSelected && <Icon name="check" />}
              </button>
              <button
                className="more-button"
                onClick={event => {
                  event.stopPropagation();
                  setMenu(menu === item.id ? null : item.id);
                }}
                aria-label={`Actions for ${item.name}`}
              >
                <Icon name="more" />
              </button>
              <div className={`grid-preview ${fileIcon(item)}`}>
                {isImage(item) ? (
                  <ProgressiveImage item={item} mode="tile" />
                ) : (
                  <Icon name={fileIcon(item)} />
                )}
              </div>
              <div className="grid-name">
                <div>{nameFor(item)}</div>
                <span>
                  {fileExtension(item).toUpperCase() || 'Folder'} · {formatSize(item.size)}
                </span>
              </div>
              {menu === item.id && menuFor(item)}
            </div>
          );
        })}
      </div>
    );
  const allSelected = items.length > 0 && items.every(item => selected.has(item.id));
  return (
    <div className="file-table" role="grid">
      <div className="table-head" role="row">
        <span role="columnheader" aria-label="Starred" />
        <span role="columnheader">
          <button
            className={`row-selector ${allSelected ? 'checked' : ''}`}
            role="checkbox"
            aria-checked={allSelected}
            aria-label={allSelected ? 'Deselect all files' : 'Select all files'}
            onClick={() => setSelected(allSelected ? new Set() : new Set(items.map(item => item.id)))}
          >
            {allSelected && <Icon name="check" />}
          </button>
        </span>
        <span role="columnheader">Name</span>
        <span role="columnheader">Modified</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Size</span>
        <span role="columnheader" />
      </div>
      {items.map(item => {
        const isSelected = selected.has(item.id);
        return (
          <div
            key={item.id}
            className={`file-row ${isSelected ? 'selected' : ''}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            onClick={() => editing?.id !== item.id && open(item)}
            onKeyDown={event => {
              if (event.key === 'Enter' && editing?.id !== item.id) open(item);
              if (event.key === ' ') {
                event.preventDefault();
                toggle(item, true);
              }
            }}
            onContextMenu={event => {
              event.preventDefault();
              if (!selected.has(item.id)) setSelected(new Set([item.id]));
              setMenu(item.id);
            }}
          >
            <span role="gridcell" className="star-cell">
              {starFor(item)}
            </span>
            <span role="gridcell" className="select-cell">
              <button
                className={`row-selector ${isSelected ? 'checked' : ''}`}
                role="checkbox"
                aria-checked={isSelected}
                aria-label={`${isSelected ? 'Deselect' : 'Select'} ${item.name}`}
                onClick={event => {
                  event.stopPropagation();
                  toggle(item, true);
                }}
              >
                {isSelected && <Icon name="check" />}
              </button>
            </span>
            <span role="gridcell" className="file-name">
              <span className={`file-icon ${fileIcon(item)}`}>
                <Icon name={fileIcon(item)} />
              </span>
              <span>
                {nameFor(item)}
                <small>{item.type === 'folder' ? 'Folder' : formatSize(item.size)}</small>
              </span>
            </span>
            <span role="gridcell">{formatDate(item.modifiedAt)}</span>
            <span role="gridcell" className="file-extension">
              {fileExtension(item).toUpperCase() || '—'}
            </span>
            <span role="gridcell">{formatSize(item.size)}</span>
            <span role="gridcell" className="row-action">
              <button
                onClick={event => {
                  event.stopPropagation();
                  setMenu(menu === item.id ? null : item.id);
                }}
                aria-label={`Actions for ${item.name}`}
              >
                <Icon name="more" />
              </button>
              {menu === item.id && menuFor(item)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
function UploadPanel({
  tasks,
  expanded,
  setExpanded,
  cancel,
  retry,
  clearFinished,
}: {
  tasks: UploadTask[];
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  clearFinished: () => void;
}) {
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = tasks.filter(task => task.status === 'queued' || task.status === 'uploading');
  const finished = tasks.filter(task => task.status === 'complete' || task.status === 'canceled');
  const failed = tasks.filter(task => task.status === 'error');
  const activeBytes = active.reduce((sum, task) => sum + task.size, 0);
  const loadedBytes = active.reduce((sum, task) => sum + task.loaded, 0);
  const overall = activeBytes ? Math.round((loadedBytes / activeBytes) * 100) : 100;
  const title = active.length
    ? `Uploading ${active.length} ${active.length === 1 ? 'file' : 'files'}`
    : failed.length
      ? `${failed.length} upload ${failed.length === 1 ? 'needs' : 'need'} attention`
      : 'Uploads complete';
  function keepVisible() {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (!active.length) hideTimer.current = setTimeout(() => setVisible(false), 10_000);
  }
  useEffect(() => {
    const reveal = setTimeout(() => setVisible(true), 0);
    if (!active.length) hideTimer.current = setTimeout(() => setVisible(false), 10_000);
    return () => {
      clearTimeout(reveal);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [tasks, active.length]);
  if (!visible) return null;
  return (
    <section
      className={`upload-panel ${expanded ? '' : 'collapsed'}`}
      aria-label="Uploads"
      onMouseEnter={() => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
      }}
      onMouseLeave={keepVisible}
      onFocus={keepVisible}
      onClick={keepVisible}
    >
      <header>
        <button className="upload-summary" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          <span
            className={
              failed.length
                ? 'upload-state error'
                : active.length
                  ? 'upload-state active'
                  : 'upload-state complete'
            }
          >
            {failed.length ? '!' : active.length ? <span className="spinner dark" /> : <Icon name="check" />}
          </span>
          <span>
            <strong>{title}</strong>
            <small>
              {active.length
                ? `${overall}% · ${formatSize(loadedBytes)} of ${formatSize(activeBytes)}`
                : `${tasks.length} ${tasks.length === 1 ? 'file' : 'files'}`}
            </small>
          </span>
        </button>
        <div>
          {(finished.length > 0 || failed.length > 0) && (
            <button onClick={clearFinished}>Clear finished</button>
          )}
          <button
            className="panel-toggle"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Collapse uploads' : 'Expand uploads'}
          >
            {expanded ? '⌄' : '⌃'}
          </button>
        </div>
      </header>
      {expanded && (
        <div className="upload-list">
          {tasks.map(task => (
            <article key={task.id}>
              <div className="upload-file-icon">
                <Icon name={fileIcon({ ...task, id: task.id, type: 'file', path: '', libraryId: '' })} />
              </div>
              <div className="upload-file">
                <div>
                  <strong title={task.name}>{task.name}</strong>
                  <span>
                    {task.status === 'complete'
                      ? 'Uploaded'
                      : task.status === 'canceled'
                        ? 'Canceled'
                        : task.status === 'error'
                          ? 'Upload failed'
                          : `${formatSize(task.loaded)} of ${formatSize(task.size)}`}
                  </span>
                </div>
                <div
                  className={`progress-track ${task.status}`}
                  role="progressbar"
                  aria-label={`Upload progress for ${task.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={task.progress}
                >
                  <span style={{ width: `${task.progress}%` }} />
                </div>
                {task.error && <small className="upload-error">{task.error}</small>}
              </div>
              <div className="upload-task-action">
                {(task.status === 'queued' || task.status === 'uploading') && (
                  <button
                    onClick={() => cancel(task.id)}
                    aria-label={`Cancel upload of ${task.name}`}
                    title="Cancel upload"
                  >
                    <Icon name="close" />
                  </button>
                )}
                {(task.status === 'error' || task.status === 'canceled') && (
                  <button className="retry-button" onClick={() => retry(task.id)}>
                    Retry
                  </button>
                )}
                {task.status === 'complete' && (
                  <span className="complete-check">
                    <Icon name="check" />
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function ItemMenu({
  item,
  open,
  download,
  beginRename,
  itemAction,
  isStarred,
  setModal,
  setDetails,
  close,
  canEdit,
}: {
  item: DriveItem;
  open: (item: DriveItem) => void;
  download: (item: DriveItem) => void;
  beginRename: (item: DriveItem) => void;
  itemAction: (item: DriveItem, operation: 'star' | 'unstar') => Promise<void>;
  isStarred: boolean;
  setModal: (modal: Modal) => void;
  setDetails: (item: DriveItem) => void;
  close: () => void;
  canEdit: boolean;
}) {
  return (
    <div className="popover item-menu" role="menu" onClick={event => event.stopPropagation()}>
      <button
        role="menuitem"
        onClick={() => {
          open(item);
          close();
        }}
      >
        <Icon name="files" />
        Open
      </button>
      {item.type === 'file' && (
        <button
          role="menuitem"
          onClick={() => {
            download(item);
            close();
          }}
        >
          <Icon name="download" />
          Download
        </button>
      )}
      <button
        role="menuitem"
        onClick={() => {
          void itemAction(item, isStarred ? 'unstar' : 'star').catch(() => {});
          close();
        }}
      >
        <Icon name="star" />
        {isStarred ? 'Remove star' : 'Add to Starred'}
      </button>
      <button
        role="menuitem"
        onClick={() => {
          setModal({ type: 'share', item });
          close();
        }}
      >
        <Icon name="link" />
        Share
      </button>
      <button
        role="menuitem"
        onClick={() => {
          setModal({ type: 'manage-shares', item });
          close();
        }}
      >
        <Icon name="shared" />
        Manage shares
      </button>
      <div />
      {canEdit && (
        <>
          <button role="menuitem" onClick={() => beginRename(item)}>
            <Icon name="edit" />
            Rename
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setModal({ type: 'copy', item });
              close();
            }}
          >
            <Icon name="copy" />
            Make a copy
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setModal({ type: 'move', item });
              close();
            }}
          >
            <Icon name="move" />
            Move
          </button>
        </>
      )}
      <button
        role="menuitem"
        onClick={() => {
          setDetails(item);
          close();
        }}
      >
        <Icon name="info" />
        View details
      </button>
      {canEdit && (
        <>
          <div />
          <button
            role="menuitem"
            className="danger"
            onClick={() => {
              setModal({ type: 'delete', item });
              close();
            }}
          >
            <Icon name="trash" />
            Move to trash
          </button>
        </>
      )}
    </div>
  );
}
function ModalView({
  modal,
  library,
  path,
  libraries,
  close,
  submit,
  download,
}: {
  modal: NonNullable<Modal>;
  library: DriveLibrary | null;
  path: string;
  libraries: DriveLibrary[];
  close: () => void;
  submit: (body: Record<string, unknown>) => Promise<void>;
  download: (item: DriveItem) => void;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [destination, setDestination] = useState(library?.id || '');
  const [destinationPath, setDestinationPath] = useState('/');
  const [destinationFolders, setDestinationFolders] = useState<DriveItem[]>([]);
  const [destinationBusy, setDestinationBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement | HTMLFormElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKeyDown = (rawEvent: Event) => {
      const event = rawEvent as KeyboardEvent;
      if (event.key !== 'Tab') return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, []);
  useEffect(() => {
    if (!['move', 'copy'].includes(modal.type) || !destination) return;
    const controller = new AbortController();
    setDestinationBusy(true);
    const params = new URLSearchParams({ libraryId: destination, path: destinationPath });
    fetch(`/api/drive?${params}`, { signal: controller.signal })
      .then(response => response.json().then(data => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.message);
        const movingFolders = (modal.items || (modal.item ? [modal.item] : [])).filter(
          item => item.type === 'folder',
        );
        setDestinationFolders(
          (data.items as DriveItem[]).filter(
            item =>
              item.type === 'folder' &&
              !movingFolders.some(
                source => source.libraryId === destination && item.path.startsWith(source.path),
              ),
          ),
        );
        setError('');
      })
      .catch(reason => {
        if ((reason as Error).name !== 'AbortError')
          setError(reason instanceof Error ? reason.message : 'Could not load destination folders.');
      })
      .finally(() => setDestinationBusy(false));
    return () => controller.abort();
  }, [modal, destination, destinationPath]);
  if (modal.type === 'preview' && modal.item)
    return (
      <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}>
        <div
          ref={dialogRef as React.RefObject<HTMLDivElement>}
          className="preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${modal.item.name}`}
        >
          <div className="preview-head">
            <strong>{modal.item.name}</strong>
            <span>
              <button onClick={() => download(modal.item!)} aria-label={`Download ${modal.item.name}`}>
                <Icon name="download" />
              </button>
              <button onClick={close} aria-label="Close preview">
                <Icon name="close" />
              </button>
            </span>
          </div>
          <Preview item={modal.item} />
        </div>
      </div>
    );
  if (modal.type === 'share' && modal.item) return <ShareDialog item={modal.item} close={close} />;
  if (modal.type === 'manage-shares' && modal.item)
    return <ManageSharesDialog item={modal.item} close={close} />;
  const chosen = modal.items || (modal.item ? [modal.item] : []);
  const count = chosen.length;
  const title =
    modal.type === 'new-library'
      ? 'Create a library'
      : modal.type === 'new-folder'
        ? 'Create a folder'
        : modal.type === 'move'
          ? `Move ${count === 1 ? `“${chosen[0]?.name}”` : `${count} items`}`
          : modal.type === 'copy'
            ? `Copy “${modal.item?.name}”`
            : `Move ${count === 1 ? `“${chosen[0]?.name}”` : `${count} items`} to trash?`;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!library && modal.type !== 'new-library') return;
    setBusy(true);
    setError('');
    try {
      if (modal.type === 'new-library') await submit({ operation: 'create-library', name: value });
      if (modal.type === 'new-folder' && library)
        await submit({ operation: 'mkdir', libraryId: library.id, path, name: value });
      if (modal.type === 'move' && modal.items && library)
        await submit({
          operation: 'bulk-move',
          libraryId: library.id,
          items: chosen.map(item => ({ path: item.path, itemType: item.type })),
          destinationLibraryId: destination,
          destinationPath,
        });
      else if ((modal.type === 'move' || modal.type === 'copy') && modal.item && library)
        await submit({
          operation: modal.type,
          libraryId: library.id,
          path: modal.item.path,
          itemType: modal.item.type,
          destinationLibraryId: destination,
          destinationPath,
        });
      if (modal.type === 'delete' && modal.items && library)
        await submit({
          operation: 'bulk-delete',
          libraryId: library.id,
          items: chosen.map(item => ({ path: item.path, itemType: item.type })),
        });
      else if (modal.type === 'delete' && modal.item && library)
        await submit({
          operation: 'delete',
          libraryId: library.id,
          path: modal.item.path,
          itemType: modal.item.type,
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete the action.');
      setBusy(false);
    }
  }
  const sameMoveLocation =
    modal.type === 'move' &&
    chosen.length > 0 &&
    chosen.every(item => item.libraryId === destination && parent(item.path) === destinationPath);
  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && close()}>
      <form
        ref={dialogRef as React.RefObject<HTMLFormElement>}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-dialog-title"
        onSubmit={save}
      >
        <div className="modal-icon">
          <Icon
            name={
              modal.type === 'delete'
                ? 'trash'
                : modal.type === 'copy'
                  ? 'copy'
                  : modal.type === 'move'
                    ? 'move'
                    : modal.type === 'new-library'
                      ? 'files'
                      : 'folder'
            }
          />
        </div>
        <h2 id="drive-dialog-title">{title}</h2>
        {modal.type === 'delete' ? (
          <p>
            {count === 1 ? 'This item' : `These ${count} items`} will be moved to Seafile’s recycle bin and
            can be restored there.
          </p>
        ) : modal.type === 'move' || modal.type === 'copy' ? (
          <div className="move-fields">
            <label>
              Destination library
              <select
                value={destination}
                onChange={event => {
                  setDestination(event.target.value);
                  setDestinationPath('/');
                }}
              >
                {libraries.map(value => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="destination-browser">
              <div>
                <button
                  type="button"
                  onClick={() => setDestinationPath(parent(destinationPath))}
                  disabled={destinationPath === '/'}
                  aria-label="Go to parent folder"
                >
                  <Icon name="chevron" />
                </button>
                <strong>{destinationPath === '/' ? 'Library root' : destinationPath}</strong>
              </div>
              {destinationBusy ? (
                <span className="destination-loading">Loading folders…</span>
              ) : destinationFolders.length ? (
                destinationFolders.map(folder => (
                  <button type="button" key={folder.id} onClick={() => setDestinationPath(folder.path)}>
                    <Icon name="folder" />
                    <span>{folder.name}</span>
                    <Icon name="chevron" />
                  </button>
                ))
              ) : (
                <span className="destination-loading">No folders here</span>
              )}
            </div>
            <p className="destination-note">
              {modal.type === 'copy' ? 'Copy' : 'Move'} to:{' '}
              <strong>{destinationPath === '/' ? 'Library root' : destinationPath}</strong>
            </p>
          </div>
        ) : (
          <label>
            {modal.type === 'new-library' ? 'Library name' : 'Folder name'}
            <input
              value={value}
              onChange={event => setValue(event.target.value)}
              required
              autoFocus
              maxLength={255}
            />
          </label>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button
            className={modal.type === 'delete' ? 'danger-button' : 'primary'}
            disabled={busy || destinationBusy || Boolean(sameMoveLocation)}
          >
            {busy
              ? 'Working…'
              : modal.type === 'delete'
                ? `Move ${count > 1 ? `${count} items ` : ''}to trash`
                : modal.type === 'copy'
                  ? 'Copy here'
                  : modal.type === 'move'
                    ? sameMoveLocation
                      ? 'Already here'
                      : 'Move here'
                    : modal.type === 'new-library'
                      ? 'Create library'
                      : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
function ShareDialog({ item, close }: { item: DriveItem; close: () => void }) {
  const [password, setPassword] = useState('');
  const [expireDays, setExpireDays] = useState('');
  const [description, setDescription] = useState('');
  const [canDownload, setCanDownload] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [canUpload, setCanUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [manage, setManage] = useState(false);
  async function copy(value = link) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/item-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'share',
          libraryId: item.libraryId,
          path: item.path,
          itemType: item.type,
          name: item.name,
          password: password || undefined,
          expireDays: expireDays ? Number(expireDays) : undefined,
          description: description || undefined,
          permissions: {
            canDownload,
            canEdit: item.type === 'file' && canEdit,
            canUpload: item.type === 'folder' && canUpload,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not create the link.');
      setLink(data.link);
      await copy(data.link);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the link.');
    } finally {
      setBusy(false);
    }
  }
  if (manage) return <ManageSharesDialog item={item} close={close} back={() => setManage(false)} />;
  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && close()}>
      <form
        className="modal share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onSubmit={create}
      >
        <div className="share-dialog-head">
          <div className="modal-icon">
            <Icon name="link" />
          </div>
          <button type="button" className="secondary manage-shares-button" onClick={() => setManage(true)}>
            <Icon name="shared" />
            Manage shares
          </button>
        </div>
        <h2 id="share-title">Share “{displayName(item)}”</h2>
        <p>
          Create a Seafile-Facelift link that opens in a clean, branded viewer. Access rules are enforced by
          Seafile.
        </p>
        {link ? (
          <>
            <label>
              Share link
              <div className="share-link-row">
                <input value={link} readOnly autoFocus onFocus={event => event.currentTarget.select()} />
                <button type="button" className="primary" onClick={() => void copy()}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </label>
            <div className="share-success">
              <span>
                <Icon name="check" />
              </span>
              <div>
                <strong>Link ready</strong>
                <p>The recipient sees Seafile-Facelift, not your Seafile workspace.</p>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="primary" onClick={close}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="share-options">
              <label>
                Optional password
                <input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  minLength={4}
                  maxLength={128}
                  placeholder="Leave blank for no password"
                />
              </label>
              <label>
                Link expires
                <select value={expireDays} onChange={event => setExpireDays(event.target.value)}>
                  <option value="">Never</option>
                  <option value="1">In 1 day</option>
                  <option value="7">In 7 days</option>
                  <option value="30">In 30 days</option>
                  <option value="90">In 90 days</option>
                </select>
              </label>
              <label>
                Description
                <input
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  maxLength={255}
                  placeholder="Optional note for recipients"
                />
              </label>
              <fieldset>
                <legend>Permissions</legend>
                <label className="share-check">
                  <input
                    type="checkbox"
                    checked={canDownload}
                    onChange={event => setCanDownload(event.target.checked)}
                  />
                  <span>
                    <strong>Allow downloads</strong>
                    <small>Recipients can save a copy</small>
                  </span>
                </label>
                {item.type === 'file' ? (
                  <label className="share-check">
                    <input
                      type="checkbox"
                      checked={canEdit}
                      onChange={event => setCanEdit(event.target.checked)}
                    />
                    <span>
                      <strong>Allow editing when supported</strong>
                      <small>Availability depends on the file type and Seafile server</small>
                    </span>
                  </label>
                ) : (
                  <label className="share-check">
                    <input
                      type="checkbox"
                      checked={canUpload}
                      onChange={event => setCanUpload(event.target.checked)}
                    />
                    <span>
                      <strong>Allow uploads</strong>
                      <small>Recipients can add files to this folder</small>
                    </span>
                  </label>
                )}
              </fieldset>
            </div>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={close}>
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? 'Creating link…' : 'Create link'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
type ManagedShare = {
  token: string;
  link: string;
  createdAt?: string;
  expiresAt?: string;
  description?: string;
  passwordProtected: boolean;
  permissions: { canDownload: boolean; canEdit: boolean; canUpload: boolean };
};
function ManageSharesDialog({
  item,
  close,
  back,
}: {
  item: DriveItem;
  close: () => void;
  back?: () => void;
}) {
  const [links, setLinks] = useState<ManagedShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyToken, setBusyToken] = useState('');
  const [copiedToken, setCopiedToken] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ libraryId: item.libraryId, path: item.path });
      const response = await fetch(`/api/item-action?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load shares.');
      setLinks(data.links || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load shares.');
    } finally {
      setLoading(false);
    }
  }, [item.libraryId, item.path]);
  useEffect(() => {
    void load();
  }, [load]);
  async function revoke(token: string) {
    setBusyToken(token);
    setError('');
    try {
      const response = await fetch('/api/item-action', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not revoke this link.');
      setLinks(current => current.filter(link => link.token !== token));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not revoke this link.');
    } finally {
      setBusyToken('');
    }
  }
  async function copy(link: ManagedShare) {
    await navigator.clipboard.writeText(link.link);
    setCopiedToken(link.token);
    setTimeout(() => setCopiedToken(''), 1600);
  }
  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && close()}>
      <div
        className="modal share-modal manage-shares-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-shares-title"
      >
        <div className="share-dialog-head">
          <div className="modal-icon">
            <Icon name="shared" />
          </div>
          {back && (
            <button className="secondary" onClick={back}>
              Create new link
            </button>
          )}
        </div>
        <h2 id="manage-shares-title">Manage shares</h2>
        <p>
          External links for “{displayName(item)}”. Internal user and group shares are intentionally hidden.
        </p>
        {loading ? (
          <div className="share-list-loading">
            <span className="spinner dark" />
            Loading external links…
          </div>
        ) : links.length ? (
          <div className="managed-share-list">
            {links.map(link => (
              <article key={link.token}>
                <div className="managed-share-main">
                  <div>
                    <Icon name="link" />
                  </div>
                  <span>
                    <strong>{link.description || 'External share link'}</strong>
                    <small>
                      {link.passwordProtected ? 'Password protected' : 'Anyone with the link'} ·{' '}
                      {link.expiresAt
                        ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}`
                        : 'No expiration'}
                    </small>
                    <small>
                      {[
                        link.permissions.canDownload && 'Download',
                        link.permissions.canEdit && 'Edit',
                        link.permissions.canUpload && 'Upload',
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'View only'}
                    </small>
                  </span>
                </div>
                <div className="managed-share-actions">
                  <button className="secondary" onClick={() => void copy(link)}>
                    {copiedToken === link.token ? 'Copied' : 'Copy link'}
                  </button>
                  <button
                    className="revoke-share"
                    disabled={busyToken === link.token}
                    onClick={() => void revoke(link.token)}
                  >
                    {busyToken === link.token ? 'Revoking…' : 'Revoke'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="no-managed-shares">
            <Icon name="link" />
            <strong>No external links</strong>
            <span>Create a share link to make this item available outside your workspace.</span>
          </div>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button className="primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
function ProgressiveImage({ item, mode }: { item: DriveItem; mode: 'tile' | 'preview' }) {
  const [loaded, setLoaded] = useState(false);
  const high = mode === 'preview' ? previewUrl(item) : thumbnailUrl(item, 512);
  // A tiny blurred thumbnail gives immediate visual context while the useful image streams in.
  return (
    <span className={`progressive-image ${loaded ? 'loaded' : 'loading'}`} aria-busy={!loaded}>
      <img
        className="progressive-low"
        src={thumbnailUrl(item, 64)}
        alt=""
        loading={mode === 'tile' ? 'lazy' : 'eager'}
      />
      <img
        className="progressive-high"
        src={high}
        alt={item.name}
        loading={mode === 'tile' ? 'lazy' : 'eager'}
        onLoad={() => setLoaded(true)}
      />
      {!loaded && (
        <span className="image-loading" role="status">
          <span className="image-loading-spinner" />
          <span className="image-loading-label">Loading preview</span>
        </span>
      )}
    </span>
  );
}
function Preview({ item }: { item: DriveItem }) {
  const src = previewUrl(item);
  if (isImage(item))
    return (
      <div className="image-preview">
        <ProgressiveImage item={item} mode="preview" />
      </div>
    );
  if (/\.(mp4|webm)$/i.test(item.name)) return <video src={src} controls />;
  if (/\.(mp3|wav)$/i.test(item.name))
    return (
      <div className="audio-preview">
        <Icon name="audio" />
        <audio src={src} controls />
      </div>
    );
  return <iframe src={src} title={item.name} />;
}
function Details({ item, close }: { item: DriveItem; close: () => void }) {
  return (
    <aside className="details" aria-label={`Details for ${item.name}`}>
      <div className="details-head">
        <strong>Details</strong>
        <button onClick={close} aria-label="Close details">
          <Icon name="close" />
        </button>
      </div>
      <div className={`details-art ${fileIcon(item)}`}>
        <Icon name={fileIcon(item)} />
      </div>
      <h2>{item.name}</h2>
      <dl>
        <div>
          <dt>Type</dt>
          <dd>{item.type === 'folder' ? 'Folder' : item.name.split('.').pop()?.toUpperCase() || 'File'}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatSize(item.size)}</dd>
        </div>
        <div>
          <dt>Modified</dt>
          <dd>{item.modifiedAt ? new Date(item.modifiedAt).toLocaleString() : 'Not available'}</dd>
        </div>
        <div>
          <dt>Access</dt>
          <dd>{item.permission === 'r' ? 'View only' : 'Can edit'}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{parent(item.path) || '/'}</dd>
        </div>
      </dl>
    </aside>
  );
}
function Loading({ view }: { view: View }) {
  return (
    <div className={view === 'grid' ? 'loading-grid' : 'loading-list'}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div className="skeleton" key={i} />
      ))}
    </div>
  );
}
function Empty({
  title = 'A clean slate',
  description = 'Drop files here, or create a folder to get organized.',
  onNew,
  onUpload,
}: {
  title?: string;
  description?: string;
  onNew?: () => void;
  onUpload?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-art">
        <Icon name="folder" />
        <span>✦</span>
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {onNew && (
        <div>
          <button className="primary" onClick={onNew}>
            New folder
          </button>
          <button className="secondary" onClick={onUpload}>
            Upload files
          </button>
        </div>
      )}
    </div>
  );
}
function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="empty error-state">
      <div className="error-mark">!</div>
      <h2>We couldn’t load your files</h2>
      <p>{message}</p>
      <button className="primary" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
