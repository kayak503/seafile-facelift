import { AppError } from '@/lib/errors';

/** Validates a required, single-line text field and returns its trimmed value. */
export function text(value: unknown, field: string, max = 255) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\0\r\n]/.test(value)) {
    throw new AppError(400, 'invalid_input', `${field} is invalid.`);
  }
  return value.trim();
}

/** Accepts Seafile repository identifiers without allowing URL/path syntax. */
export function libraryId(value: unknown) {
  const id = text(value, 'Library', 64);
  if (!/^[a-z0-9-]+$/i.test(id)) throw new AppError(400, 'invalid_library', 'Library is invalid.');
  return id;
}

/** Normalizes an absolute Seafile path while rejecting control characters and oversized input. */
export function drivePath(value: unknown) {
  const path = typeof value === 'string' ? value : '/';
  if (!path.startsWith('/') || path.includes('\0') || path.length > 4096)
    throw new AppError(400, 'invalid_path', 'File path is invalid.');
  return path.replace(/\/{2,}/g, '/');
}
