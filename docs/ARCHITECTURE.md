# Capital Tracker — Architecture

| Version | What it is |
|---|---|
| **1.0.0** (git tag `v1.0.0`) | Base version: balance, daily log, history, charts, backup. |
| **1.1.1** (this) | The same app with **every screen in simple, everyday words**, so someone who only uses WhatsApp, YouTube and UPI can read it. See [§13](#13-version-111--simple-everyday-words). No features added or removed. |

## 1. The problem

Every day I buy **3 eggs and 3 bananas** from the same shop. The price moves a little
from day to day, so paying the exact small amount every day is annoying.

New system: I give the shop a **fixed amount up front** (for example ₹500). Each day I
note what I took and what it cost. The app tells me **how much of my money is left at
the shop**, and when it is time to top up again.

## 2. Goals

| Goal | What it means in practice |
|---|---|
| Very simple | Logging today's purchase takes **2 taps**: open the sheet, check the amount, save. |
| Always know the balance | The balance is the first thing on the home screen, big. |
| Works on every screen | Phone first; the same app scales to tablet and desktop with no separate code. |
| Smooth | No page reloads, no loading spinners, small bundle, animations that respect "reduce motion". |
| Charts | Balance over time and spend per day/week, with tap-to-read tooltips and a table view. |
| Zero cost, zero setup | No server, no account, no database to run. Works offline. |

## 3. Key decisions

| Decision | Choice | Why |
|---|---|---|
| App type | Single-page web app, installable (PWA) | One codebase for phone, tablet and desktop; can be "installed" on the phone's home screen. |
| Language / build | Vite + vanilla TypeScript, no framework | Same stack as the stopwatch project; tiny bundle; nothing to break. |
| Styling | Plain CSS with design tokens (CSS custom properties) | Light/dark themes and responsive layouts with no dependency. |
| Charts | Hand-written SVG (no chart library) | ~10 KB instead of ~200 KB; full control over touch tooltips and animation. |
| Storage | `localStorage` on the device, schema-versioned | One shop, one entry a day → a few KB per year. No backend needed. |
| Backup | Export / import a JSON file | Protects against a lost or reset phone without needing a server. |
| Money | Stored as **integer paise** (₹42.50 → `4250`) | No floating-point errors (0.1 + 0.2 ≠ 0.3). |
| Dates | Stored as local `YYYY-MM-DD` strings | "The day I bought it", independent of time zones. |
| Backend | **None for now** (see §12) | The app is built so a sync backend can be added later without touching the screens. |

## 4. Overall structure

```
┌─────────────────────────── Browser (phone / tablet / desktop) ───────────────────────────┐
│                                                                                           │
│   UI layer (src/ui, src/screens)                                                          │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   ┌──────────────┐ ┌───────────┐   │
│   │  Home    │ │ History  │ │ Insights │ │ Settings │   │ Entry sheet  │ │ Toast /   │   │
│   │          │ │          │ │ (charts) │ │          │   │ (add / edit) │ │ Confirm   │   │
│   └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   └──────┬───────┘ └───────────┘   │
│        │  render(state)          │            │                │ actions                  │
│        ▼                         ▼            ▼                ▼                          │
│   State layer (src/data/store.ts) — one AppData object, subscribe(), actions              │
│        │                                                                                  │
│        ├── Domain layer (src/domain) — PURE functions, no DOM:                            │
│        │     ledger.ts  balance, running balance, stats, days-left forecast               │
│        │     money.ts   parse / format paise      dates.ts  local-date helpers            │
│        ▼                                                                                  │
│   Persistence (src/data/storage.ts) — load / validate / migrate / save → localStorage     │
│                                                                                           │
│   Service worker (public/sw.js) — caches the app shell so it opens offline                │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

**Data flow (one direction only):**

```
user taps Save ─▶ store.action() ─▶ new AppData ─▶ storage.save() ─▶ subscribers notified
                                                                   └▶ current screen re-renders
```

Screens never write to storage directly, and the domain layer never touches the DOM.
That keeps every calculation unit-testable (`tests/`) and lets a backend replace
`storage.ts` later.

## 5. Data model

```ts
// Money is always integer paise. Dates are local "YYYY-MM-DD".

interface Item {            // the things I buy: eggs, bananas (editable in Settings)
  id: string;
  name: string;             // "Eggs"
  emoji: string;            // "🥚"
  defaultQty: number;       // 3
  archived: boolean;        // removed items stay readable in old entries
}

interface PurchaseEntry {
  kind: 'purchase';
  id: string;
  date: string;             // "2026-10-22"
  amount: number;           // 4200  (₹42.00) — what the shop charged in total
  items: { itemId: string; name: string; emoji: string; qty: number }[];  // snapshot
  note: string;
  createdAt: number;        // ms — orders entries inside the same day
  updatedAt: number;
}

interface TopUpEntry {      // money I gave to the shop
  kind: 'topup';
  id: string; date: string; amount: number; note: string;
  createdAt: number; updatedAt: number;
}

interface Settings {
  shopName: string;                 // optional, shown as "Balance at <shop>"
  currency: 'INR' | 'USD' | 'EUR' | 'GBP';
  lowBalance: number;               // paise; warn at or below this
  theme: 'system' | 'light' | 'dark';
  lastBackupAt: number | null;
}

interface AppData {
  version: 1;                       // bump + migrate when the shape changes
  items: Item[];
  entries: (PurchaseEntry | TopUpEntry)[];
  settings: Settings;
}
```

Purchases keep a **snapshot** of each item's name and emoji, so renaming or removing an
item in Settings never changes history.

## 6. Calculations (src/domain/ledger.ts)

| Value | Rule |
|---|---|
| Balance | Σ top-ups − Σ purchases. Negative means "I owe the shop". |
| Entry order | by `date`, then `createdAt`. |
| Running balance | the balance right after each entry (shown in History). |
| Current top-up progress | balance right after the latest top-up = 100 %; the meter shows what is left of it. |
| Average day | the average total of the last 7 **days that had a purchase** (more than one purchase on a day counts as one day). |
| Days left (estimate) | ⌊balance ÷ average day⌋, only when balance > 0 and there is purchase history. |
| Typical range | min–max of those daily totals ("₹38–₹46"), which shows the price drift. |
| Low balance | balance ≤ `settings.lowBalance` → warning; balance < 0 → "You owe ₹X". |
| Daily balance series | one point per calendar day = end-of-day balance; days with no entry carry the previous balance. |
| Spend buckets | ≤ 45 days → per day; ≤ 400 days → per week (Mon–Sun); else per month. |

## 7. Screens

Four screens plus one sheet. Navigation is a hash router (`#/`, `#/history`,
`#/insights`, `#/settings`), so the browser back button works and nothing reloads.

