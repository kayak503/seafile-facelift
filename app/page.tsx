import { getConfig } from '@/lib/config';
import { getSession } from '@/lib/session';
import { DriveShell } from '@/components/drive-shell';
import { Login } from '@/components/login';
import { Setup } from '@/components/setup';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const config = getConfig();
  if (!config.public.configured) return <Setup config={config.public} />;
  const session = await getSession();
  return session ? (
    <DriveShell username={session.username} config={config.public} />
  ) : (
    <Login config={config.public} />
  );
}
