/**
 * TRIAD Demo Server — zero-dependency HTTP server.
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
    const body = await readJson(req);
    try {
      const result = await triad.triadAdjudicate(body);
      return json(res, 200, result);
    } catch (e) {
      return json(res, 500, { error: String(e) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/shop') {
    const body = await readJson(req);
    try { return json(res, 200, await commerce.triadShop(body)); }
    catch (e) { return json(res, 500, { error: String(e) }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/order') {
    const body = await readJson(req);
    try { return json(res, 200, await triad.triadCreateOrder(body)); }
    catch (e) { return json(res, 500, { error: String(e) }); }
  }

  if (req.method === 'POST' && url.pathname === '/api/capture') {
    const body = await readJson(req);
    try { return json(res, 200, await triad.triadCaptureOrder(body)); }
    catch (e) { return json(res, 500, { error: String(e) }); }
  }

  if (req.method === 'GET' && url.pathname === '/api/ledger') {
    return json(res, 200, triad.triadGetLedger());
  }

  if (req.method === 'POST' && url.pathname === '/api/verify') {
    const body = await readJson(req);
    try { return json(res, 200, await triad.triadVerifyReceipt(body)); }
    catch (e) { return json(res, 500, { error: String(e) }); }
  }

  res.writeHead(404); res.end('Not found');
});

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

const PORT = process.env.PORT || 8787;
server.listen(PORT, () => {
  console.log(`\n⚖️  TRIAD demo running → http://localhost:${PORT}`);
  console.log(`   PayPal: ${triad._paypal.mode}  |  LLM: ${triad._runner.live ? 'live' : 'deterministic'}  |  Catalog: ${commerce._catalog.mode}\n`);
});
