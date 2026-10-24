# Capital Tracker

I pay my egg-and-banana shop a fixed amount up front. Each day I log what I took and what it
cost, and the app shows how much of my money is left at the shop, how many days it will last,
and charts of the balance and spending.

- Works on phone, tablet and desktop (one responsive app).
- No account, no server, works offline; data stays in this browser (export a backup in Settings).
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
| Unit tests (ledger maths, money parsing, backup validation) | `npm test` |
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

## Install on a phone

The app is a PWA. Once it's hosted over HTTPS (see below), open it in Chrome on the phone →
menu → **Add to Home screen**. It then opens full-screen and works without internet.

## Hosting (not done yet)

`npm run build` makes a static `dist/` folder that any free static host can serve,
for example Cloudflare Pages or GitHub Pages. Paths are relative, so a sub-folder works too.
