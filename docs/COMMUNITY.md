# Community (demo Marketplace)

**Garage → COMMUNITY.** Phase 9 of the spec (section I): the Community screens, typed models,
bundled demo content, every UI state and a clean boundary for a future online Marketplace.

## What is real and what is demo

| Thing | In this build |
|---|---|
| Listings (7 engines, 2 packs, 3 authors) | Bundled **demo content** by the REVLINE team, marked DEMO on every card and in a banner |
| Preview | Real: plays the engine with the normal rev sequence |
| Add to Garage / update / remove | Real, on this device: the engine is saved as a Sound Studio engine |
| Favorites, your star rating | Real, stored only on this device (`revline.community.v1`) |
| Public ratings, download counts | **None.** Demo items have `rating: null` and `downloads: null`; the UI says ratings come later |
| Report a problem | The form works, but nothing is sent. The UI says so |
| Publish my engine | Checks are real (description, tags, ownership); publishing is not available and nothing is sent |
| Paid pack | Shows the price; cannot be bought and nothing unlocks it |

## Files

- `src/community/models.ts`: `CommunityEngine`, `CommunityPack`, `MarketplaceAuthor`,
  `RatingSummary`, `MarketplaceEntitlement`, `PublicationStatus`, `ModerationStatus`,
  `EngineVersion`, `InstallationStatus`, `Compatibility`, `compareVersions`.
- `src/community/mockData.ts`: the demo content.
- `src/community/api.ts`: the `MarketplaceApi` interface (`list`, `report`, `publish`),
  `MockMarketplaceApi`, `MarketplaceError`, `queryItems` (search over both languages, tags
  and creators). `REMOTE_MARKETPLACE` is `null`.
- `src/community/install.ts`: `engineState` / `packState` / `itemState`, `toCustomSpec`, the
  local schema, `validatePublication`.
- `src/components/CommunityPanel.tsx`: list, detail sheet, publish sheet.
- `EngineSession`: `communityContext`, `installCommunity`, `uninstallCommunity`,
  `toggleCommunityFavorite`, `rateCommunity`, `previewCommunity`, `setCommunityMock`.
- Tests: `tests/community.test.ts`.

## Install rules

Status is derived each time, never stored:

1. A newer community format than `COMMUNITY_FORMAT`, or a sound bank this build does not have, makes the item **incompatible**.
2. If it is installed (a record exists **and** the engine is still in the Garage), it is either **installed** or **update available** (newer version).
3. Otherwise it is **locked** in three cases:
   - it is paid (`paid`);
   - the plan cannot save own engines, or the item is PRO and the user is not (`pro`);
   - it uses the bank of a locked engine (`bank-locked`).
4. Otherwise it is **not installed**.

A pack follows its engines. A paid pack is locked as a whole, and installing a pack adds every engine that can be added.

Engine ids are `custom-cm<item id without dashes>`. An update overwrites the engine in place, so Favorites and the selection stay. Deleting the engine in the Garage also forgets the install record. Installing does not count as "engine created" in the statistics.

## States and Developer Mode

The Community screen has these states: loading (skeleton cards), error with TRY AGAIN, offline, empty, no search results, empty Installed and empty Favorites.

There is also an offline banner. The demo content is part of the app, so it keeps working without internet.

**Developer Mode → Community mock** switches the mock between NORMAL, SLOW, ERROR, EMPTY and OFFLINE. The setting is not saved.

## Ownership confirmation

The sentence "I created this recording or I have permission to publish and distribute it." is required only when the engine plays the user's own recording (`soundOrigin: 'user-recording'`). Engines using REVLINE sounds do not need it, and the publish sheet says so.

## Future backend (Phase 10)

A live Marketplace implements `MarketplaceApi`. It needs:
- authentication and ownership records;
- publication and moderation states, reports and takedown;
- versioning;
- entitlement checks and download authorisation;
- purchase history.

The backend decides all of these, never the frontend. The concrete proposal (tables, moderation,
takedown, versioning) is in `docs/BACKEND.md`, section 9.
