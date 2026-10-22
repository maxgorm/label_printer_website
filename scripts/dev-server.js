/**
 * Local dev server: serves public/ and runs api/*.js the way Vercel does,
 * so checkout works on localhost without the Vercel CLI.
 * Secrets come from .env.local (git-ignored). Use a Stripe TEST key (sk_test_...).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.JPG': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.woff2': 'font/woff2',
};
// Same page rewrites as vercel.json.
const REWRITES = { '/support': '/support.html', '/download': '/download.html', '/auth/action': '/auth-action.html' };

if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_live')) {
  console.error('Refusing to start: .env.local has a LIVE Stripe key. Use a test key (sk_test_...) locally.');
  process.exit(1);
}

async function runApi(name, req, res) {
  const file = join(ROOT, 'api', `${name}.js`);
  if (!/^[a-z-]+$/.test(name)) return notFound(res);
  try { await stat(file); } catch { return notFound(res); }

  // Vercel parses JSON bodies, except for routes that read the raw stream (the Stripe webhook).
  if (name !== 'webhook' && (req.headers['content-type'] || '').includes('application/json')) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    try { req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { req.body = {}; }
  }
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (value) => {
    if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(value));
    return res;
  };
  res.send = (value) => { res.end(value); return res; };

  const { default: handler } = await import(pathToFileURL(file).href);
  await handler(req, res);
}

async function serveStatic(pathname, res) {
  let path = REWRITES[pathname] || pathname;
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(PUBLIC_DIR, decodeURIComponent(path)));
  if (!file.startsWith(PUBLIC_DIR)) return notFound(res);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    try {
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      res.end(await readFile(join(PUBLIC_DIR, '404.html')));
    } catch {
      notFound(res);
    }
  }
}

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
  try {
    const api = pathname.match(/^\/api\/([^/]+?)\/?$/);
    if (api) await runApi(api[1], req, res);
    else await serveStatic(pathname, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Dev server error', detail: err.message }));
  }
}).listen(PORT, () => {
  console.log(`Sentimo dev server on http://localhost:${PORT}`);
  if (!process.env.STRIPE_SECRET_KEY) console.log('No STRIPE_SECRET_KEY in .env.local: checkout will return an error.');
});
