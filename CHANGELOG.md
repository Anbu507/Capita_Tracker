# Changelog

## Online

Since 1.1.2 the app is published at https://anbu507.github.io/Capita_Tracker/ (GitHub Pages),
so it works on mobile data and can be added to the phone's home screen. Every push to `main`
publishes again.

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
