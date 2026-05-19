# Family Finance Command Centre

A multi-centre personal finance app for couples and partners.

## Tech Stack
- React 18 + Vite 5
- Supabase (auth + database + RLS)
- Vercel (deployment)
- Vitest (unit testing)
- PWA

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/Johannanadjei/family-finance.git
cd family-finance
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```
Fill in your Supabase URL and anon key from your Supabase project settings.

### 4. Run development server
```bash
npm run dev
```

### 5. Run tests
```bash
npm run test
```

### 6. Run audit
```bash
bash scripts/audit.sh
```

## Environment Variables

| Variable | Description |
|---|---|
| VITE_SUPABASE_URL | Your Supabase project URL |
| VITE_SUPABASE_ANON_KEY | Your Supabase anon public key |

## Deployment

Deployed automatically to Vercel on every push to main.
Live: https://family-finance-plum.vercel.app

## Architecture

See `docs/architecture.md` for full technical documentation.
See `docs/engineering-decisions.md` for all architectural decisions.

## Testing

```bash
npm run test          # run all tests
npm run test:coverage # run with coverage report
```

All pure functions in `src/lib/` have unit tests.
All validation functions have unit tests.
Tests must pass before any commit.
