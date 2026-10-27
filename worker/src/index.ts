// The noticeboard for the shop's page. Each shared list lives in its own Durable Object, which
// answers instantly (no caching delay between cities) and pushes every change straight to the
// shop's pages that are open, over a WebSocket ("live line").
import { CORS, handleLedger, reply, ROUTE, type LedgerStore, type Stored } from './ledger.ts';

export interface Env {
  /** Lists shared before 1.2.1 were kept in KV; they move into their Durable Object on first use. */
  LEDGERS: KVNamespace;
  LEDGER: DurableObjectNamespace;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const match = ROUTE.exec(new URL(req.url).pathname);
    if (!match) return reply(404, { error: 'not found' });
    // One object per list id: every phone talking about this list reaches the same place.
    return env.LEDGER.get(env.LEDGER.idFromName(match[1])).fetch(req);
  },
} satisfies ExportedHandler<Env>;

export class LedgerObject implements DurableObject {
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {
    // Keep-alive pings from the shop's page are answered without waking this object up.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req: Request): Promise<Response> {
    const [, id, live] = ROUTE.exec(new URL(req.url).pathname)!;

    if (live) {
      if (req.headers.get('upgrade') !== 'websocket') return reply(426, { error: 'expected websocket' });
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server); // hibernates while idle, so open pages cost nothing
      const stored = await this.load(id);
      server.send(JSON.stringify(stored ? { ledger: stored.ledger } : { gone: true }));
      return new Response(null, { status: 101, webSocket: client });
    }

    const store: LedgerStore = {
      load: () => this.load(id),
      save: (s) => this.ctx.storage.put('list', s),
      remove: async () => {
        await this.ctx.storage.deleteAll();
        await this.env.LEDGERS.delete(id);
      },
    };
    const { response, changed } = await handleLedger(req, store);
    if (changed !== undefined) this.broadcast(changed === null ? { gone: true } : { ledger: changed });
    return response;
  }

  /** The stored list; moves a pre-1.2.1 list over from KV the first time it is needed. */
  private async load(id: string): Promise<Stored | null> {
    const stored = await this.ctx.storage.get<Stored>('list');
    if (stored) return stored;
    const old = (await this.env.LEDGERS.get(id, 'json')) as Stored | null;
    if (!old) return null;
    await this.ctx.storage.put('list', old);
    await this.env.LEDGERS.delete(id);
    return old;
  }

  private broadcast(message: unknown): void {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        /* that page already went away */
      }
    }
  }

  webSocketMessage(): void {
    /* pages only send pings, which the auto-response answers */
  }

  webSocketClose(ws: WebSocket, code: number): void {
    try {
      // 1005/1006 mean "no code / dropped" and may not be sent back.
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'closing');
    } catch {
      /* already closed */
    }
  }
}
