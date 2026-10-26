# Capital Tracker

I pay my egg-and-banana shop a fixed amount up front. Each day I log what I took and what it
cost, and the app shows how much of my money is left at the shop, how many days it will last,
and charts of the balance and spending.

- Works on phone, tablet and desktop (one responsive app).
- No account, no server, works offline; data stays in this browser (export a backup in Settings).
- **1.2.0:** a read-only **shop's page** the shopkeeper opens on their own phone.
- **1.1.1:** every screen uses simple, everyday words ("Money left", "Add what I bought") so anyone
  — including the shopkeeper — can read it.
- Design and decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · changes: [CHANGELOG.md](CHANGELOG.md).

## Run it

```bash
npm install
npm run dev
```

On Windows PowerShell, if `npm` is blocked ("running scripts is disabled"), use `npm.cmd`
instead: `npm.cmd install`, `npm.cmd run dev`.

Open the address Vite prints (for example `http://localhost:5173`). `--host` is on, so a phone
on the same Wi-Fi can open the "Network" address too.

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Unit tests (ledger maths, money, backup, shared list, server rules) | `npm test` |
| Type-check + production build into `dist/` | `npm run build` |
| Preview the production build | `npm run preview` |

## Daily use

1. **First time:** Home → **Add money I gave** → the amount you gave the shop.
2. **Every day:** tap **＋** (Add what I bought) → eggs 3 and bananas 3 are already filled in →
   type how much it cost → **Save**.
3. **When money is running low** (warning at ₹100; change it in Settings): give the shop money
   again and add it with **Add money I gave**.
4. **Now and then:** Settings → **Save a copy**.

Desktop shortcut: press **N** to add what you bought.

## The shop's page (1.2.0)

1. Settings → **Shop's page** → type your name → **Make the shop's page**.
2. **Send link** (or **Copy link**) and send it to the shopkeeper once.
3. They open it on their phone (and can **Add to Home screen**). It shows money left, money
   given, spent and the history, and updates every time you save. They can't change anything.
4. **Stop sharing** turns their page off.

The page reads from a small free server in `worker/` (Cloudflare Worker + KV). To change it:

```bash
cd worker
npx wrangler deploy
```

## Open it on your phone

**Live app: https://anbu507.github.io/Capita_Tracker/** — works on any internet (Wi-Fi or
mobile data), and after the first visit it opens even with no internet.

1. Open the link in Chrome on the phone.
2. Tap **⋮ → Add to Home screen** (or **Install app**). It now opens like a normal app.
3. Your list stays **only on that phone**. Use Settings → **Save a copy** now and then.

Every push to `main` publishes the new version automatically
(`.github/workflows/deploy.yml`, GitHub Pages, free).
