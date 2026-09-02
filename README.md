# VoxelCraft Multiplayer Server

This repository contains the multiplayer deployment for VoxelCraft, a browser-based voxel sandbox (not a Vanilla/Paper/Bukkit Minecraft server). The portable local/singleplayer client source is kept in `client/index.html`; `npm start` generates `public/index.html`, a multiplayer-only shell that hides local-world controls and connects to the current server origin.

## Run locally

```bash
npm ci
ADMIN_TOKEN=use-a-long-secret-long-enough SESSION_SECRET=another-long-secret-long-enough npm start
```

The server will listen on `http://localhost:3000`.

- Game: `http://localhost:3000/` — multiplayer-only generated client
- Admin panel: `http://localhost:3000/admin`
- WebSocket: `ws://localhost:3000/ws`

For local development, omitted credentials use a temporary admin token (`change-me`) and an ephemeral session secret. Never expose that configuration publicly. Production requires an explicit `ADMIN_TOKEN` of at least 24 characters and a separate `SESSION_SECRET` of at least 32 characters. The admin API accepts the token only in the `x-admin-token` header, never in a URL.

## LAN

Run the server on the host computer. It binds to `0.0.0.0` by default. Other devices on the same network open:

```text
http://HOST_LAN_IP:3000
```

For example: `http://192.168.1.20:3000`.

## Internet

Run this server on a VPS or a machine with a public route. Put HTTPS and WebSocket TLS in front of it with a reverse proxy, then open the game at a domain such as:

```text
https://game.example.com
```

The client automatically changes the same-origin WebSocket to `wss://game.example.com/ws`.

## Deploy to Render

A ready-to-use `render.yaml` is included in this repository. In Render, create a Blueprint from the repository and select `render.yaml`, or create a Node Web Service with:

```text
Root Directory: .
Build Command: npm ci --omit=dev
Start Command: npm start
Health Check Path: /healthz
```

The Blueprint uses a Persistent Disk at `/var/data` and sets `DATA_DIR=/var/data`, so Accounts, Wallet/Ledger, Spawn Reservations and World JSON survive deploys and restarts. It also generates `SESSION_SECRET` and `ADMIN_TOKEN`. Keep the generated secrets private. A Persistent Disk requires a paid Render service plan. The Blueprint pins Node 22 because the server uses the built-in `node:sqlite` module.

The server binds to `0.0.0.0` and uses Render's `PORT` automatically. The public root serves the generated multiplayer-only client from `public/index.html`; the source client remains in `client/index.html` and is never modified by the build.

Useful environment variables:

```text
PORT=3000
HOST=0.0.0.0
ADMIN_TOKEN=replace-with-a-24-character-minimum-secret
SESSION_SECRET=replace-with-a-separate-32-character-minimum-secret
DATA_DIR=/var/data
WORLD_SEED=18699877
WORLD_NAME=My World
WORLD_MODE=survival
MAX_PLAYERS=20
```

The server stores worlds as independent JSON files in `DATA_DIR/worlds/` (the default world is `main.json`) and autosaves every 30 seconds plus during shutdown. Backups are written to `DATA_DIR/worlds/backups/` when importing or replacing a world.

## Repository and runtime data

The files in `DATA_DIR` are runtime state, not source code. Account databases, wallets, ledgers, spawn reservations, world saves and backups are intentionally ignored by Git. A fresh checkout creates an empty `main` world and the required files on first start. Set `DATA_DIR` to a persistent location in production (the Render Blueprint uses `/var/data`).

Do not commit passwords, password hashes, world saves or production backups. Use the server export/download endpoint and an external backup policy for operational backups. When upgrading an older checkout, copy its runtime files into the configured `DATA_DIR` before starting; do not add them to Git.

The generated browser bundle is `public/index.html`; edit `client/index.html` and run `npm run build` rather than editing the generated file directly.

## Development checks

```bash
npm run build
npm test
```

