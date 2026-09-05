# Bax Yachting — Boat Assistant

A per-boat knowledge assistant for a yacht charter fleet. Guests scan a QR code and ask the boat
anything ("How does the fridge work?"); staff feed knowledge in through a friendly admin panel
(by hand, pasted text, voice notes, or WhatsApp chat exports) and the AI organizes it into clean
cards that a human reviews before anything goes live. The same brain answers in WhatsApp groups.

## What's inside

| Surface | Route | Notes |
| --- | --- | --- |
| Guest chat | `/b/<slug>` (e.g. `/b/demo-yacht`) | Public, mobile-first, stateless (history is sent by the client) |
| Admin panel | `/admin` | Login, boats, knowledge, import center, settings |
| Invite | `/invite/<token>` | Invited person sets a password → becomes a `member` |
| Chat API | `POST /api/chat` | Used by the guest chat |
| Import API | `POST /api/import` | text / voice / whatsapp → proposed cards (never auto-saved) |
| WhatsApp webhook | `GET/POST /api/whatsapp/webhook` | Meta Cloud API verification + incoming messages |
| Health | `GET /api/health` | |

Stack: Next.js 16 (App Router) · TypeScript · Drizzle ORM + PostgreSQL · Tailwind v4 · OpenRouter (LLM) ·
any Whisper-compatible STT · Meta WhatsApp Cloud API via `fetch`. No component library, no vector DB.

## Quick start (local)

```bash
cp .env.example .env         # fill in DATABASE_URL at minimum
npm install
npx drizzle-kit migrate --config drizzle.config.json   # or: npx drizzle-kit push
npx tsx scripts/seed.ts      # owner account + "Demo Yacht" with 5 cards (idempotent)
npm run dev                  # http://localhost:3000/admin
```

> `drizzle.config.json` points at the local database. For another database run the migrate
> command with `DATABASE_URL` set and edit `dbCredentials.url`, or use `npx drizzle-kit push`.

Sign in at `/admin/login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. If those env vars are missing the
first owner is created as **owner@baxyachting.com / changeme123** (shown on the login page) — change
it in *Settings → Your password*.

The owner account is also created automatically the first time the login page is opened, so the seed
script is optional; the demo yacht can be created from the Boats screen with one click.

## Environment variables

| Variable | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Postgres connection string (local, Neon, Supabase…). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | recommended | Owner account created on first run. Changeable later in Settings. |
| `OPENROUTER_API_KEY` | for AI | Key from https://openrouter.ai/keys. All LLM calls go to `https://openrouter.ai/api/v1/chat/completions`, server-side only. |
| `LLM_MODEL` | optional | OpenRouter model id. Default `deepseek/deepseek-chat`. Other good cheap options: `openai/gpt-4o-mini`, `google/gemini-flash-1.5`. The owner can override it in *Settings → Advanced* without redeploying. |
| `STT_API_KEY` | for voice | Enables the *Voice note* import. Any OpenAI-compatible `/audio/transcriptions` provider. |
| `STT_BASE_URL` | optional | Default `https://api.openai.com/v1`. Groq: `https://api.groq.com/openai/v1`. |
| `STT_MODEL` | optional | Default `whisper-1` (Groq: `whisper-large-v3`). |
| `WHATSAPP_ACCESS_TOKEN` | for WhatsApp | Permanent system-user token from Meta Business. |
| `WHATSAPP_PHONE_NUMBER_ID` | for WhatsApp | Phone number id from the WhatsApp app dashboard. |
| `WHATSAPP_VERIFY_TOKEN` | for WhatsApp | Any secret you choose; paste the same value into Meta's webhook config. |
| `WHATSAPP_BOT_DISPLAY_NAME` | optional | Name used to mention the bot in groups (`@assistant …`). Default `assistant`. |
| `NEXT_PUBLIC_APP_URL` | optional | Public URL; sent as referer to OpenRouter. |

**Nothing crashes when a key is missing.** Without `OPENROUTER_API_KEY` the admin shows a banner,
answers fall back to showing the best-matching cards verbatim, and imports are split by paragraph so
the whole flow can still be exercised. Without `STT_API_KEY` the voice tab is disabled with a note.
Without WhatsApp keys the webhook returns 503 and Settings shows "WhatsApp not connected".

## How knowledge flows

1. **Boat** — created in *Boats* (slug auto-generated from the name; guests use `/b/<slug>`).
2. **Cards** — `category / title / body`, source `manual | text_dump | voice | whatsapp_export`,
   status `draft | saved`. **Only saved cards are used for answers.**
3. **Import center** — paste text, upload a voice note, or upload a WhatsApp `.txt` export.
   The AI returns proposed cards (max ~8 per run, with a hint if more remain). Every card is editable;
   the human clicks **Save N cards** (or *Keep as drafts*). Raw material is never auto-saved.
4. **Answering** — `retrieveCards()` (Postgres full-text search, title weighted, ILIKE fallback; all
   cards included as background context when a boat has ≤ 12) → labeled excerpts + last 6 messages →
   LLM with a strict "answer only from excerpts, otherwise say you don't know + fallback contact" prompt.
   Web chat and WhatsApp share `answerQuestion()` in `src/lib/ai/answer.ts`.

## Acceptance walkthrough

1. Boats → **Add boat** ("Lamela") → opens its knowledge screen (empty state with a 3-step checklist).
2. **+ Add card** → pick *Fridge*, title "How to open the fridge", body… → **Save card**.
3. Open `/b/lamela` → ask "How does the fridge work?" → answer built from that card. Follow-up questions
   include recent context.
