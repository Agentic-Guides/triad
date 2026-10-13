/**
 * Tuesday Demo Server — zero-dependency HTTP server.
 * Serves the demo UI and exposes a JSON API that runs the adversarial engine.
 *
 * Run: node demo/server.mjs    → http://localhost:8787
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTriad } from '../src/webmcp.js';
import { createTriadCommerce } from '../src/commerce.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const triad = createTriad();
const commerce = createTriadCommerce({ triad });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const html = await readFile(join(__dir, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  if (req.method === 'POST' && url.pathname === '/api/adjudicate') {
    try {
      const body = await readJson(req);
      const result = await triad.triadAdjudicate(body);
      return json(res, 200, result);
    } catch (e) {
      if (e instanceof BadRequest) return json(res, 400, { error: e.message });
      // Do not echo internals to the client; log locally instead.
      console.error('[api] handler failed:', e && e.message ? e.message : e);
      return json(res, 500, { error: 'internal error' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/shop') {
    try {
      const body = await readJson(req); return json(res, 200, await commerce.triadShop(body)); }
    catch (e) {
      if (e instanceof BadRequest) return json(res, 400, { error: e.message });
      console.error('[api] handler failed:', e && e.message ? e.message : e);
      return json(res, 500, { error: 'internal error' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/order') {
    try {
      const body = await readJson(req); return json(res, 200, await triad.triadCreateOrder(body)); }
    catch (e) {
      if (e instanceof BadRequest) return json(res, 400, { error: e.message });
      console.error('[api] handler failed:', e && e.message ? e.message : e);
      return json(res, 500, { error: 'internal error' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/capture') {
    try {
      const body = await readJson(req); return json(res, 200, await triad.triadCaptureOrder(body)); }
    catch (e) {
      if (e instanceof BadRequest) return json(res, 400, { error: e.message });
      console.error('[api] handler failed:', e && e.message ? e.message : e);
      return json(res, 500, { error: 'internal error' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/ledger') {
    return json(res, 200, triad.triadGetLedger());
  }

  if (req.method === 'POST' && url.pathname === '/api/verify') {
    try {
      const body = await readJson(req); return json(res, 200, await triad.triadVerifyReceipt(body)); }
    catch (e) {
      if (e instanceof BadRequest) return json(res, 400, { error: e.message });
      console.error('[api] handler failed:', e && e.message ? e.message : e);
      return json(res, 500, { error: 'internal error' });
    }
  }

  res.writeHead(404); res.end('Not found');
});

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

/** Max accepted request body. A demo API takes a small decision request; anything
 *  larger is either a mistake or a denial-of-service attempt. Without a cap,
 *  readJson() buffers until the process runs out of memory. */
const MAX_BODY_BYTES = 64 * 1024; // 64 KB

class BadRequest extends Error {}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > MAX_BODY_BYTES) {
      // Stop reading and let the handler answer 413. Destroying the socket here
      // would surface as a reset instead of an honest error.
      throw new BadRequest(`request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch (e) {
    // A malformed body is the client's problem — answer 400, never throw out of
    // the request handler (an unhandled rejection ends the process on Node 15+).
    throw new BadRequest('malformed JSON body');
  }
}

const PORT = process.env.PORT || 8787;
server.listen(PORT, () => {
  console.log(`\n⚖️  Tuesday demo running → http://localhost:${PORT}`);
  console.log(`   PayPal: ${triad._paypal.mode}  |  LLM: ${triad._runner.live ? 'live' : 'deterministic'}  |  Catalog: ${commerce._catalog.mode}\n`);
});
