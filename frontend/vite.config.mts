import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const file = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Opt-in static build. The existing Next deployment keeps its own entrypoint.
export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, file('./'), 'NEXT_PUBLIC_'), ...process.env };
  const api = env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
  if (command === 'build' && mode === 'production' && !env.NEXT_PUBLIC_API_URL) {
    throw new Error('Set NEXT_PUBLIC_API_URL before building the static preview.');
  }
  return {
    root: file('./static/'),
    publicDir: file('./public/'),
    resolve: {
      alias: [
        { find: /^next\/link$/, replacement: file('./static/link.tsx') },
        { find: /^next\/navigation$/, replacement: file('./static/navigation.tsx') },
      ],
    },
    // Only these public settings may enter the browser bundle.
    define: {
      'process.env.NEXT_PUBLIC_API_URL': JSON.stringify(api),
      'process.env.NEXT_PUBLIC_COMMERCE_SLUG': JSON.stringify(env.NEXT_PUBLIC_COMMERCE_SLUG || 'comercio-demo'),
      'process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN': JSON.stringify(env.NEXT_PUBLIC_STOREFRONT_DOMAIN || 'disenolys.store'),
    },
    build: {
      outDir: file('./dist-static/'),
      emptyOutDir: true,
      rolldownOptions: {
        onwarn(warning, defaultHandler) {
          // Every module is client-side in this build; retain directives for Next.
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
          defaultHandler(warning);
        },
      },
    },
    preview: { host: '127.0.0.1' },
  };
});