The test suite uses a temporary data directory and exercises the generated client shell, health endpoint, public API and WebSocket account flow without modifying repository runtime data. It also checks the client/server movement contract, server-authoritative mode/flight handling, and voxel collision implementation. Node.js 22.5.0 or newer is required.

## Client/server movement contract

The server sends `physics` in `hello`, `joined`, `worldState` and `serverMode`. Both sides use the contract’s chunk size, world height, sea level, player dimensions, `stepHeight`, flight ceiling and auto-step flag. The client’s `playerState` message includes `onGround`, `inWater`, `sprint`, `fly` and `jump` in addition to position/orientation and selected block.

The server owns the effective game mode and only accepts flight when the active world is Creative. It derives grounded and water state from the authoritative voxel map, rate-limits state updates, validates horizontal and vertical movement with separate envelopes (including fast falling and diagonal flight), validates jump transitions, tests the direct collision path, and then tests the bounded `stepHeight` path used by the client’s auto-step movement. Client optimistic edits are accepted only when their `oldId` matches the effective server voxel; occupied, missing, unbreakable and invalid blocks are rejected and the client restores its previous state.

Server collision is generated from the same deterministic terrain, cave, ore, vegetation and landmark rules as `client/index.html`, rather than treating every `y <= terrainHeight` cell as solid. Generated water/lava remain non-solid, open doors are non-solid, and player edits override generated blocks. `objectInteractAccepted`, `objectInteractRejected` and `objectState` are handled by the client; NPC property additions are retained in the multiplayer state.

## Multi-world administration

Open `/admin`, enter the `ADMIN_TOKEN`, then use **CREATE AND ACTIVATE** to create a terrain world. Leaving the seed blank generates a random seed; an explicit seed makes the terrain reproducible. The active world selector switches the world for all connected players.

Authenticated API endpoints:

- `GET /api/admin/worlds` — list worlds and the active world id
- `POST /api/admin/world/create` — body: `{ "name": "Hills", "mode": "creative", "seed": 12345, "activate": true }`; `seed` is optional
- `POST /api/admin/world/select` — body: `{ "id": "main" }`

Switching worlds is global in this MVP, not a per-world lobby: connected clients receive the new seed, edits, mode and time, then stream the selected terrain.

## Persistent player database

`database.json` in `DATA_DIR` is the primary durable account/profile database. It contains the Username, password hash/salt, stable Player ID, display name, Wallet and Claim entitlement state. It is written atomically on account creation, login, Wallet/Ledger changes and server shutdown, so restarting the Node process does not create a new Player. `accounts.json` and `players.json` in the same data directory are kept as readable compatibility mirrors and are automatically migrated when the database is first introduced.

The client normally reconnects to the same server origin and uses the same normalized Username and Password. A different server, a different world folder, or a changed `DATA_DIR` is a different database.

## Current account and onboarding protocol

- The first multiplayer login uses `username`, `password` and optional display `name` in the `join` message; Username is 3–24 lowercase letters, digits or `_`, and Password is at least 6 characters. A first successful login creates the account automatically.
- New profiles start with `0 Coin`. The browser never stores the Password. After the first successful login, the server issues a signed, expiring remembered-session token; the multiplayer deployment keeps that token in local browser storage so a later visit needs only `RESUME GAME`. An invalid or expired token returns the Username/Password form.
- The same account cannot hold two live WebSocket sessions. Invalid credentials return `authRejected`; clients must not fall back to anonymous identity authentication.
- Onboarding is intentionally short: login/register → shared Common Spawn Area → choose a free or paid 16×16 Claim → build manually in Creative → analyze → register a Shop/Business, list/sell, or buy a paid Prefab.

## Phase 1 economy foundation

