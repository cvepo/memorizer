# Memorizer

Turn a spreadsheet of questions into repeated multiple-choice practice.

Import a `.csv` or `.xlsx`, and Memorizer works out which columns are which, generates
plausible wrong answers for questions that only came with a correct one, and drills you
until each question has been answered correctly twice. Flashcards, an adaptive Learn mode
and generated quizzes all read from the same deck.

**Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase Postgres · Vercel**

## What is interesting here

- **Forgiving import.** Column detection handles the full MCQ layout, a bare
  `Question | Answer` pair, and answer keys that point at a choice by letter
  (`Correct: B` resolves to Option B's text). Title rows above the headers are skipped.
  Everything is overridable in a preview that reports valid rows, missing answers and
  probable duplicates before a single row is written.
- **Distractors generated at read time, not stored.** When a question has no wrong
  answers, they are borrowed from other questions' correct answers — same topic first,
  preferring similar lengths so a short answer is not sitting next to a long one. Because
  nothing is persisted, the combination and the order differ every session.
- **Mastery that resists short-term recall.** A miss resets the counter and puts the
  question back 3–7 questions later rather than immediately.
- **Concurrency-safe progress.** Mastery updates are a single atomic upsert in Postgres,
  so two people studying at once cannot clobber each other's counters.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> and create a new project. Any region near you is fine;
   the free tier is plenty.
2. Save the database password it asks you to set (you will not need it for this app, but you
   will want it later).

## 2. Create the schema

Open **SQL Editor → New query** in the Supabase dashboard, paste the entire contents of
[`supabase/schema.sql`](supabase/schema.sql), and run it.

It is idempotent — re-running it is safe and is how you apply later changes.

It creates:

| Object | Purpose |
|---|---|
| `profiles` | one row per friend, so mastery is tracked separately |
| `courses` → `decks` → `questions` | the content hierarchy |
| `answer_choices` | wrong answers that came from the spreadsheet |
| `question_progress` | per profile, per question: seen/correct/incorrect/mastery |
| `quiz_attempts`, `quiz_answers` | quiz history, reviewable later |
| `deck_stats(profile)` | one round trip for every deck's mastery breakdown |
| `topic_stats(deck, profile)` | accuracy by topic |
| `record_answer(...)`, `record_answers(...)` | atomic mastery updates |
| RLS enabled, no policies | the anon key grants nothing; all access is server-side |

## 3. Collect your keys

**Project Settings → Data API** → copy the **Project URL**.
**Project Settings → API Keys** → under **Secret keys**, reveal and copy the key that starts
with `sb_secret_`.

That key bypasses RLS. It is used only in server code and must never be committed or sent to
the browser. The publishable key is not needed — RLS is on with no policies, so it would return
nothing anyway.

## 4. Configure the app

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
# a long random string
openssl rand -base64 48

# bcrypt hashes for the two passwords
npm run hash -- "the study password"
npm run hash -- "the admin password"
```

Set `ADMIN_EMAIL` to the email you want to sign in with.

> **Escaping.** Next.js runs dotenv-expand over `.env` files, so an unescaped
> bcrypt hash like `$2b$12$abc…` loses `$2b` and `$12` to variable expansion and
> arrives truncated — every password then looks wrong with nothing in the logs.
> In `.env.local` write `\$2b\$12\$…`; `npm run hash` prints that form ready to
> paste. Values set through the Vercel dashboard or CLI are taken verbatim and
> need no escaping. The app validates the hashes at startup and fails loudly if
> one is malformed.

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your project URL |
| `SUPABASE_SECRET_KEY` | the `sb_secret_…` key |
| `SESSION_SECRET` | signs the session cookie |
| `SITE_PASSWORD_HASH` | bcrypt hash — study access |
| `ADMIN_EMAIL` | the admin's email address |
| `ADMIN_PASSWORD_HASH` | bcrypt hash — study access **plus** import and edit |

## 5. Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, enter the **admin** password, and pick a name.

## 6. Deploy

```bash
npx vercel
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add SUPABASE_SECRET_KEY production
npx vercel env add SESSION_SECRET production
npx vercel env add SITE_PASSWORD_HASH production
npx vercel env add ADMIN_PASSWORD_HASH production
npx vercel --prod
```

Repeat the `env add` calls for `preview` and `development` if you want previews to work.

---

## How access works

There are no real accounts. Two ways in, one shared set of decks — the login screen has a
**Study access / Admin** toggle:

- **Study access** — the shared password. Study everything, record *your own* progress, but no
  changes to course material.
- **Admin** — an **email and password**. Everything above, plus create/edit/delete courses,
  decks and questions, and import spreadsheets.

A wrong admin email and a wrong admin password return the same message, so neither can be
probed independently.

Everyone picks a **name** at sign-in. That name is a *profile*: mastery, accuracy and quiz
history are per profile, so your friend answering badly does not wipe out your progress.
The decks themselves are shared. Switch profiles at `/profile`.

The session is a signed, `httpOnly`, `secure` cookie valid for 30 days. `proxy.ts` gates every
route except `/login`. Server actions re-check the session themselves, and every write that
changes course material calls `requireAdmin()` — hiding the buttons is not the boundary.

## Security notes

- **The browser never talks to Supabase.** Every read and write goes through server code
  using the secret key. RLS is enabled with no policies, so the publishable key — and
  anyone who finds the project URL — gets nothing.
- **Passwords are bcrypt hashes** (cost 12) in environment variables. The raw passwords
  are never in the repo or shipped to the client.
- **Sign-in is rate limited** to 10 attempts per 10 minutes per IP. State is per function
  instance rather than global, so it is a speed bump for online guessing, not a lockout —
  see the note in `lib/rateLimit.ts`.
- **A wrong admin email and a wrong admin password return the same message**, so neither
  can be probed independently.
- **The `next=` redirect parameter is checked** to be a relative path, so the login screen
  cannot be used as an open redirect.
- **Search escapes twice.** `.or()` takes a raw PostgREST filter expression, so the term is
  escaped for `ILIKE` and then quoted so it cannot alter the shape of the filter.
- **Security headers** (CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`) are set in `next.config.ts`.

