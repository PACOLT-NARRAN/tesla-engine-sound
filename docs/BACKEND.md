# Backend proposal (Phase 10) and status

**Status:** Supabase and Paddle are decided (see "Decisions"). Milestone M1 (optional sign-in) is
built but stays OFF until the project's two public build variables are set. Payments, protected
audio, uploads and the online Marketplace are **not** built yet. The app is still a static site on
GitHub Pages and works fully without any account.

Prices were checked in November 2026 on the providers' own pricing pages. They change; re-check
them before deciding.

---

## Shrnutí česky (pro rozhodnutí)

- **Rozhodnuto: Supabase (EU region Frankfurt) + Paddle (místo Stripe) + později malý „audio worker“ s FFmpeg.**
  Aplikace dál běží na GitHub Pages. Backend je jen doplněk: bez přihlášení funguje vše jako dnes.
- **Proč Supabase:**
  - Jedna služba dá přihlášení, databázi (PostgreSQL), úložiště souborů i serverové funkce.
  - Data jsou v klasických SQL tabulkách. Pravidla „kdo co smí“ se píšou přímo do databáze (RLS).
  - Dá se později přestěhovat jinam, protože je to standardní PostgreSQL.
- **Cena na začátku:**
  - Vývoj a testování: 0 Kč (Free plán).
  - Ostrý provoz s platícími lidmi: Pro plán od $25/měsíc. Free projekt se po týdnu nečinnosti uspí.
  - Stripe si bere poplatek z každé platby. Audio worker stojí jednotky dolarů měsíčně.
- **Nejdůležitější bezpečnostní pravidlo:**
  - O tom, co si kdo koupil, rozhoduje jen server.
  - Dnešní přepínače v Developer módu i `earlyAccess` jsou jen lokální a dají se obejít.
  - Placené zvuky proto musí jednou zmizet z veřejné složky `public/audio` a stahovat se přes
    krátkodobé podepsané odkazy.
- **Přihlášení v Tesle:** e-mail s **6místným kódem**, ne odkaz v e-mailu. Odkaz by se otevřel
  v telefonu, ne v autě.
- **Odhad práce:** zhruba 26–38 pracovních dní vývojáře pro vše (viz konec dokumentu). Dá se dělat
  po krocích. První užitečný krok, tedy účty a nákup PRO, je asi 10–15 dní.
- **Co potřebuju od tebe, než se začne:**
  - souhlas s výběrem;
  - kdo bude prodávající (fyzická osoba / firma, DPH);
  - zda prodávat přes Stripe sám, nebo přes „merchant of record“ (viz kapitola Platby).

---

## Decisions (21 November 2026)

| Topic | Decision |
|---|---|
| Provider | **Supabase** (EU region), approved. |
| Seller | The owner, **as a private person (natural person)**, selling **worldwide**. |
| Payments | **Paddle** as merchant of record for now. Paddle is the seller to the customer and handles VAT / sales tax. Moving to Stripe later stays possible: only the checkout call and the webhook adapter change. |
| First milestone | **M1 accounts**, built (see section 16). |

---

## 1. Starting point (what exists today)

| Area | Today | Where |
|---|---|---|
| Hosting | Static build on GitHub Pages, deployed by `.github/workflows/deploy.yml` | — |
| Plan / packs | `resolveEntitlements()`. `PRODUCT.earlyAccess = true` unlocks everything; Developer Mode can simulate FREE / PRO / owned packs. **Local flags, not security.** | `src/entitlements/entitlements.ts` |
| Prices | Display only, `formatPrice()` | `src/entitlements/products.ts`, `src/profiles/packs.ts` |
| Engine audio | Every bank, including PRO and pack engines, is a public file under `public/audio/` (about 30 MB) | `public/audio/` |
| Custom engines, stats, favorites | `localStorage` through `src/storage/storage.ts` only | `src/storage/` |
| Recordings | Analysed in the browser, never uploaded or stored | `src/recording/` |
| Recording backend boundary | Types only: `RecordingBackend`, `ProcessingJob`, `RetentionPolicy`; `RECORDING_BACKEND = null` | `src/recording/contracts.ts` |
| Marketplace boundary | `MarketplaceApi` with `MockMarketplaceApi`; `REMOTE_MARKETPLACE = null` | `src/community/api.ts` |

