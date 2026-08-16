import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Grapple Drive',
    short_name: 'Drive',
    description: 'A modern Seafile workspace',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f8fc',
    theme_color: '#2563eb',
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
