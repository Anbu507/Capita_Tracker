# Changelog

## Online

Since 1.1.2 the app is published at https://anbu507.github.io/Capita_Tracker/ (GitHub Pages),
so it works on mobile data and can be added to the phone's home screen. Every push to `main`
publishes again.

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
