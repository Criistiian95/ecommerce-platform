import type { NextConfig } from 'next';
const config: NextConfig = {
  async headers() {
    return ['/recuperar', '/cliente/recuperar', '/tienda/:slug/cliente/recuperar'].map(source => ({
      source, headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Cache-Control', value: 'no-store' },
      ],
    }));
  },
};
export default config;
