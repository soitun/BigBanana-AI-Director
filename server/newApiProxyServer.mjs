import http from 'node:http';
import { createNewApiProxyHandler } from './newApiProxyCore.mjs';

const PORT = Number.parseInt(process.env.NEW_API_PROXY_PORT || process.env.PORT || '8788', 10);
const HOST = process.env.NEW_API_PROXY_HOST || '0.0.0.0';

const handler = createNewApiProxyHandler();

const server = http.createServer((req, res) => {
  handler(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`new-api proxy server listening on http://${HOST}:${PORT}`);
});