The backend plugs into these three existing seams:
- `resolveEntitlements`;
- `RecordingBackend`;
- `MarketplaceApi`.

No other module needs to know a server exists.

---

## 2. Requirements the backend must meet

1. **Optional.** Without an account the app keeps working exactly as now: FREE engines, Demo, GPS
   drives and local data.
2. **Server-authoritative ownership.** The plan, packs and paid Marketplace items are decided only
   from verified payment records.
3. **Protected paid audio.** Audio a user has not bought must not be downloadable.
4. **Tesla browser friendly.**
   - No pop-up login windows.
   - No reliance on opening e-mail links on the same device.
   - Short sessions must survive a car restart.
5. **Private by default.**
   - No GPS traces leave the car.
   - Statistics are only sent with explicit opt-in.
   - Recordings are deleted on request.
6. **Small and cheap to start.** One developer, near-zero cost until real users pay.
7. **Heavy audio work off the frontend.** FFmpeg and loop building run on a worker (spec AC).

---

## 3. Options compared

### Option 1 — Supabase

Components: Supabase Auth, PostgreSQL, Supabase Storage, Edge Functions, Stripe.

### Option 2 — Firebase

Components: Firebase Authentication, Firestore, Cloud Storage, Cloud Functions, Stripe.

### Option 3 — Microsoft Azure

Components: Azure Static Web Apps, Microsoft Entra External ID, Azure Functions, Blob Storage,
a database (Azure SQL / Cosmos DB / PostgreSQL Flexible Server), Stripe.

### Comparison

| Criterion | Supabase | Firebase | Azure |
|---|---|---|---|
| **Implementation effort** | Low. One SDK, one dashboard, SQL schema in migrations. | Low–medium. One SDK, but Firestore data modelling and security rules need care for relational data (purchases ↔ items ↔ versions). | High. Several separate services to wire together (identity tenant, Functions app, storage account, database, networking, keys). |
| **Initial operating cost** | Free plan for development. Production on Pro from $25/month, which includes 100,000 monthly active users and 100 GB file storage. | Spark plan is free, but Cloud Functions need the pay-as-you-go Blaze plan (generous free quota, then per use). Near $0 at low volume. | Static Web Apps free tier; Entra External ID free for the first 50,000 MAU. Functions on consumption are near $0. The database is the main fixed cost. |
| **Scaling** | Good. Compute add-ons per project; unlimited API requests. | Very good, automatic. Costs grow per read/write, which is harder to predict. | Very good, but you size and tune each service yourself. |
| **Authentication** | E-mail one-time code (OTP), magic link, OAuth (Google, Apple…). Issues JWTs used directly by database policies. | E-mail link, OAuth, phone. E-mail **code** sign-in needs extra work. | Entra External ID: strong, enterprise-grade, but heavier setup and branding work. |
| **File uploads** | Storage buckets with policies; signed upload and download URLs; resumable uploads. | Cloud Storage with rules; resumable uploads. | Blob Storage with SAS URLs; solid but manual. |
| **Marketplace data** | Relational SQL fits well (authors, items, versions, purchases, reports). Full-text search in Postgres. | Document store; joins and counts must be denormalised by hand. | Any database; you choose and operate it. |
| **Audio-processing jobs** | Edge Functions are short-lived and cannot run FFmpeg. A separate worker container is needed. | Cloud Functions (2nd gen, Cloud Run) **can** run FFmpeg in a container. Best fit here. | Azure Functions / Container Apps jobs can run FFmpeg. Good fit. |
| **Entitlement security** | Row-level security in the database plus server-only writes from the webhook function. | Security rules plus server-only writes. | Implemented in your own Functions code. |
| **Payment webhooks** | Edge Function endpoint verifies the Stripe signature. | Cloud Function endpoint (official Stripe extension exists). | Azure Function endpoint. |
| **GDPR** | EU region (Frankfurt) available; DPA offered. | EU regions available; DPA offered. | EU regions and strongest compliance paperwork. |
| **Data deletion** | One SQL transaction plus bucket deletes; easy to prove. | Must walk documents and sub-collections. | Your own code across services. |
| **Vendor lock-in** | **Lowest.** Standard Postgres; Supabase can be self-hosted. | **Highest.** Firestore data model and rules are proprietary. | Medium. Standard pieces, but glued with Azure-specific services. |
| **GitHub integration** | CLI migrations and function deploys from GitHub Actions; frontend stays on Pages. | CLI deploy from Actions; Hosting could replace Pages but does not have to. | Static Web Apps deploys from GitHub natively, but would replace Pages. |
| **Fit for a small first product** | **Best.** | Good. | Oversized for now. |