What this deliberately is not: there are no real accounts. Anyone with the shared password
can see every deck, and anyone with the admin password can change them. Profiles separate
progress, not permissions — picking someone else's name shows you their progress. That
tradeoff is the point of the design, not an oversight.

## Importing spreadsheets

`.csv` and `.xlsx`. Columns are detected rather than required in an exact order. All three of
these work out of the box (see [`samples/`](samples)):

**Full** — wrong answers are used as written:

| Question | Choice A | Choice B | Choice C | Choice D | Correct Answer | Explanation | Topic |
|---|---|---|---|---|---|---|---|

**Minimal** — distractors are generated from other answers in the deck:

| Question | Answer |
|---|---|

**Letter answer key** — `Correct` of `B` resolves to the text of `Option B`:

| Prompt | Option A | Option B | Option C | Option D | Correct | Rationale | Chapter |
|---|---|---|---|---|---|---|---|

Recognised header variations include `Question`/`Prompt`/`Question Text`/`Term`,
`Answer`/`Correct Answer`/`Correct`/`Solution`/`Key`, `Choice A`/`Option A`/`Answer A`/`A`,
`Explanation`/`Rationale`, and `Topic`/`Category`/`Chapter`/`Unit`/`Tag`. A title row above the
headers is skipped automatically. Every mapping is overridable in the UI before import, and a
preview reports valid rows, rows missing answers, and possible duplicates.

## Distractors

`generateChoices()` in [`lib/distractors.ts`](lib/distractors.ts) is the single source of truth,
used by both Learn and Quiz:

- If the spreadsheet supplied wrong answers, those are used.
- Otherwise distractors are borrowed from the **correct answers of other questions** —
  same topic first, then anywhere in the deck — preferring answers of a similar length so a
  three-word answer is not sitting next to `25 °C`.
- Never the correct answer twice, never a duplicate string, always reshuffled.
- Generated distractors are **not stored**, so combinations vary between sessions.
- A deck too small for four unique choices studies with fewer rather than erroring.

## Learn mode

`mastery_count` starts at 0, `+1` for each correct answer, resets to **0** on a miss.
A question is mastered at **2**, so it must be answered correctly twice.

A missed question is reinserted **3–7 questions later**, never immediately. The opening queue
is ordered last-answer-wrong → unseen → learning, shuffled within each tier. A deck that is
already fully mastered still builds a session, so "Study again" always works.

`/decks/[id]/learn?ids=a,b,c` studies just those questions — that is what "Review missed" and
"Study missed questions" link to.

## Project layout

```
app/
  login/                     password + profile screen
  (app)/                     everything behind the password
    page.tsx                 home dashboard
    courses/[courseId]/
    decks/[deckId]/          overview, flashcards, learn, quiz, quiz/[attemptId], edit
    import/                  spreadsheet importer
    search/
    profile/
components/                  ui primitives, Nav, DeckCard, MCQOption, ThemeToggle
lib/
  supabase.ts                service-role client (server only)
  auth.ts                    session cookie, requireSession / requireAdmin
  data.ts                    all reads
  actions/                   server actions (auth, content, study, import)
  distractors.ts             generateChoices
  learnAlgorithm.ts          mastery queue
  spreadsheet.ts             parsing + column detection
proxy.ts                     route gate
supabase/schema.sql          the database
samples/                     example spreadsheets
```

## Theming

Dark only, Discord-inspired: `#313338` page, `#2B2D31` cards, blurple for primary actions,
green and red reserved for correct and incorrect.

Every colour is a CSS variable in `app/globals.css` exposed as a Tailwind token —
`bg-surface`, `text-muted`, `bg-accent`, `text-success`, `tint-danger`. No component
hard-codes a hex value, so the palette is swappable from one file.

A light palette is still defined under `:root[data-theme="light"]` but nothing sets that
attribute and no toggle ships. To bring it back: restore a toggle component that sets
`data-theme`, render it in `Nav` and on the login page, and re-add the `prefers-color-scheme`
block in `globals.css`.

## Scripts

| Command | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |
| `npm run hash -- "pw"` | bcrypt hash for the env vars |

## Rotating a password

```bash
npm run hash -- "new password"     # paste the output into SITE_/ADMIN_PASSWORD_HASH
```
Existing sessions stay valid for their 30 days. To invalidate every session immediately,
change `SESSION_SECRET` instead — that signs the cookies, so changing it logs everyone out.
