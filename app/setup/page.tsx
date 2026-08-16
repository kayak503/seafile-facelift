import { getConfig } from '@/lib/config';
import { Setup } from '@/components/setup';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default function SetupPage() {
  const config = getConfig().public;
  if (config.configured) redirect('/');
  return <Setup config={config} />;
}
