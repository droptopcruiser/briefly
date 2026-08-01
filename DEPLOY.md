# Deploying Briefly to Vercel

Briefly is a standard Next.js 16 app, so Vercel deploys it with near-zero config.
The pipeline runs ~10–20s per matter (three sequential Haiku calls); the routes
that run it set `maxDuration = 60`, well within Vercel's 300s Fluid Compute
ceiling (available even on the free Hobby plan).

## 1. Get the code on GitHub

Create a new **empty** repo on GitHub (no README/.gitignore), then from the
project root:

```bash
git remote add origin https://github.com/<you>/briefly.git
git push -u origin main
```

## 2. Import into Vercel

1. vercel.com → **Add New… → Project** → import the GitHub repo.
2. Framework preset auto-detects **Next.js**. Leave build/output settings default.
3. Add **Environment Variables** (Production + Preview) — same as `.env.local`:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the `sb_secret_…` key (server-only) |
| `INBOUND_WEBHOOK_SECRET` | a **strong, unique** value (not the dev one) |

4. **Deploy.**

## 3. After deploy

- The app is live at `https://<project>.vercel.app`. The submission form and
  matter views work immediately (Supabase is already the store).
- **Inbound email:** point your mail provider's inbound webhook at
  `https://<project>.vercel.app/api/inbound?token=<INBOUND_WEBHOOK_SECRET>`
  (Postmark Inbound or SendGrid Inbound Parse; add the MX/DNS records for your
  domain). The route already speaks both providers' formats.

## Notes

- The Supabase schema is already applied (see `supabase/schema.sql`). No DB step
  needed at deploy time.
- Rotate any secret that was shared in plaintext before going to real traffic.
- `.env.local` is gitignored and never deployed — Vercel uses the env vars you
  set in step 2.
