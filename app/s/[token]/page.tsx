import { notFound } from 'next/navigation';
import { getConfig } from '@/lib/config';
import { openPublicShare, shareExpired } from '@/lib/public-share';
import { PublicShareView } from '@/components/public-share-view';

export default async function SharedItemPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = openPublicShare(token);
  if (!share || shareExpired(share)) notFound();
  const config = getConfig().public;
  return (
    <PublicShareView
      token={token}
      name={share.name}
      type={share.type}
      description={share.description}
      protectedShare={Boolean(share.passwordHash)}
      canDownload={share.canDownload}
      appName={config.appName}
      accent={config.accent}
    />
  );
}
