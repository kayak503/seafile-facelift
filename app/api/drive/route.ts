import { errorResponse } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { assertSameOrigin, requireSession } from '@/lib/session';
import { SeafileAdapter, type DriveAction } from '@/lib/seafile';
import { drivePath, libraryId, text } from '@/lib/validation';

export async function GET(request: Request) {
  try {
    rateLimit(request);
    const session = await requireSession();
    const url = new URL(request.url);
    const adapter = new SeafileAdapter();
    const id = url.searchParams.get('libraryId');
    if (!id) return Response.json({ libraries: await adapter.listLibraries(session.token) });
    return Response.json({
      items: await adapter.listDirectory(
        session.token,
        libraryId(id),
        drivePath(url.searchParams.get('path')),
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    rateLimit(request);
    assertSameOrigin(request);
    const session = await requireSession();
    const body = await request.json();
    const operation = text(body.operation, 'Operation', 16);
    if (operation === 'create-library') {
      const library = await new SeafileAdapter().createLibrary(
        session.token,
        text(body.name, 'Library name'),
      );
      return Response.json({ ok: true, library });
    }
    if (operation === 'bulk-delete' || operation === 'bulk-move') {
      const repo = libraryId(body.libraryId);
      const rawItems = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
      if (!rawItems.length)
        return Response.json(
          { error: 'empty_selection', message: 'Select at least one item.' },
          { status: 400 },
        );
      const destinationLibraryId = operation === 'bulk-move' ? libraryId(body.destinationLibraryId) : '';
      const destinationPath = operation === 'bulk-move' ? drivePath(body.destinationPath) : '/';
      const adapter = new SeafileAdapter();
      for (const raw of rawItems) {
        const item = raw as Record<string, unknown>;
        const itemType = item.itemType === 'folder' ? 'folder' : 'file';
        const path = drivePath(item.path);
        await adapter.mutate(
          session.token,
          operation === 'bulk-delete'
            ? { operation: 'delete', libraryId: repo, path, itemType }
            : { operation: 'move', libraryId: repo, path, itemType, destinationLibraryId, destinationPath },
        );
      }
      return Response.json({ ok: true, count: rawItems.length });
    }
    let action: DriveAction;
    if (operation === 'mkdir')
      action = {
        operation,
        libraryId: libraryId(body.libraryId),
        path: drivePath(body.path),
        name: text(body.name, 'Folder name'),
      };
    else if (operation === 'rename')
      action = {
        operation,
        libraryId: libraryId(body.libraryId),
        path: drivePath(body.path),
        itemType: body.itemType === 'folder' ? 'folder' : 'file',
        name: text(body.name, 'Name'),
      };
    else if (operation === 'delete')
      action = {
        operation,
        libraryId: libraryId(body.libraryId),
        path: drivePath(body.path),
        itemType: body.itemType === 'folder' ? 'folder' : 'file',
      };
    else if (operation === 'move' || operation === 'copy')
      action = {
        operation,
        libraryId: libraryId(body.libraryId),
        path: drivePath(body.path),
        itemType: body.itemType === 'folder' ? 'folder' : 'file',
        destinationLibraryId: libraryId(body.destinationLibraryId),
        destinationPath: drivePath(body.destinationPath),
      };
    else
      return Response.json(
        { error: 'unsupported_operation', message: 'That operation is not supported.' },
        { status: 400 },
      );
    await new SeafileAdapter().mutate(session.token, action);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