4. Import → *Paste text* → **Try with sample text** → **Break into cards** → edit → **Save N cards**.
5. Import → *WhatsApp export* → upload `fixtures/whatsapp-export-sample.txt` → review → save.
6. Ask again in the guest chat: new knowledge is used. Ask "What's the wifi password?" → honest fallback
   with the contact line from Settings.
7. Settings → People → enter an email → **Create invite link** → copy → open in a private window →
   set a password → member lands in admin and can add a card. Owner removes the member from Settings.

## Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel (framework preset: Next.js).
2. Create a Postgres database (Neon works great) and add all env vars from the table above in
   *Project → Settings → Environment Variables*.
3. Apply the schema once from your machine: `DATABASE_URL=<neon url> npx drizzle-kit push`
   (or `migrate` with the committed files in `drizzle/`).
4. Deploy. Open `https://<your-app>.vercel.app/admin/login`.
5. Optional: run `npx tsx scripts/seed.ts` against the production `DATABASE_URL` for the demo yacht,
   or just click *Create demo yacht* in the admin.

Long AI calls run inside route handlers with `maxDuration = 60`; imports are a few KB so everything
fits comfortably within serverless limits. No disk writes; uploads are handled in memory.

## Connect WhatsApp (Meta Cloud API) — later

1. In https://developers.facebook.com create a **Business** app and add the **WhatsApp** product.
2. Register/verify the company phone number that will act as the assistant. Copy the
   **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
3. Create a **System User** in Meta Business Suite with `whatsapp_business_messaging` permission and
   generate a **permanent access token** → `WHATSAPP_ACCESS_TOKEN`.
4. Choose any secret string → `WHATSAPP_VERIFY_TOKEN`. Redeploy so the env is live.
5. WhatsApp → Configuration → Webhook: callback URL `https://<your-app>.vercel.app/api/whatsapp/webhook`,
   verify token = the same string. Click *Verify and save*, then subscribe to the **messages** field.
6. In a charter group (or 1:1 chat) send `!bind lamela`. Done — the knowledge stays with the boat, so next
   week's group just runs `!bind lamela` again.

Group commands: `!bind <slug>`, `!unbind`, `!status`, `!on`, `!off`, `!help`, `!ask <question>`, or
mention `@assistant <question>`. In groups the bot stays silent unless addressed; in 1:1 chats every
message is treated as a question. Test locally with the verification handshake:

```bash
curl "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=123"
curl -X POST http://localhost:3000/api/whatsapp/webhook -H 'content-type: application/json' \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"306900000000","type":"text","text":{"body":"!bind demo-yacht"},"group_id":"test-group"}]}}]}]}'
```

(With fake keys the reply is computed and logged but the outbound Graph API call fails harmlessly.)

## Connect voice notes (STT) — later

Set `STT_API_KEY` (+ optionally `STT_BASE_URL` / `STT_MODEL`) to any Whisper-compatible provider.
The *Voice note* tab in Import appears automatically. Swap providers by changing
`transcribeAudio()` in `src/lib/ai/stt.ts`.

## Project layout

```
src/app/b/[slug]              guest chat (page + GuestChat client)
src/app/admin/login           login (owner auto-created)
src/app/admin/(app)/          authenticated shell: boats, boats/[id], import, settings
src/app/admin/actions.ts      all server actions (auth, boats, cards, invites, settings, whatsapp)
src/app/api/chat              guest chat endpoint
src/app/api/import            import pipeline (text | voice | whatsapp) → proposed cards
src/app/api/whatsapp/webhook  Meta Cloud API webhook
src/lib/ai/answer.ts          shared brain (retrieval + prompt + LLM)
src/lib/ai/retrieval.ts       Postgres FTS retrieval (seam for embeddings later)
src/lib/ai/ingest.ts          text / WhatsApp export → cards, validation + retry, heuristic fallback
src/lib/ai/prompts.ts         all prompts
src/lib/ai/llm.ts             OpenRouter client (timeout, retry, JSON mode)
src/lib/ai/stt.ts             transcribeAudio() seam
src/lib/whatsapp.ts           command handling, group↔boat binding, Graph API send
src/lib/auth.ts               scrypt passwords, DB sessions, httpOnly cookie, owner bootstrap
src/lib/copy.ts               all UI copy in one place (English)
src/db/schema.ts              Drizzle schema (the contract) · drizzle/ = migrations
scripts/seed.ts               owner + demo yacht
fixtures/                     sample WhatsApp export for testing
```

## Decisions (v1)

- **Stateless web chat.** No `chat_messages` table; the client sends the last 8 messages with each
  request. Simplest thing that gives working follow-ups; logging can be added later.
- **Auth without dependencies.** scrypt (Node built-in) password hashes, a `sessions` table, httpOnly
  `bax_session` cookie (30 days). Two roles only: `owner`, `member`. Auth is enforced in the
  `(app)` layout, in every server action, and in the import API route.
- **Retrieval.** Query-time `tsvector` (no stored column) — plenty for ≤ 500 cards per boat. For
  boats with ≤ 12 saved cards all cards are added as context so vague questions still work.
  `retrieveCards()` is the single seam for a future embeddings search.
- **Imports produce proposals only.** `import_jobs` records each run for traceability; proposed
  cards live in the browser until the human saves them (as `saved` or `draft`).
- **WhatsApp groups.** The Meta Cloud API exposes group messages with a `group_id`; the code binds on
  `group_id` when present and falls back to the sender's number, so 1:1 chats work identically.
  Message de-duplication of Meta retries is not implemented (replies are idempotent enough for v1).
- **No middleware/proxy file.** Route-level guards keep the setup simple and Vercel-friendly.
- **Email delivery** is out of scope; invite links are copied by the owner.
- **Language.** UI and cards are English; the answer prompt replies in the guest's language.