---

## 4. Recommendation

**Supabase (EU region) + Stripe Checkout, with one small separate audio worker.**

- **Frontend:**
  - Stays on GitHub Pages.
  - Adds `@supabase/supabase-js` behind the existing seams, loaded lazily so FREE users do not
    download it.
- **Supabase provides:**
  - Auth: e-mail one-time code, optionally Google or Apple later.
  - Postgres: accounts, purchases, entitlements, Marketplace, jobs.
  - Storage: protected audio.
  - Edge Functions: checkout session, Stripe webhook, signed download URLs, upload authorisation.
- **Stripe:** Checkout (hosted payment page) for REVLINE PRO and packs. The webhook is the only
  thing that writes ownership.
- **Audio worker:**
  - A small Docker container with Node + FFmpeg.
  - Runs on a container-job service (for example Google Cloud Run jobs, Fly.io or Azure Container
    Apps jobs).
  - Polls the `processing_jobs` table, so it needs no public endpoint.
  - It is the only part outside Supabase, because Edge Functions cannot run FFmpeg.

Why not the others:
- **Firebase** is the strongest alternative, especially for audio jobs. However, its document model
  is a poor fit for Marketplace and purchase relations, and the lock-in is the highest.
- **Azure** is the most capable and has the best compliance story. However, it costs the most setup
  time for a one-person product. It makes sense later, if REVLINE becomes part of a company with
  Azure in place.

---

## 5. Authentication

- **Sign-in method:**
  - The user types an e-mail address and receives a 6-digit code, which they type in the car.
  - Magic links are not the default, because the e-mail usually opens on the phone, not in the
    Tesla browser.
  - OAuth (Google / Apple) can be added later. It uses a full-page redirect, not a pop-up.
- **Sessions:** a Supabase refresh token is kept through `storage.ts`, the single storage owner.
  Sign-out deletes it.
- **Accounts are optional.** They are needed only to buy, restore purchases on another device,
  publish, report or upload a recording for processing.
- **Shared car.** Several drivers may use one Tesla. Profile → Account shows who is signed in and
  offers sign-out on every screen that spends money.
- **Restore purchases** is simply signing in on the new device; ownership comes from the server.

---

## 6. Data model (Postgres sketch)

All tables have row-level security (RLS) on. "Server only" means that only Edge Functions using the
service key may write.

| Table | Key columns | Who can read | Who can write |
|---|---|---|---|
| `profiles` | `user_id`, `display_name`, `locale`, `created_at` | owner | owner (name, locale) |
| `products` | `sku` (`revline-pro`, `pack-jdm-legends`…), `kind`, `price_cents`, `currency`, `active` | everyone | admin |
| `orders` | `id`, `user_id`, `stripe_session_id`, `status`, `amount_cents`, `created_at` | owner | server only |
| `entitlements` | `user_id`, `sku`, `source` (`purchase`/`grant`/`early-access`), `granted_at`, `revoked_at` | owner | server only |
| `marketplace_authors` | `id`, `user_id`, `name`, `verified` | everyone | owner (name) |
| `marketplace_items` | `id`, `author_id`, `kind`, `title`, `publication_status`, `moderation_status`, `entitlement` | everyone (published), author (own) | author (drafts), moderators |
| `item_versions` | `item_id`, `version`, `format`, `sound_bank_id`, `spec_json`, `audio_path` | as items | author (new version), moderators |
| `item_ratings` | `item_id`, `user_id`, `stars` | aggregate only | owner |
| `reports` | `id`, `item_id`, `reporter_id`, `reason`, `status` | moderators | signed-in users (insert) |
| `recording_uploads` | `id`, `user_id`, `path`, `size`, `mime`, `ownership_confirmed`, `delete_after` | owner | server only |
| `processing_jobs` | `id`, `upload_id`, `state`, `stage`, `progress`, `error`, `profile_id` | owner | worker only |
| `stats_opt_in` | `user_id`, `period`, `drive_minutes`, `engines_tried`, `achievements`… | owner | owner, only if opted in |

