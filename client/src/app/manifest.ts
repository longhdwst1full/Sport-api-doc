import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DCTD Sport',
    short_name: 'DCTD Sport',
    description: 'Thiết bị và dụng cụ thể thao cho mọi hành trình vận động.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f3ea',
    theme_color: '#12824b',
    lang: 'vi',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
