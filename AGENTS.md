# AGENTS.md — DineOS / Kiwi Architecture & Engineering Guide

This guide enables AI coding agents (and human engineers) to navigate, understand, and modify the DineOS codebase efficiently without having to scan 7,500+ lines of CSS or 1,300+ lines of monolithic route components.

---

## 1. Core Technology Stack

- **Framework:** React 18 + Vite (SPA with PWA support via `vite-plugin-pwa`)
- **State Management:** **Zustand** (located in `src/stores/`). **Do NOT migrate to Redux.** Zustand is 1KB, fast, and uses atomic subscriptions.
- **Backend / Real-time DB:** Firebase Firestore + Firebase Auth (`src/firebase.js`). Uses real-time `onSnapshot` listeners.
- **Styling:** Vanilla CSS (`src/index.css`) with CSS custom properties. **No TailwindCSS.**
- **Charts:** Recharts (`AreaChart`, `BarChart`, `ResponsiveContainer`).
- **Icons:** `lucide-react`.

---

## 2. State Management Architecture (`src/stores/`)

The app divides global state into discrete domain stores. Always use **fine-grained selectors** (`useStore(s => s.item)`) to prevent unnecessary component re-renders.

| Store File | Domain / Responsibilities | Key Selectors / Actions |
|---|---|---|
| `authStore.js` | Firebase Auth session, user document, restaurant settings, onboarding status | `user`, `restaurant`, `staffDoc`, `initAuthListener()` |
| `orderStore.js` | Active orders, live pipeline, settlement logic, offline sync, audio alerts | `activeOrders`, `unreadOnlineCount`, `subscribeActiveOrders()`, `settleOrder()` |
| `menuStore.js` | Menu categories, items, dietary filters, search state | `categories`, `search`, `subscribeMenu()` |
| `tableStore.js` | Floor plan tables, real-time table statuses (occupied/free/bill requested) | `tables`, `subscribe()` |
| `shiftStore.js` | Cash register drawer sessions, opening/closing cash float | `currentShift`, `startShift()`, `closeShift()` |
| `staffStore.js` | Clock-in/out, PIN authentication, staff list | `staffMembers`, `subscribeStaff()` |
| `themeStore.js` | Obsidian Dark vs Light mode toggle, DOM `data-theme` attribute | `theme`, `toggleTheme()`, `effectiveTheme` |
| `kdsStore.js` | Kitchen Display System station filters, prep tickets | `stationFilter`, `kdsOrders` |
| `tokenStore.js` | Customer token calling screen | `tokens`, `nextToken()` |
| `updateStore.js` | PWA Service Worker background update alerts | `hasUpdate`, `applyUpdate()` |

> [!TIP]
> **Performance Rule:** Never call `const { activeOrders } = useOrderStore();` — this re-renders on ANY change in the 38KB store. Always call `const activeOrders = useOrderStore(s => s.activeOrders);`.

---

## 3. Styling & Theme System (`src/index.css`)

DineOS uses an **Obsidian Dark / Crisp Light** dual-theme design system.

### Key CSS Tokens
- Canvas Base: `var(--color-bg)` (`#0c0d11` dark, `#ffffff` light)
- Secondary Surface: `var(--color-bg-secondary)` (`#121319` dark, `#f8f9fa` light)
- Card / Modal Surface: `var(--color-bg-elevated)` (`#161722` dark, `#ffffff` light)
- Primary Text / Headlines: `var(--color-label)` (`#ffffff` dark, `#000000` light)
- Body / Secondary Labels: `var(--color-label-secondary)` (`#d1d5db` dark, `#222222` light)
- Muted Subtitles: `var(--color-label-tertiary)` (`#9ca3af` dark, `#6b7280` light)
- Hairline Borders: `var(--color-separator)` (`rgba(255, 255, 255, 0.08)` dark)
- Brand Green: `#10b981` (primary action / settled status)

### Card Rule
When styling cards, ensure you explicitly provide `color: var(--color-label)` or use standard `.card` classes so text remains readable in dark mode.

---

## 4. Key Routes Directory (`src/routes/`)

- `Login.jsx` — Clean, high-contrast, accessible split-panel authentication screen.
- `Dashboard.jsx` — Executive owner overview: daily gross sales, live kitchen pipeline, yesterday comparison, reservations, active orders table.
- `POS.jsx` — Cashier point-of-sale interface: menu grid, cart drawer, payment modal, thermal receipt printing.
- `TableMap.jsx` — Floor plan visualizer with table order association.
- `OnlineOrders.jsx` — Swiggy/Zomato/Direct delivery aggregator.
- `KDS.jsx` — Kitchen Display System for line cooks and prep stations.
- `Reports.jsx` — Sales history, tax exports, cashier shift reconciliations.
- `admin/*` — Back-office management (Menu, Staff, Payroll, Inventory, Customers, Settings).

---

## 5. Rules for Agents Modifying Code

1. **Keep Mobile in Mind:** Viewport width on handheld POS / phone is ~375–430px. Always add `minWidth: 0` to flex child containers and horizontal scroll wrappers to tables (`overflowX: 'auto'`).
2. **Do Not Append Redundant CSS:** Check existing CSS classes in `index.css` before adding new global selectors.
3. **Keep Firebase Subscriptions Lean:** Always clean up `unsub()` callbacks inside `useEffect()`.
4. **Preserve Audio & Offline Modes:** The POS works in offline situations (indexedDB sync queue). Do not remove offline status guards.