These match the existing frontend types:
- `MarketplaceItem`, `EngineVersion` and `MarketplaceEntitlement` in `src/community/models.ts`;
- `ProcessingJob`, `ProcessingJobStatus` and `RetentionPolicy` in `src/recording/contracts.ts`.

---

## 7. Storage

| Bucket | Content | Access |
|---|---|---|
| `engine-free` | FREE engine banks | Can stay on GitHub Pages (`public/audio/`). No change needed. |
| `engine-paid` | PRO engine and pack banks | **Private.** An Edge Function checks `entitlements`, then returns short-lived signed URLs (for example 10 minutes). |
| `recordings-source` | Original user uploads | Private. Deleted after processing according to the retention policy. |
| `recordings-processed` | Opus loops, waveform, metadata | Private to the owner. Public only after a Marketplace publication passes moderation. |
| `marketplace` | Published community engine audio | Public for free items; signed URLs for paid ones. |

**Honest note about today:** PRO and pack audio lives in `public/audio/` and is therefore public.
That is fine during early access, when everything is free. Before the first paid sale, move those
banks to `engine-paid`. `SoundBankLoader` then asks for a signed URL instead of a static path.
Downloaded banks can be cached in the browser after purchase.

---

## 8. Audio processing jobs (spec AC)

1. The browser runs today's local checks (`validateFile`, `analyzeAudio`). Files that fail are
   rejected before any upload.
2. `authorizeUpload()` asks an Edge Function for permission. It checks the user, the plan, a quota
   (for example 5 uploads per day) and the size (≤ 20 MB), then returns a signed upload URL.
3. The browser uploads straight to `recordings-source`.
4. `startJob()` inserts a `processing_jobs` row in state `queued`.
5. The worker claims the job (`SELECT … FOR UPDATE SKIP LOCKED`) and works through these stages:
   - **validating:** `ffprobe` checks the real codec and duration (2–180 s) and rejects disguised
     files;
   - **transcoding:** FFmpeg converts to 48 kHz mono, then to Opus for the browser;
   - **analysing:** loudness (EBU R128 / LUFS), clipping and silence; optional RPM estimate with a
     confidence value;
   - **segmenting:** finds stable steady-tone regions, builds low-load and high-load loops, and
     finds zero-crossing loop points;
   - **building-profile:** writes a sound-bank JSON in the same format as `public/audio/<bank>/`,
     plus the waveform.
6. The browser polls `getJob()` every few seconds and shows the stage and progress.
7. On `succeeded`, the processed engine appears in the Garage as a custom engine (`custom-…` id).
   This reuses the Sound Studio path that community installs already use.
8. Retention:
   - the source file is deleted after N days (proposal: 7);
   - processed assets stay until the user deletes them;
   - `deleteRecording()` removes everything in one step.

This is also the path for the remembered TODO: *"turn my recording into an engine sound that plays
by RPM while driving"*. Part of that can be done locally first (IndexedDB plus in-browser loop
cutting). The worker gives better loops and loudness for longer files.

**Bundle:** FFmpeg never ships to the frontend. The browser only adds a small upload and polling
client.

---

## 9. Marketplace

The remote implementation of `MarketplaceApi` replaces `MockMarketplaceApi`:

- **`list()`:**
  - reads published, non-removed items with their latest compatible version;
  - search uses Postgres full-text search with diacritics folded (unaccent), matching today's
    local behaviour;
  - ratings and download counts become real numbers instead of `null`.
- **`publish()`:**
  - creates an item in `pending` / `in-review` state;
  - the server repeats the validation done by `validatePublication()`;
  - the ownership sentence is required for user recordings.
- **`report()`:** inserts into `reports`. Three open reports hide an item automatically until a
  moderator decides.