- Username/Password accounts: the client sends a validated Username and Password over the WebSocket on first login; the server stores only a salted PBKDF2 password hash in the persistent `DATA_DIR/database.json` account database, mirrors it to `DATA_DIR/accounts.json`, and maps the account to a durable `u_...` profile, rejects duplicate live sessions, and never stores the password in the browser
- Shared Spawn Area: newly joined players receive server-authoritative spawn slots in the same area, with at least 20 world units between reserved spawn centers; the area expands in rings as it fills
- Spawn reservations persist in `DATA_DIR/spawn-reservations.json` for 24 hours after disconnect, so an offline player’s active reservation still participates in the spacing rule and the same player can reclaim the same slot
- The personal spawn slot is sent in both the `joined` message and the per-player `worldState`; clients use it for initial placement and respawn
- Spawn assignment rejects water, mountain, occupied and invalid positions, and prevents duplicate active identities

## Phase 2 claim foundation

- The connected map opens Claim selection for a player who does not yet own a Claim
- A map click is normalized to a server-side `16×16` grid cell and returns a preview before confirmation
- The first Claim is selected by the player on the map, is exactly `16×16` and free; after that Claim is sold or otherwise released, a new Claim can be selected and purchased when the Wallet has enough Coin
- Claim purchase validation keeps the Common Spawn Area and active Spawn Reservations protected, but does not block water, mountain, steep, Landmark or previously edited Parcels; their location and assets are reflected in the price and later building rules remain server-authoritative
- Claims are stored inside the active world record and synchronized to clients as map overlays; Spawn Area and Claim remain separate

## Phase 3 permissions and claim protection

- Server validates every `blockPlace` and `blockBreak` against the owner Claim or a member with `BUILD`; movement remains unrestricted
- Server validates `doorToggle`, `lightToggle` and `objectInteract` against the owner Claim or a member with `USE`; seeded showcase cabins remain public landmarks
- A Claim owner can send `claimPermissionSet` with `{ "targetPlayerId": "u_...", "build": true, "use": false }`; both flags false removes the member
- The map shows a Claim owner’s online players in a Permission panel with separate `BUILD`, `USE` and `REMOVE` actions
- Claim member permissions are persisted inside the world record and returned only to that Claim owner; public map Claim summaries do not expose the member list
- Unclaimed/private areas reject build, break and private use with `permissionRejected`

## Phase 4 land registry and pricing

- Every land quote is normalized to a server-side `16×16` Parcel grid
- `GET /api/land/quote?x=...&z=...` and the WebSocket `landInspect` message return the official registry record
- Each Parcel reports ownership status, owner, biome, access, traffic, location tier, demand and Coin price
- `Ordinary`, `Prime` and `Premium` tiers use clearly separated location multipliers; the quote remains deterministic and bounded
- Connected clients can use `QUOTE LAND PRICE` / `QUOTE / BUY NEARBY LAND` on the Map even with no Claim and even with a `0 Coin` or insufficient Wallet; the quote card explicitly shows the official price, coordinates, ownership, tier, Biome and pricing factors
- The quote is also the price source for the paid Claim flow: a player with `hasClaimedFree` selects a valid parcel, previews its tier/biome/traffic/access/price, and the server atomically debits Coin on `claimConfirm` before creating the Claim
- Quote access never grants ownership or bypasses payment: an insufficient Wallet is rejected only when `claimConfirm` is sent, while `landInspect` remains read-only

## Phase 5 Game Store and paid Prefabs

- `GET /api/store/catalog` returns the authoritative catalog of 24 paid Prefabs; every price is greater than zero and `allPaid` is true
- Joining clients receive the same catalog through `storeCatalog`
- The client Game Store displays category, Coin price, footprint, height and description; it explicitly has no free Starter Prefab
- `prefabPreview` validates the selected footprint against Claim ownership, `BUILD` permission, terrain, Landmark and existing edits
- `prefabPreview` returns the exact server placement (`x`, `z`, base `y`, rotation and footprint); the client centers the preview near the player and renders a translucent shell, floor, roof and entrance marker inside the Claim. `prefabPlace` debits the Wallet atomically and materializes the paid Prefab; there is no Starter Prefab

## Phase 6 Property Analyzer and Certified Value

