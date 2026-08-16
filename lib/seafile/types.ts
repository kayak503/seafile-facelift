export type DriveItem = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  libraryId: string;
  size?: number;
  modifiedAt?: string;
  mimeType?: string;
  permission?: 'r' | 'rw';
};
export type DriveLibrary = {
  id: string;
  name: string;
  permission: 'r' | 'rw';
  encrypted: boolean;
  modifiedAt?: string;
};
export type SearchResult = DriveItem & { location: string };
export type DriveAction =
  | { operation: 'mkdir'; libraryId: string; path: string; name: string }
  | { operation: 'rename'; libraryId: string; path: string; itemType: 'file' | 'folder'; name: string }
  | { operation: 'delete'; libraryId: string; path: string; itemType: 'file' | 'folder' }
  | {
      operation: 'move' | 'copy';
      libraryId: string;
      path: string;
      itemType: 'file' | 'folder';
      destinationLibraryId: string;
      destinationPath: string;
    };
export type StorageUsage = { used: number; total?: number };