| Screen | Contents |
|---|---|
| **Home** | Hero balance (one big number) · meter "₹X of ₹Y left since last top-up" · status line (≈ N days left / low balance / you owe) · **Log purchase** (primary) and **Add money** buttons · "Today" state (already logged ✓) · KPI tiles: last 7 days, average day, days left · mini chart "Spend, last 14 days" · Recent 5 entries · backup reminder when needed. |
| **History** | Filter: All / Purchases / Money added · grouped by month, each month header shows spent and added · each row: date, items (🥚 3 · 🍌 3), amount, balance after · tap a row to edit or delete (with **Undo**). |
| **Insights** | One range filter for the whole page: 7 days / 30 days / 90 days / All · KPI tiles: spent, added, average day (+ range), eggs/bananas bought · **Balance over time** (line + soft area) · **Spend per day/week** (columns + average line) · each chart has a **Table** toggle. |
| **Settings** | Shop name · items I buy (emoji, name, usual quantity; add / remove) · currency · low-balance alert · theme (System / Light / Dark) · backup: export, import · try sample data · erase everything. |
| **Entry sheet** | Type switch: Purchase / Add money · date (defaults to today, no future dates) · item steppers (pre-filled with my last purchase) · amount (pre-filled with my last amount, selected so typing replaces it) · note · Save / Delete. |

## 8. Responsive layout (one codebase, three layouts)

Breakpoints are CSS-only (`@media (min-width: …)`); the screens don't know which
layout they are in.

**Phone — below 720 px:** bottom tab bar with a raised center **＋** button; the entry
sheet slides up from the bottom and can be dragged down to close.