- `GET /api/property/analyze?claimId=...` returns a Server-authoritative report for a Claim
- The WebSocket request `{ "type": "propertyAnalyze", "claimId": "..." }` returns `propertyReport`; the owner or a member with `BUILD` may request it
- The report detects floors, roofs, rooms, doors/entrances, paths, building height and material inventory
- It scores amenities including lighting, storage, workspace, access, circulation, furnishing and perimeter
- It evaluates biome, Location Tier, terrain flatness, traffic and demand, then reports separate `landValue`, `buildingValue` and `certifiedValue`
- The report includes a transparent value breakdown, Quality/Usefulness/Originality scores and improvement recommendations
- The analyzer now requires two-dimensional floor/roof evidence and caps incomplete shells or walls below high Quality; high-quality structure depends on a real floor, roof, enclosed room, entrance and useful objects. Complete Property operations use these same gates.

## Phase 7 Wallet and NPC buyback

- Player profiles contain a persistent Wallet with `0 Coin` for new players; wallet state is sent as `walletUpdate`
- `coin-ledger.json` is an append-only server-side ledger for credit and debit transactions
- `GET /api/wallet?playerId=...` returns the wallet balance and the last 20 ledger rows
- A `propertySellNpc` WebSocket request pays exactly `80%` of the current Certified Value; only a complete Property can be sold and empty/incomplete Claims are rejected
- The sale snapshot transfers Land, Building blocks, Objects, and Business License data into `world.npcProperties`
- The player Claim is removed and replaced by a protected `NPC Buyback` Claim at the same coordinates, so ownership is not cloned
- A paid Prefab purchase now requires a valid Wallet balance; the server debits Coin, materializes the Prefab blocks, persists the edits and emits `prefabPlaced`
- Repeated sale, insufficient balance, invalid placement and unpaid purchase attempts are rejected server-side

## Phase 8 Player-to-player Property Market

- `GET /api/market/listings` returns active complete-Property listings
- `GET /api/market/history?limit=...` returns recent settled market history without exposing the private asset snapshot
- `{ "type": "propertyList", "claimId": "...", "premiumPercent": 10 }` lists a complete Property above its Certified Value
- Asking Price is Server-calculated from Certified Value plus a `1%`–`100%` Premium; the marketplace commission is `5%`
- A listed Claim is locked against build, break, private use, permission changes and NPC buyback; the seller can cancel with `propertyUnlist`
- `{ "type": "propertyBuy", "listingId": "..." }` performs one atomic settlement: buyer Escrow debit, seller net credit, system commission and Claim ownership transfer
- The transferred asset includes the Property's Land, Building blocks, Object states and Business License data; the seller no longer owns the Claim
- Each settlement is written to `marketHistory` and the append-only Coin Ledger; repeated, self, stale and underfunded purchases are rejected

## Phase 9 — Business Engine and Property revenue

Business licenses are stored on the complete Property Claim and remain part of the Property asset during both Player Market settlement and NPC Buyback transfer. The first server-defined business types are `Shop`, `Hotel`, `Gallery` and `Workshop`.

### REST

- `GET /api/businesses` — public Business Dashboard snapshots for all registered businesses. It reports license identity, owner, location, traffic, demand, cycle estimate, capacity, reputation, player fee and current status.

### WebSocket messages

- `businesses` — request the current Business Dashboard; the owner receives private lifetime totals and Wallet context.
- `businessRegister` with `{ "claimId": "cl_...", "businessType": "shop|hotel|gallery|workshop", "name": "..." }` — registers a License only on an owned, complete, unlocked Property.
- `businessRegistered` / `businessRegisterRejected` — registration result.
- `businessVisit` with `{ "claimId": "cl_..." }` — attempts a real customer visit. The server validates that the visitor is within 24 blocks of the Property, is not the owner, is within capacity, has passed the 60-second visitor cooldown and can afford the service fee.
- `businessVisitAccepted` / `businessVisitRejected` — visit result. An accepted visit emits `business_customer_payment` and `business_player_income` Ledger rows and updates both Wallets.
- `businessUpdate` — private owner update after a cycle or customer visit.
- `businessCycle` — public cycle summary broadcast.

