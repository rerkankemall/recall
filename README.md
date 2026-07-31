# Afterword — real app scaffold

This is the "own its own page" version of the Afterword (formerly Recall) prototype: a Next.js app
with a real database, real auth, and a backend that keeps your Anthropic API
key private. It's a starting point, not a finished product — expect to tweak
things as you go, ideally with Claude Code doing the heavy lifting from here.

## What's here

```
app/
  page.tsx                  the Capture / Review / Library UI (client component)
  login/page.tsx            magic-link sign in
  api/extract/route.ts      calls Claude server-side (your API key lives ONLY here)
  api/ideas/route.ts        list + save entries/ideas (per-user, via Supabase RLS)
  api/ideas/[id]/review/route.ts   submit a review rating, reschedules the idea
  api/stripe/checkout/route.ts     start a subscription
  api/stripe/webhook/route.ts      Stripe tells us when payment succeeds
lib/
  supabaseClient.ts / supabaseServer.ts   DB clients (browser vs server)
  spacedRepetition.ts        the scheduling math (same as the prototype)
supabase/schema.sql          run this once to create your tables
```

## Setup (about 20-30 minutes the first time)

**1. Supabase (database + auth) — free tier is enough to start**
- Create a project at supabase.com
- Go to the SQL editor, paste in `supabase/schema.sql`, run it
- Go to Settings → API, copy the Project URL, anon key, and service_role key
  into your `.env.local` (copy `.env.example` to `.env.local` first)
- Go to Authentication → Providers → make sure Email is enabled (magic link
  is on by default)

**2. Anthropic API key**
- Get a key at console.anthropic.com → put it in `ANTHROPIC_API_KEY`
- Note: this now costs you money per extraction (unlike the Claude.ai
  prototype, which was free to you). Keep an eye on usage in the console
  while you're testing, and consider a per-user rate limit once you have
  real traffic — that's a good next thing to ask Claude Code to add.

**3. Run it locally**
```bash
npm install
npm run dev
```
Visit localhost:3000 — it'll redirect you to sign in, send yourself a magic
link, and you're in.

**4. Deploy**
- Push this to a GitHub repo
- Import it in Vercel, add the same env vars there
- Update `NEXT_PUBLIC_APP_URL` to your real domain once you have one

**5. Stripe (only when you're ready to charge)**
- Create a product + recurring price in the Stripe dashboard, copy the
  price ID into `STRIPE_PRICE_ID`
- Add a webhook endpoint pointing at `https://yourdomain.com/api/stripe/webhook`,
  subscribed to `checkout.session.completed` and `customer.subscription.*`
- The `subscriptions` table now tracks who's paid — gating features behind
  it (e.g. capping free users at N entries) is a good first paid-feature task

## What's intentionally left simple

- No rate limiting on `/api/extract` yet — add this before real users show up,
  or one person can run up your Anthropic bill.
- No account deletion / data export flows — needed eventually for privacy
  compliance (GDPR-style "right to be forgotten"), not urgent for testing.
- Review scheduling math is a simplified SM-2, not the exact algorithm
  Anki/Readwise use — fine for launch, revisit if retention becomes core
  to your pitch.

## Suggested next steps with Claude Code

Point Claude Code at this folder and try things like:
- "Add a per-user daily limit on /api/extract calls"
- "Add a settings page with account deletion"
- "Style the Stripe checkout redirect flow with a pricing page"
- "Add support for pasting a URL instead of raw text, and fetch the article
  server-side before extracting ideas"