```
┌──────────────────────────┐
│ Capital Tracker          │  app bar
├──────────────────────────┤
│ Balance at shop          │
│ ₹458                     │  hero number
│ ████████████░░░░         │  meter
│ ₹458 of ₹500 · ≈10 days  │
│ [ ＋ Log today        ]  │
│ [    Add money        ]  │
│ ┌──────┐┌──────┐┌──────┐ │  KPI tiles
│ └──────┘└──────┘└──────┘ │
│ Spend, last 14 days ▁▃▂▅ │
│ Recent ...               │
├──────────────────────────┤
│ Home  History (＋) Insights Settings │  bottom tabs
└──────────────────────────┘
```

**Tablet — 720 to 1099 px:** a slim navigation rail on the left (icons + labels);
content in two columns where it helps; the sheet becomes a centered dialog.

**Desktop — 1100 px and up:** a sidebar with the app name, the two action buttons and
the navigation; Home becomes a dashboard grid; the two Insights charts sit side by side.

```
┌─────────────┬──────────────────────────────────────────────┐
│ Capital     │ ┌──── Balance (hero + meter) ───┐┌─ KPIs ──┐ │
│ Tracker     │ └───────────────────────────────┘└─────────┘ │
│ [＋ Log]    │ ┌──── Spend, last 14 days ──────┐┌─ Recent ┐ │
│ [Add money] │ └───────────────────────────────┘└─────────┘ │
│ Home        │                                              │
│ History     │                                              │
│ Insights    │                                              │
│ Settings    │                                              │
└─────────────┴──────────────────────────────────────────────┘
```

Other rules that make it feel right on every device:

- `dvh` units and `env(safe-area-inset-*)` so nothing hides behind phone notches or the
  browser bar.
- Touch targets at least 44 px; amount field uses `inputmode="decimal"` (number keypad).
- Content width capped (≈ 1200 px) so lines never get too long on big monitors.
- Light and dark themes from the same tokens; follows the system unless changed.
- `prefers-reduced-motion` turns animations off.

## 9. Charts

Built in `src/ui/charts/` as plain SVG drawn at the container's real pixel width
(a `ResizeObserver` redraws on rotate/resize, so text never stretches).

