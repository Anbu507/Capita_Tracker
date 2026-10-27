# Changelog

## Online

Since 1.1.2 the app is published at https://anbu507.github.io/Capita_Tracker/ (GitHub Pages),
so it works on mobile data and can be added to the phone's home screen. Every push to `main`
publishes again.

## 1.2.1 — the shop's page updates instantly

- The shopkeeper's page now changes **about half a second** after I tap Save (measured 0.48–0.51 s
  on the live server). Before it could take up to ~2 minutes.
- My phone sends right after saving (no 1-second wait).
- **Live line**: while the shop's page is open, the server pushes each change to it at once over a
  WebSocket. A green **Live** badge shows when it is connected; it reconnects by itself, and falls
  back to checking every 30 seconds if the line is down.
- Server storage moved from Cloudflare KV (could lag up to a minute between cities) to a Durable
  Object per shared list (instant). Pages made with 1.2.0 moved over automatically — same link,
  same key.
- Safety: every request gives up after 10 seconds, and my phone retries every 20 seconds while
  there is no connection, so it never stays stuck on "Updating…".

## 1.2.0 — the shop's page

- **Shop's page**: Settings → Shop's page → *Make the shop's page* gives a link to send the shop
  once. On their own phone they see **Money left**, **Money given**, **Spent** and the history
  (date, 🥚 3 · 🍌 3, amount). It is read-only and updates by itself every time I save.
- Only dates, items, amounts, my name and the shop name are shared — **notes stay on my phone**.
  Only someone with the link can see it; only my phone (secret key) can change it.
- *Stop sharing* turns the page off. *Delete everything* turns it off first. *Show an example* is
  hidden while sharing, so example days never reach the shop.
- New small server: `worker/` (Cloudflare Worker + KV, free) at
  https://capital-tracker-api.stopwatch-worker.workers.dev.

## 1.1.2 — button fix on phones

- Home: on phones, "Add what I bought" and "Add money I gave" now sit one per row, full width,
  inside the box. Before, "Add money I gave" stuck out past the edge on most phones (the
  plain-word labels from 1.1.1 are longer) and the page slid sideways. On screens 600 px and
  wider they stay side by side.

## 1.1.1 — simple, everyday words

Same app as 1.0.0; only the words changed, so anyone (including the shopkeeper) can read it.

- "Balance" → **Money left**; "Add money" → **Add money I gave**; "Log a purchase" → **Add what I bought**.
- "Usual day" → **Daily cost**; "≈ 14 days left" → **Enough for about 14 more days**.
- "Low balance — top up soon" → **Money is running low — give the shop money soon**.
- "Insights" → **Charts**; "Table" → **Numbers**.
- "Backup / Restore" → **Save a copy / Bring back a copy**; "Erase" → **Delete**.
- Entry sheet: **I bought / I gave money**, **How much it cost**, one **Save** button.
- Settings shows the version number.

Full word list: docs/ARCHITECTURE.md §13.

## 1.0.0 — base version

Prepaid balance, daily log, top-ups, history by month with running balance, charts
(balance over time, spend per day/week), backup save/restore, light/dark, works offline,
phone/tablet/desktop layouts.
