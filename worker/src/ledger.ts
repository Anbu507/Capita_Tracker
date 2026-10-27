// The rules for one shared list, kept free of Cloudflare-only APIs so they can be unit tested.
//   GET    → the latest shared list (anyone with the link)
//   PUT    → replace it            (needs "Authorization: Bearer <secret key>")
//   DELETE → stop sharing          (needs the same key)
// The first PUT claims the list: only the SHA-256 of the key is kept, and later writes must match.

export interface Stored {
  keyHash: string;
  ledger: unknown;
}

/** Where one list is kept (a Durable Object's storage in production, a Map in tests). */
export interface LedgerStore {
  load(): Promise<Stored | null>;
  save(stored: Stored): Promise<void>;
  remove(): Promise<void>;
}

export interface Outcome {
  response: Response;
  /** Set when the list changed: the new list, or null when sharing stopped. Pushed to open shop's pages. */
  changed?: unknown;
}

const MAX_BODY = 300_000; // bytes — years of daily entries fit in a fraction of this

/** /api/ledger/<id> and /api/ledger/<id>/live (the shop's page live line). */
export const ROUTE = /^\/api\/ledger\/([A-Za-z0-9_-]{16,64})(\/live)?$/;

// Reads are protected by the unguessable id and writes by the key (no cookies), so any origin may call.
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
};

export function reply(status: number, body?: unknown): Response {
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

export async function handleLedger(req: Request, store: LedgerStore): Promise<Outcome> {
  if (req.method === 'GET') {
    const stored = await store.load();
    return { response: stored ? reply(200, stored.ledger) : reply(404, { error: 'not found' }) };
  }
  if (req.method !== 'PUT' && req.method !== 'DELETE') return { response: reply(405, { error: 'method not allowed' }) };

  const key = bearer(req);
  if (!key) return { response: reply(401, { error: 'missing key' }) };
  const keyHash = await sha256(key);
  const stored = await store.load();
  if (stored && stored.keyHash !== keyHash) return { response: reply(403, { error: 'wrong key' }) };

  if (req.method === 'DELETE') {
    if (!stored) return { response: reply(204) };
    await store.remove();
    return { response: reply(204), changed: null };
  }

  const text = await req.text();
  if (text.length > MAX_BODY) return { response: reply(413, { error: 'too large' }) };
  let ledger: unknown;
  try {
    ledger = JSON.parse(text);
  } catch {
    return { response: reply(400, { error: 'not json' }) };
  }
  if (!looksLikeLedger(ledger)) return { response: reply(400, { error: 'not a shared list' }) };

  await store.save({ keyHash, ledger });
  return { response: reply(204), changed: ledger };
}
