// The noticeboard for the shop's page. One record per shared list, stored in Cloudflare KV:
//   GET    /api/ledger/<id>  → the latest shared list (anyone with the link)
//   PUT    /api/ledger/<id>  → replace it            (needs "Authorization: Bearer <secret key>")
//   DELETE /api/ledger/<id>  → stop sharing          (needs the same key)
// The first PUT for an id claims it: only the SHA-256 of the key is kept, and later writes must match.

/** The two KV calls we use (keeps this file free of Cloudflare-only types, so it can be unit tested). */
export interface KV {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  LEDGERS: KV;
}

interface Stored {
  keyHash: string;
  ledger: unknown;
}

const MAX_BODY = 300_000; // bytes — years of daily entries fit in a fraction of this
const ROUTE = /^\/api\/ledger\/([A-Za-z0-9_-]{16,64})$/;

// Reads are protected by the unguessable id and writes by the key (no cookies), so any origin may call.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
};

function reply(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bearer(req: Request): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(req.headers.get('authorization') ?? '');
  return m ? m[1] : null;
}

function looksLikeLedger(v: unknown): boolean {
  return typeof v === 'object' && v !== null && (v as { v?: unknown }).v === 1 && Array.isArray((v as { entries?: unknown }).entries);
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const match = ROUTE.exec(new URL(req.url).pathname);
  if (!match) return reply(404, { error: 'not found' });
  const id = match[1];

  if (req.method === 'GET') {
    const stored = (await env.LEDGERS.get(id, 'json')) as Stored | null;
    return stored ? reply(200, stored.ledger) : reply(404, { error: 'not found' });
  }

  if (req.method !== 'PUT' && req.method !== 'DELETE') return reply(405, { error: 'method not allowed' });

  const key = bearer(req);
  if (!key) return reply(401, { error: 'missing key' });
  const keyHash = await sha256(key);
  const stored = (await env.LEDGERS.get(id, 'json')) as Stored | null;
  if (stored && stored.keyHash !== keyHash) return reply(403, { error: 'wrong key' });

  if (req.method === 'DELETE') {
    if (stored) await env.LEDGERS.delete(id);
    return reply(204);
  }

  const text = await req.text();
  if (text.length > MAX_BODY) return reply(413, { error: 'too large' });
  let ledger: unknown;
  try {
    ledger = JSON.parse(text);
  } catch {
    return reply(400, { error: 'not json' });
  }
  if (!looksLikeLedger(ledger)) return reply(400, { error: 'not a shared list' });

  await env.LEDGERS.put(id, JSON.stringify({ keyHash, ledger } satisfies Stored));
  return reply(204);
}

export default { fetch: handle };
