# 🏡 Family Finance Command Centre

A mobile-first family budgeting dashboard built with React + Vite. Designed to replace spreadsheet-based budgeting with a clean, fast, and family-friendly interface.

---

## ✨ Features

### Free Tier
| Feature | Description |
|---|---|
| 🏠 Home Dashboard | Monthly income, budget health, spending overview |
| 💸 Daily Tracker | Log and review expenses day by day with 14-day bar chart |
| 💜 Payday Tracker | Track when salaries land and see real-time available balance |
| 📊 Budget View | Category-by-category spending with progress bars |
| 📋 Transaction Log | Filterable log by date, week, type and category |
| ➕ Add Payments | Expense and income modal with date, week and category pickers |
| 💱 25 Currencies | GHS, USD, GBP, NGN, KES, ZAR and 19 more |
| 🎨 Family Warmth theme | Default warm green skin |

### Premium (GHS 49/month · GHS 399/year)
| Feature | Description |
|---|---|
| 🏢 Multiple Control Centres | Separate workspaces for shop, overseas residence, investments, rentals |
| 🔑 Guest / Staff Access | PIN-protected portal for nanny, driver, or household staff to log expenses |
| 📈 Yearly Dashboard | 12-month trend chart with insights and projections |
| 🎨 4 Extra Skins | Corporate Edge, Chic & Elegant, Clean Minimal, Cosy Home |
| 🌈 30 Colour Accents | 6 accent colours per skin |
| 📤 Data Export | CSV / JSON export (coming soon) |
| 👫 Multi-user Sync | Husband & wife shared access via Firebase (coming soon) |

---

## 🗂 Project Structure

```
family-finance/
├── index.html              # HTML entry point
├── vite.config.js          # Vite configuration
├── vercel.json             # Vercel SPA routing config
├── package.json            # Dependencies (React 18, Vite 5, Recharts, Lucide)
├── public/
│   └── favicon.svg
└── src/
    ├── main.jsx            # React root mount
    ├── index.css           # Global CSS reset
    └── App.jsx             # Entire application (single file)
```

---

## 🧩 Component Architecture

```
App
├── AuthScreen              # Sign in / demo loader
├── GuestLoginScreen        # PIN keypad for staff access
├── GuestView               # Restricted expense-only portal
├── OnboardingFlow          # 3-step setup (profile → budget → done)
│   └── CurrencyPicker
└── Main App
    ├── WorkspacePanel      # Side panel — all control centres
    ├── WorkspaceCreateModal
    ├── UpgradeModal        # Premium paywall
    ├── HomeView            # Dashboard home
    ├── DailyView           # Daily tracker with 14-day chart
    ├── PaydayView          # Payday income tracker
    ├── BudgetView          # Category cards with progress bars
    ├── YearlyView          # 12-month Recharts bar chart
    ├── LogView             # Transaction log with filters
    ├── SettingsView
    │   ├── ThemePicker     # Skin + colour accent selector
    │   └── GuestSettingsCard
    └── AddModal            # Add payment form
```

---

## 🎨 Theme System

Themes use CSS custom properties injected at `:root`. All components read from variables so switching skins is instant — no re-render of individual components needed.

**Variables used:**
```css
--th-h1, --th-h2        /* Header gradient colours */
--th-hero1, --th-hero2  /* Hero card gradient */
--th-page               /* Page background */
--th-card               /* Card background */
--th-card-shadow        /* Card box-shadow */
--th-text, --th-muted   /* Text colours */
--th-inp-bg             /* Input background */
--th-inp-border         /* Input border colour */
--th-radius-card        /* Card border radius */
--th-radius-btn         /* Button border radius */
--th-accent             /* Primary accent (FAB, chips, buttons) */
--th-accent-end         /* Accent gradient end */
--th-nav                /* Bottom nav active colour */
--th-chip               /* Active chip background */
```

---

## 💾 Data Model

All data is stored in `localStorage` with these keys:

| Key | Contents |
|---|---|
| `fp_profile` | User profile (name, family name, income, currency, adults, children) |
| `fp_categories` | Array of budget categories with name, icon, budget amount |
| `fp_transactions` | All transactions (date, week, type, category, amount, description, loggedBy) |
| `fp_incomes` | Payday income sources (expected amount, pay day, received status) |
| `fp_guest` | Guest access settings (enabled, PIN, label, allowed categories) |
| `fp_notifs` | Notification toggle preferences |
| `fp_plan` | Current plan: `"free"` or `"premium"` |
| `fp_workspaces` | Extra workspaces beyond the primary family workspace |
| `fp_theme` | Active skin ID and accent colour index |

### Transaction shape
```js
{
  id:          1234567890,          // Date.now()
  date:        "2026-05-16",        // ISO date string
  week:        "Week 1",            // "Week 1" to "Week 5"
  type:        "Expense",           // "Income" | "Expense"
  category:    "Food",              // matches a category name
  description: "Weekly groceries",  // optional
  amount:      1200,                // number, no currency symbol
  loggedBy:    "Ama",               // guest name, or undefined
}
```

---

## 🔌 Google Sheets Sync (future)

The data model matches Google Sheets column-for-column. To connect:

1. Enable Sheets API in Google Cloud Console
2. Get your `SHEET_ID` from the spreadsheet URL
3. Replace the `store` / `load` helpers in `App.jsx`:

```js
// LOAD — replace localStorage.getItem
const response = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Transactions!A:H`,
  { headers: { Authorization: `Bearer ${accessToken}` } }
);

// SAVE — replace localStorage.setItem
await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Transactions!A:H:append?valueInputOption=RAW`,
  { method:"POST", headers:{ Authorization:`Bearer ${accessToken}` }, body: JSON.stringify({ values: [[tx.id, tx.date, tx.week, tx.type, tx.category, tx.description, tx.amount, tx.loggedBy||""]] }) }
);
```

---

## 🔥 Firebase Sync (future)

```js
// In handleAddTx — after setTxs()
import { addDoc, collection } from "firebase/firestore";
await addDoc(collection(db, "families", profile.familyId, "transactions"), tx);

// In useEffect on mount — replace localStorage load
const snapshot = await getDocs(collection(db, "families", familyId, "transactions"));
setTxs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
```

---

## 🚀 Deploy to Vercel

### First time
```bash
cd ~/Desktop/family-finance
npm install
npx vercel
```

### Push updates
```bash
npx vercel --prod
```

### Local development
```bash
npm run dev
# Open http://localhost:5173
```

---

## 📦 Dependencies

| Package | Version | Purpose |
|---|---|---|
| react | 18.3.1 | UI framework |
| react-dom | 18.3.1 | DOM renderer |
| recharts | 2.12.7 | Yearly bar chart |
| lucide-react | 0.383.0 | Icons |
| vite | 5.3.4 | Build tool |
| @vitejs/plugin-react | 4.3.1 | JSX transform |

---

## 🛣 Roadmap

- [ ] Google Sheets two-way sync
- [ ] Firebase real-time multi-user (husband & wife)
- [ ] Paystack / Flutterwave payment for Premium
- [ ] Push notifications for payday and overspend alerts
- [ ] CSV / JSON data export
- [ ] iOS / Android PWA install prompt
- [ ] Recurring transaction support
- [ ] Budget vs actuals monthly report PDF

---

## 👨‍👩‍👧‍👦 Built For

The Adjei Family — and any family that wants a smarter way to manage money together.

*Built with Claude · Deployed on Vercel*
