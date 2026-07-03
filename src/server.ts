import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { handleAnalyze } from './api/handler.ts';

// Persistent HTTP server for Railway (which runs a long-lived process, unlike
// Vercel's per-request functions). All the real logic lives in the tested
// transport-agnostic core; this is just routing + body plumbing.
const ROUTE = '/api/analyze';
const MAX_BODY = 4096; // requests are tiny ({wallet_address, chain}) — cap to shut down abuse

// Demo UI, served same-origin so it provably calls the real endpoint (no CORS,
// one deploy). Read once at startup.
const INDEX_HTML = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
// Self-hosted Space Grotesk (no CDN — the app stays fully self-contained).
const FONT_WOFF2 = readFileSync(new URL('./public/fonts/space-grotesk.woff2', import.meta.url));

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '').split('?')[0];

  if (req.method === 'GET' && path === '/health') {
    return send(res, 200, { status: 'ok' });
  }
  if (req.method === 'GET' && path === '/fonts/space-grotesk.woff2') {
    res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=31536000, immutable' });
    res.end(FONT_WOFF2);
    return;
  }
  if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(INDEX_HTML);
    return;
  }
  if (path !== ROUTE) {
    return send(res, 404, { error: 'not found' });
  }

  // Buffer the body with a hard cap (trust boundary — public paid endpoint).
  const chunks: Buffer[] = [];
  let size = 0;
  let tooBig = false;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) { tooBig = true; break; }
    chunks.push(chunk);
  }
  if (tooBig) return send(res, 413, { error: 'request body too large' });

  const raw = Buffer.concat(chunks).toString();
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: 'invalid JSON body' });
    }
  }

  const result = await handleAnalyze(req.method, body);
  send(res, result.status, result.body);
}

export function startServer(port = Number(process.env.PORT) || 3000): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      handle(req, res).catch(() => send(res, 500, { error: 'internal error' }));
    });
    server.listen(port, () => resolve(server));
  });
}

// Auto-start only when run directly (node src/server.ts), not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const server = await startServer();
  const addr = server.address();
  console.log(`scope listening on ${typeof addr === 'object' && addr ? addr.port : ''}`);
}