- **Moderation:** a simple admin page, or SQL at first. States are already modelled: `pending`,
  `approved`, `rejected`, `removed`.
- **Versioning:** new rows in `item_versions`. The client already compares versions
  (`compareVersions`) and offers updates.
- **Takedown:**
  - removes the item from listings and stops signed downloads;
  - already-installed local copies keep working offline, but no longer update;
  - for a copyright takedown, the next sync can also ask the client to remove the copy.
- **Paid community items** are a later step. They need revenue sharing (Stripe Connect), a seller
  agreement and payouts, which is a large legal and tax topic. Start with free community items only.

---

## 10. Payments (Paddle, decided)

- **Checkout:**
  - Paddle.js opens Paddle Checkout for a Paddle **price id** that the server looks up from the
    product SKU. The client never sends an amount.
  - `customData = { user_id }` links the payment to the REVLINE account.
  - The Tesla browser should use Paddle's full-page or inline checkout rather than a pop-up.
- **Webhook (`paddle-webhook` Edge Function):**
  - Verifies the `Paddle-Signature` header with the webhook secret. Requests without a valid
    signature are rejected.
  - Handles `transaction.completed` by writing `orders` and `entitlements` in one transaction.
  - Is idempotent on the Paddle event id, so duplicate deliveries are harmless.
  - Handles refunds and chargebacks (`adjustment.created` / `adjustment.updated` when approved) by
    setting `revoked_at`.
- **Return:** after checkout the app **re-reads entitlements from the server**. It never trusts a URL
  or a client callback.
- **Product shape:** keep today's model.
  - REVLINE PRO is a one-time lifetime purchase.
  - Packs are separate one-time purchases.
  - No subscriptions at first.
- **Paddle's requirements before it approves the account** (from the Paddle seller handbook):
  - a website with terms and conditions, a refund policy and support contact details;
  - the seller's legal name in the terms (for a private person: full name);
  - the sentence that Paddle.com is the online reseller and Merchant of Record;
  - a domain review; a custom domain (about $10–15 per year) is safer than a `github.io` address;
  - identity verification of the owner (business verification is not required for individuals).
- **Fees:** the public rate is 5% + $0.50 per transaction (check the current rate before launch).
  Chargebacks have a fixed fee.
- **Owner's own obligations stay:** income tax and, in Czechia, most likely a trade licence
  (živnostenský list) for regular sales. Check this with an accountant before the first sale; it is
  not a software question.
- **Later switch to Stripe:** keep the `orders` / `entitlements` tables. Only replace the checkout
  call and the webhook adapter, then handle VAT (EU OSS) yourself or with Stripe Tax.

---

## 11. Entitlement security

Rules:

1. **Only the webhook and admin grants write `entitlements`.** RLS blocks client writes.
2. **The client reads entitlements from the server** after sign-in, checkout or app start. It caches
   them locally for offline drives, with a timestamp.
3. **Paid audio requires a signed URL** issued after an entitlement check. This is what actually
   protects paid content. UI locks only shape the experience.
4. **Early access becomes a server grant** (`source = 'early-access'`) instead of a hard-coded
   frontend flag. It can then be ended per user without a new release.
5. **Developer Mode simulation:**
   - Stays, but only changes the UI.
   - It can never unlock signed downloads.
   - It is hidden in production builds unless `?debug=1` is used, as today.
6. **Offline grace:** cached entitlements stay valid for a defined time (proposal: 30 days) before
   the app asks to reconnect. Audio already downloaded keeps playing.

Frontend change: `resolveEntitlements()` gets one more input, the server entitlement list. Every
component keeps calling the same selectors (`canUseEngine`, `engineLock`, …), so no UI code
changes.

---

## 12. Privacy, GDPR and data deletion

- **Data location:** Supabase region `eu-central-1` (Frankfurt). Sign the Supabase and Stripe Data
  Processing Agreements.
- **Never collected:** GPS positions, routes or speeds.
- **Statistics:** sent only after a separate opt-in, and only the safe categories from spec X (drive
  time, engines tried, achievements, challenges, creations, streaks). There are no speed-based
  rankings.
