import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createNewApiProxyHandler } from './server/newApiProxyCore.mjs';

const createDevMediaProxyPlugin = (): Plugin => ({
  name: 'dev-media-proxy',
  configureServer(server) {
    const handler = async (req: any, res: any) => {
      try {
        const requestUrl = new URL(req.url || '', 'http://localhost');
        const target = requestUrl.searchParams.get('url');

        if (!target) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Missing url query parameter.' }));
          return;
        }

        let targetUrl: URL;
        try {
          targetUrl = new URL(target);
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Invalid url value.' }));
          return;
        }

        if (!['http:', 'https:'].includes(targetUrl.protocol)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Only http/https URLs are allowed.' }));
          return;
        }

        const upstream = await fetch(targetUrl.toString(), {
          method: 'GET',
          headers: req.headers.range ? { range: String(req.headers.range) } : undefined,
          redirect: 'follow',
        });

        res.statusCode = upstream.status;
        const passthroughHeaders = [
          'content-type',
          'content-length',
          'content-range',
          'accept-ranges',
          'cache-control',
          'etag',
          'last-modified',
          'expires',
        ];

        passthroughHeaders.forEach((key) => {
          const value = upstream.headers.get(key);
          if (value) {
            res.setHeader(key, value);
          }
        });

        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.end(buffer);
      } catch (error: any) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            error: 'Media proxy failed.',
            detail: error?.message || String(error),
          })
        );
      }
    };

    server.middlewares.use('/api/media-proxy', handler);
  },
});

const createDevNewApiProxyPlugin = (): Plugin => ({
  name: 'dev-new-api-proxy',
  configureServer(server) {
    const handler = createNewApiProxyHandler();
    server.middlewares.use(handler as any);
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), createDevMediaProxyPlugin(), createDevNewApiProxyPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.ANTSK_API_KEY),
        'process.env.ANTSK_API_KEY': JSON.stringify(env.ANTSK_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 1024,
        rollupOptions: {
          output: {
            manualChunks: {
              react: ['react', 'react-dom'],
              icons: ['lucide-react'],
              zip: ['jszip'],
            },
          },
        },
      }
    };
});