### Server-authoritative economics

Every Business Cycle uses the Property’s land `Traffic` and `Demand`, the License `Reputation` and `Capacity` to calculate NPC customers and NPC income. The default cycle interval is 30 seconds and can be changed with `BUSINESS_TICK_MS` (minimum 15 seconds). Salary, Maintenance and Advertising are charged from the owner Wallet through `business_operating_cost`; every credit/debit carries the `businessId` in `coin-ledger.json`.

A Wallet is never allowed to become negative. If operating costs cannot be paid, the Business is marked `suspended`, unpaid cost is accumulated, Reputation decreases, NPC revenue stops and real-player visits are rejected. The next cycle retries the cost, allowing the Business to reopen when the owner has enough Coin.

The client exposes **OPEN BUSINESS DASHBOARD** from the Multiplayer menu and a Business License action from the Claim/Property report. The dashboard shows income, costs, Net Income, customers, Reputation, Capacity, Traffic, Demand and status. Business processing is isolated from map generation, combat, enemies, collision, A*, line-of-sight, damage and gameplay objects.

## Phase 10A — NPC Construction Contracts

A complete Property with an open `Workshop` Business License can hire a staged NPC construction team. The server records four roles—`Architect`, `Builder`, `Decorator` and `Inspector`—and never lets the client author the resulting edits.

### REST

- `GET /api/construction/catalog` — returns the available NPC construction plans, Coin prices, footprints and roles.
- `GET /api/construction/jobs` — returns active public construction jobs. The owner-specific WebSocket response includes the owner’s historical jobs and private contract amount.

### WebSocket messages

- `constructionCatalog` — request the plan catalog.
- `constructionJobs` — request the owner’s queue and recent history.
- `constructionPreview` with `{ "claimId": "cl_...", "planId": "workshop_annex|guest_room|gallery_wing", "x": 128, "z": 128 }` — validates Workshop ownership, Business status, terrain, Landmark overlap, Claim footprint and occupied edits without changing the world.
- `constructionOrder` with the same fields — signs the contract, charges the owner Wallet and enqueues the job.
- `constructionOrdered` / `constructionOrderRejected` — order result.
- `constructionCancel` with `{ "jobId": "job_..." }` — owner-only cancellation. Applied NPC edits are rolled back and the paid amount is refunded.
- `constructionCancelled` / `constructionCancelRejected` — cancellation result.
- `constructionJobs` — personalized queue updates after each staged cycle.

The default NPC construction interval is 2 seconds and can be changed with `NPC_CONSTRUCTION_TICK_MS` (minimum 1 second). The default maximum applied edits per interval is 4 and can be changed with `NPC_CONSTRUCTION_EDITS_PER_TICK` (maximum 64). Each job is persisted in `world.constructionJobs` with its plan, placement, stage, edit progress, contract, rollback state and Inspector result.

While a job is queued or active, the Claim is locked against player build, break and private use. Market listing and NPC Buyback are also rejected until the contract is completed or cancelled. Contract debit and refund use `npc_construction_contract` and `npc_construction_refund` Ledger rows, so the Wallet cannot become negative.

The client exposes **BUSINESSES · INCOME** with a visible type/name registration form; no prompt is required. It shows NPC cycle estimates, real-player visits, costs, reputation and lifetime Net income. The client also exposes **NPC CONSTRUCTION** from the Multiplayer menu. Workshop owners can preview a plan, sign the contract and cancel/rollback from the dashboard. The Phase 10B Rentals, Companies, co-ownership and Premium auction dashboards are documented below.


## Phase 10B — Rentals, Company, Co-ownership and Premium Land Auctions