| Chart | Form | Interaction |
|---|---|---|
| Balance over time | 2 px line + 10 % area wash, zero baseline, end value labelled | crosshair snaps to the nearest day; tooltip shows date + balance; arrow keys work too |
| Spend per day / week | thin columns (≤ 24 px, 4 px rounded tops), solid average line | the whole column slot is the touch target; others dim; tooltip shows date + amount + items |
| Balance sparkline (Home hero) | small gray line, accent end dot | none (it's a summary; the full chart is on Insights) |
| Top-up meter | blue fill on a light-blue track; turns amber/red with an icon + label when low | none |

Every chart card has a **Table** toggle that shows the same numbers as a table
(tooltips are never the only way to read a value). One accent color (blue,
validated for contrast on both light and dark surfaces); status colors (amber, red)
are used only for low/negative balance, always with an icon and text.

## 10. Offline, install and backup

- `public/sw.js` caches the app shell on first visit; afterwards the app opens with no
  network. Registered only in production builds and only over HTTPS/localhost.
- `public/manifest.webmanifest` + icon → "Add to Home screen" gives a full-screen app.
- Data lives in this browser's `localStorage`. **Clearing site data or losing the phone
  loses it**, so Settings has Export (downloads a `.json` backup) and Import, and Home
  reminds me when there is no recent backup.
- The app asks the browser for persistent storage (`navigator.storage.persist()`), which
  reduces the chance of the browser evicting the data.

## 11. Folder structure

```
06-Capital tracker/
├── README.md                 how to run, build, deploy
├── docs/ARCHITECTURE.md      this file
├── index.html                app shell (nav, outlet, sheet, toast)
├── package.json  tsconfig.json  vite.config.ts
├── public/
│   ├── manifest.webmanifest  icon.svg  sw.js
├── src/
│   ├── main.ts               boot: load data, theme, router, service worker
│   ├── domain/               PURE logic (unit tested)
│   │   ├── types.ts  money.ts  dates.ts  ledger.ts  defaults.ts  sample.ts
│   ├── data/
│   │   ├── storage.ts        localStorage load / validate / migrate / save
│   │   └── store.ts          state container + actions (add, update, delete, undo…)
│   ├── ui/
│   │   ├── dom.ts            h() / s() element helpers (text is never parsed as HTML)
│   │   ├── icons.ts  router.ts  lifecycle.ts  sheet.ts  toast.ts  confirm.ts
│   │   └── charts/           lineChart.ts  barChart.ts  sparkline.ts  chartCard.ts  scale.ts
│   ├── screens/              home.ts  history.ts  insights.ts  settings.ts  entrySheet.ts  shared.ts
│   └── styles/               tokens.css  base.css  layout.css  components.css  charts.css
└── tests/                    ledger / money / dates tests (node --test, no extra packages)
```

## 12. Open questions — left out on purpose

These were not clear from the idea, so the app does **not** do them yet. Each one can be
added without redesigning the app.

1. **Sync between devices / backup in the cloud.** Today the data lives on one device.
   If I want phone + laptop to share it, the plan is a small Cloudflare Worker + D1
   (same as the stopwatch project) behind `storage.ts`. Needs a decision on sign-in.
2. **Shopkeeper access.** Should the shopkeeper see or confirm the log? That needs a
   backend and sharing rules.
3. **Price per item.** The app records the **total** the shop charged, not separate egg
   and banana prices. Per-item prices would allow an "egg price trend" chart, but make
   daily logging slower.
4. **More than one shop.** One balance only for now.
5. **Reminders / notifications** ("you haven't logged today", "balance low"). Web push
   needs a server; a simple in-app reminder is already on Home.
6. **CSV / Excel export.** JSON backup only for now.
7. **App lock (PIN).** Not added; the phone lock protects it.
8. **Hosting.** Not deployed yet. Cloudflare Pages or GitHub Pages (both free) can host
   the `dist/` folder; `vite.config.ts` uses relative paths so either works.
9. **iPhone home-screen icon.** iOS wants a PNG `apple-touch-icon`; only an SVG icon is
   included now.

## 13. Version 1.1.1 — simple, everyday words

### Why

Two people look at this app: me (comfortable with apps) and the shopkeeper, who uses only
WhatsApp, YouTube and UPI. Words like *balance*, *top-up*, *log a purchase*, *insights*,
*backup* or *restore* are app/bank words. 1.1.1 changes only the **words** on the screen — the
screens, data and calculations are exactly the same as 1.0.0.

### Rules for any text in the app

1. Use words people say out loud at a shop: *money left*, *I gave money*, *what I bought*.
2. One thing = one word, everywhere (never "Added money" on one screen and "Top-up" on another).
3. Short sentences. Say what to do next ("Give the shop money soon.").
4. No symbols that need explaining (≈ was removed; "about 14" instead).

### Word list

| Old word (1.0.0) | Simple word (1.1.1) |
|---|---|
| Balance | **Money left** |
| Add money / Top-up / Money added | **Add money I gave** / **Money given** |
| Purchase / Log a purchase | **Add what I bought** / **Bought** |
| New entry / Edit purchase | **Add** / **Change what I bought** |
| Amount the shop charged | **How much it cost** |
| Usual day (average) | **Daily cost** · "Normally ₹38 to ₹44" |
| ≈ 14 days left at your usual day | **Enough for about 14 more days** |
| Low balance — top up soon | **Money is running low — give the shop money soon** |
| Recent / All history | **Latest** / **See all** |
| Insights | **Charts** |
| Balance over time / Spend per day | **Money left, day by day** / **Money spent each day** |
| Table | **Numbers** |
| Backup / Download backup / Restore | **Save a copy** / **Bring back a copy** |
| Load sample data / Erase everything | **Show an example** / **Delete everything** |
| Currency / Theme (System) | **Money type** / **Colour (Auto)** |
| works offline | **works without internet** |

The words live in the screen files (`src/screens/*.ts`, plus the navigation labels in
`src/main.ts` and `src/ui/router.ts`). Nothing in `src/domain` changed.

### Still open

- **Tamil (or another language).** Plain English first; a translation can follow the same
  word list once the language is decided.
- An earlier 1.1.1 attempt with WhatsApp messages and a separate Shop view was set aside to keep
  the app simple. It is kept in git under the tag `v1.1.1-whatsapp` and is not part of this version.