- **Account deletion (Profile → Delete account):**
  - removes the profile, ratings, reports authored, uploads, processed assets and opt-in stats;
  - keeps orders anonymised for the legal accounting period;
  - is implemented as one Edge Function and is easy to test.
- **Export:** a JSON download of everything stored about the user.
- **Before launch:** privacy policy and terms pages (Czech and English) linked from the app.

---

## 13. How it fits the current build

| Seam | Today | With backend |
|---|---|---|
| `resolveEntitlements()` | local flags | plus the server list, cached via `storage.ts` |
| `SoundBankLoader` | static path | signed URL for `engine-paid` banks |
| `RECORDING_BACKEND` | `null` | `SupabaseRecordingBackend implements RecordingBackend` |
| `REMOTE_MARKETPLACE` | `null` | `SupabaseMarketplaceApi implements MarketplaceApi` |
| Deploy | Pages workflow | unchanged; add a separate job for `supabase db push` and `functions deploy` |

- Configuration: the Supabase URL and the **anon key** are public by design. They go into Vite env
  variables at build time.
- Secrets that must never reach the repository or the frontend:
  - the service-role key;
  - the Stripe secret key;
  - the webhook secret.

  They live in Supabase function secrets and GitHub Actions secrets.

---

## 14. Implementation estimate

Rough developer-days for someone experienced with these tools. With AI help and part-time work the
calendar time is longer, but the order stays the same. Each milestone can ship on its own.

| # | Milestone | Content | Estimate |
|---|---|---|---|
| M0 | Decisions | provider OK, seller identity, Stripe vs merchant of record, privacy texts | owner time |
| M1 | Accounts | Supabase project (EU), e-mail code sign-in, `profiles`, sign-out, account screen, CS/EN | 3–4 days |
| M2 | Purchases | products, Checkout, webhook, `entitlements`, restore, refunds, early-access grant, tests | 5–8 days |
| M3 | Protected audio | `engine-paid` bucket, signed-URL function, `SoundBankLoader` change, cache | 2–3 days |
| M4 | Recording pipeline | upload authorisation, worker container (FFmpeg), jobs, status UI, retention, deletion | 8–12 days |
| M5 | Marketplace (free items) | remote `MarketplaceApi`, publish, moderation queue, reports, ratings | 6–8 days |
| M6 | Privacy and operations | account deletion and export, opt-in stats, monitoring, backups, budget alerts | 2–3 days |

Totals:
- All milestones: about **26–38 developer-days**.
- The first valuable release, M1 + M2 + M3 ("buy PRO and it really unlocks"): about **10–15 days**.

### Running cost estimate (small launch)

| Item | Cost |
|---|---|
| GitHub Pages | $0 |
| Supabase | $0 while developing; Pro from $25/month in production (no auto-pause) |
| Audio worker | about $0–10/month at low volume (scale-to-zero container jobs) |
| Stripe | no monthly fee; a percentage plus a fixed fee per payment (merchant of record: higher percentage, VAT included) |
| Domain (optional) | about $10–15/year |

---

## 15. What happens next

Nothing is built until you approve:

1. the provider (recommended: Supabase + Stripe + worker);
2. the seller and tax setup (Stripe + Stripe Tax, or a merchant of record);
3. which milestone to start with (recommended: M1 → M2 → M3).

Until then the app stays fully static. Every demo stays honest: nothing can be bought, and nothing
is uploaded or sent.

---

## 16. Status

Order of the owner's setup steps (Supabase → domain → e-mail SMTP → legal pages → Paddle) is in
`docs/POSTUP.md` (Czech). Without custom SMTP the Supabase mailer only delivers to members of the
project's team (about 2 e-mails per hour), so public sign-in needs a domain; the app shows
`account.err.not-authorized` for that refusal.

| Milestone | State |
|---|---|
| M1 Accounts | **Built.** `src/backend/` (config, Auth REST client, `AccountService`), Profile → Account, Developer Mode info, tests. Off until the two build variables exist; setup steps in `docs/SETUP-SUPABASE.md`. |
| M2 Purchases (Paddle) | Next. Needs the Paddle account approved and the legal pages. |
| M3–M6 | Not started. |