Phase 10B is server-authoritative. Rental contracts, recurring rent, escrow deposits, Company membership, Claim shares, bid holds/refunds and auction settlement are persisted in the active world, player profiles and Coin ledger.

### Rental API

Public snapshots:

- `GET /api/rentals?playerId=...` — open/leased offers and the requesting Player's active/past-due contracts
- `GET /api/companies?playerId=...` — Company membership, invitations and linked Business counts
- `GET /api/land/auctions?playerId=...` — Premium Parcel auctions, current bid, next bid and the requesting Player's held bid

Operations use `POST /api/phase10b/...` with JSON `username` and `password` credentials. An optional `playerId` must match the authenticated account; `playerId` (or `x-player-id`) alone is rejected:

- `/rentals/offer` `{claimId, pricePerCycle, deposit, durationCycles}`
- `/rentals/offer/cancel` `{offerId}`
- `/rentals/accept` `{offerId}`
- `/rentals/cancel` `{contractId}`
- `/company/create` `{name}`; `/company/invite` `{companyId,targetPlayerId}`; `/company/join`/`leave` `{companyId}`
- `/company/attach` `{companyId,claimId}`; `/company/detach` `{claimId}`
- `/co-owner/set` `{claimId,targetPlayerId,share}`; `/co-owner/remove` `{claimId,targetPlayerId}`
- `/auction/bid` `{auctionId,amount}`; `/auction/settle` `{auctionId}`

### WebSocket protocol

- `rentals`, `rentalOfferCreate`, `rentalOfferCancel`, `rentalAccept`, `rentalCancel`
- `companies`, `companyCreate`, `companyInvite`, `companyJoin`, `companyLeave`, `companyAttachBusiness`, `companyDetachBusiness`
- `coOwnerSet`, `coOwnerRemove`
- `landAuctions`, `landAuctionBid`, `landAuctionSettle`

A successful rental acceptance atomically charges Deposit plus the first Rent. Deposit is held as escrow and only Rent is credited to the owner; normal completion or cancellation refunds Deposit to the tenant. Scheduled cycles run every `RENT_TICK_MS` (default 30 seconds; minimum 1 second). Insufficient funds mark the contract `past_due` and do not allow the lease to bypass build/break restrictions.

Claim Co-owners receive full `build` and `use` permission and share real-player and NPC Business income according to their percentages. The primary owner retains control of listing, sale, rental offer, Business registration and co-owner management. Company Owners/Managers can invite members; an owned Business License can be linked with `companyId` and detached later.

The default Premium auctions are at `(128,128)`, `(512,512)` and `(1024,1024)`. The Reserve Price comes from the official Land Registry. Each next bid must be at least 5% or 100 Coin above the current bid. Bid amounts are held in the bidder Wallet, refunded on outbid, and remain held through Settlement; the winner receives a new player Claim at the auction parcel.

The client exposes **OPEN RENTALS**, **OPEN COMPANIES** and **OPEN PREMIUM LAND AUCTIONS** in the Multiplayer menu. Rental, Company, Claim Permission and Auction state are also included in the personalized `worldState` and sent as live update messages.

## Current MVP scope

