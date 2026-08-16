import { GET as download } from '../download/route';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const response = await download(request);
  if (!response.ok) return response;
  const headers = new Headers(response.headers);
  headers.set('Content-Disposition', 'inline');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  return new Response(response.body, { status: response.status, headers });
}
