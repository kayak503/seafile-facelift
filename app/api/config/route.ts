import { getConfig } from '@/lib/config';
export async function GET() {
  return Response.json(getConfig().public);
}