- Multiple independently saved terrain worlds with server-side active-world selection
- Player names and detailed low-poly remote player models with face, hair, limbs, held block and walk animation
- Position snapshots and player list
- Server collision/teleport validation for submitted player motion, using the same voxel terrain/edit collision map
- Block break/place requests with distance validation
- Server time and Creative/Survival mode controls
- Server ambient snapshots: cows, pigs, sheep, chickens and rabbits by day; hostile red ghosts and bats by night
- Hostile ghosts are grounded two-legged humanoids on the client, approach players with bounded Grid/A* pathfinding, deal damage, reduce the synchronized health bar and trigger a server-controlled respawn
- Hostile navigation treats terrain and saved block edits as solid, rejects moves requiring more than a one-block step or a missing floor, routes around two-block walls and cliff edges, and checks server line-of-sight before applying damage
- Hostile ghosts are removed when the server clock enters daytime; singleplayer mirrors the same grounded movement, pathfinding, line-of-sight and day cleanup locally
- Map Pipeline v3 uses `GET /api/map/tiles?x=0&z=0&radius=96&step=1` (with `/api/map` retained as a protocol alias) to return bounded 64×64 authoritative palette-index terrain tiles, revision/seed/world identity, deterministic vegetation and structure pixels, and cabin overlay markers. The client caches Mini and Full tile windows independently, chooses LOD steps 1/2/4, and never replaces a committed frame with an incomplete or stale response
- Client-side low-poly entity models, movement animation, plus lightweight instanced flowers, grass and mushrooms around active chunks
- Expanded object set: dirt path, wood fence, wooden door, lantern, crate, barrel, sign and bookshelf
- Deterministic micro-cabins with doors, windows, lanterns, chest, table, bookshelf, barrel and path details; identical on clients using the same seed, with a guaranteed showcase cabin near the origin for immediate testing
- Lightweight low-poly props around the terrain: rocks, bushes, lamps, crates, barrels, benches and signs
- Doors and lanterns have synchronized Multiplayer state; right-click or tap a door/lantern to interact, and their state is included in world save/import data
- Decorative props and storage blocks are targetable: crates, barrels and chests open a small supply panel, while benches, signs and street lamps provide contextual interactions; prop interactions are distance-validated by the server in Multiplayer
- Server map responses include cabin markers for the Full Map and Mini-map
- Full Map supports live pan by drag, wheel/pinch zoom from 20% to 800% (using coarser server raster steps when zoomed out), recenter with R, player/remote-player tracking and refreshes around the viewed area instead of behaving as a static image
- Map Pipeline v3 renders only bounded 64×64 palette-index tiles in a CPU Worker (or a bounded main-thread fallback), with no map WebGL geometry or large index buffers. The Worker batches missing tiles, transfers compact one-byte-per-sample buffers, and the Main Thread composites only a fully validated tile set
- The authoritative tile window is rechecked every 12 minutes (within the requested 10–20 minute interval) so newly visible house/structure blocks are picked up even without player movement; ordinary world edits still invalidate affected LOD tiles immediately
- The client uses separate Mini-map and Full Map request/cache state over the same tile contract, zoom-aware LOD steps 1/2/4, revision/seed/world consistency checks, LRU memory bounds, and fixed view radius. Movement can reuse cached tiles without making the map radius or render workload grow with velocity
- Every tile window is assembled in a temporary canvas before atomic snapshot commit. The last good Mini/Full frame remains visible during loading, pan, zoom, stale data, offline mode, Worker failure, or server errors; overlays (claims, players, labels and cabin markers) remain independent from the base raster
- Full Map keeps independent high-detail tile-window state from the Mini-map. Its CPU Worker fallback includes deterministic terrain shading and vegetation, while server tiles add authoritative structure pixels and cabin markers. The Mini-map applies player yaw with a direct CSS transform; it does not create a second rotated raster or expose black corners
- The main character is shown as a fixed directional `YOU` icon on both maps. Map titles, coordinates, compass, `YOU` and remote-player names are real DOM overlays outside the raster, so they remain upright while the Mini-map turns
- The in-world Mini-map rotates the terrain and markers with the local player heading; the YOU marker stays fixed and the Full Map remains north-up
- Mobile-only touch controls: movement joystick, look gesture, menu, map, mode, flight, sprint, up/down, jump, mine, place and inventory
- Chat
- Admin panel with status, active-world selection, random-world creation, mode/time controls, kick, save, download and JSON world import
- The admin import accepts both the server's coordinate-edit JSON and the client's previous `voxelcraft-world` JSON export
- Upload creates a backup before replacing the active world and broadcasts the new world state to connected clients

Remaining hardening scope is server-side inventory and exact base-terrain/block-state validation; movement collision, Claim access, object presence, Wallet transactions and economic operations are already server-checked.
