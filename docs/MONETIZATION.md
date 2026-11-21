# Monetization experience (Phase 7)

A mock-up of the product model. **Nothing can be bought.** Buy buttons say so; nothing is charged
and nothing unlocks. During early access (`PRODUCT.earlyAccess = true`) everyone has every PRO
feature and every pack.

## Where things live

| What | File |
|---|---|
| Early-access switch, capabilities, all checks (`canUseEngine`, `engineLock`, `effectiveEngine`, `canInstallPack`, `canUseAdvancedOverrun`, …) | `src/entitlements/entitlements.ts` |
| Plan prices and feature lists (the only place with prices) | `src/entitlements/products.ts` |
| Pack definitions and prices | `src/profiles/packs.ts` |
| Which engine is FREE / PRO / in a pack | `TIERS` in `src/profiles/catalog.ts` |
| FREE basic sound model | `src/audio/soundModel.ts` |
| Store screens | `src/components/UpgradePanel.tsx` (opened via `useUpgrade()`) |

Components never compare plans themselves; they call the selectors above or `session.engineLock(id)`.

## Current product decisions (edit freely)

- **FREE engines (9):** FLAT-6 RS (default), JDM HIGH-REV I4, STREET ENGINE, AMERICAN V8 SUPERCHARGED,
  ITALIAN V12 CLASSIC, FRONT-ENGINE V12, ITALIAN V12 SV, GERMAN V8 TWIN TURBO, RACING V8.
- **PRO engines (5):** ITALIAN HYPERCAR V12, V12 TWIN TURBO, HIGH-REV V12, V10 LIGHTWEIGHT, DRAG V8 TWIN-CHARGED.
- **JDM LEGENDS (€3.99):** JDM I6 TWIN TURBO, JDM I6 TURBO, JDM ROTARY TWIN TURBO.
- **ITALIAN EXOTICS (€4.99):** ITALIAN HIGH-REV V10, ITALIAN V12, CLASSIC V8 TWIN TURBO.
- **REVLINE PRO:** €9.99 lifetime. Packs are separate (PRO does not include them; `requiresPro: false`).
- Favorites stay FREE (the spec lists them under PRO; locking them would hurt FREE without selling realism).

## Try before you buy

One rule everywhere: **everything locked can be tried for free — the lock applies only to real GPS drives.**

- Every engine has a Garage PREVIEW.
- A locked engine can be selected. In Demo it plays (notice "Demo preview"). On a GPS drive the
  **fallback** runs — the last engine the user may drive — with a notice and an UNLOCK button.
  The selection is never erased; unlocking makes it run again immediately.
- SPORT / TRACK, manual shifting and the full sound model follow the same rule (Phase 4).
- FREE on GPS plays the basic sound model: no overrun crackle, blow-off, synthesised turbo or
  supercharger layers, softer downshift bark. Demo always plays the full model.
- No countdowns, no blocking screens, no fake ownership.

## Development simulation

Developer Mode (`?debug=1`): plan AUTO / FREE / PRO and "Simulate owned packs" (saved in
`revline.developer.v1`, schema v3). The store shows "Developer simulation" whenever it is active.
These are local flags: they are **not payment security**, and editing localStorage changes what the
UI unlocks. Real ownership must come from a server: see `docs/BACKEND.md` (sections 10–11) for the
proposed Stripe webhook, server entitlements and protected paid audio.
