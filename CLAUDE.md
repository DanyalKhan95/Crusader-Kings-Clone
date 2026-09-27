# Crowns & Centuries: notes for contributors and agents

A Crusader Kings-style grand strategy game in the browser, played as a country, on a map of the
whole world from 1066 to 2066. The plan and progress are in `docs/ROADMAP.md`; keep them current
when a milestone lands.

## Commands

- `npm run dev`: Vite dev server.
- `npm run build`: static site in `dist/` with relative paths (`base: './'`).
- `npm run build:demo`: the free web demo (Vite mode `demo`, `__DEMO__` in the code): the world
  stops on `DEMO_END` (`src/ui/demo.ts`, 15 September 1166) and the art index is empty. Pages and
  the artifact still build the full game.
- `npm run typecheck`: four projects: the app, `tests/` + `e2e/`, `tools/`, and `electron/` (plain
  CommonJS checked through JSDoc).
- `npm run lint`, `npm run format`: ESLint flat config and Prettier at 120 columns.
- `npm test`: Vitest, run against the committed data in `public/data`.
- `npm run e2e`:
  - Playwright 1.56.1, pinned to match the preinstalled Chromium in `/opt/pw-browsers`.
  - Uses SwiftShader WebGL flags.
  - Reuses a server already running on port 4173.
  - Two projects: `web`, and `desktop` (`e2e/desktop.spec.ts`), which starts the Electron app on
    the built `dist/`. It needs a display, so it skips itself on Linux without one: run
    `xvfb-run -a npm run e2e`, or `--project desktop` for it alone.
- `npm run app`: builds and starts the desktop app (`-- --debug-game` exposes `window.game`, since
  Node claims `--debug`). `npm run app:dist` packages it for this system into `release/`.
- `npm run mapgen -- <steps>` and `npm run mapgen:validate`: the map pipeline and its checks.
- `npm run simulate -- --years N [--seed S]`: runs the whole world under AI in Node and prints a
  summary (wars, conquests, debts, speed). Use it for balance changes. `--load` starts from a save,
  `--save` writes the world at the end, and `--profile` adds where the time went and the worst days.
- `npm run daycost -- --load save.json`: the performance budget's measure, each day's fastest time
  over three runs (see M9 in the roadmap). A change meant only for speed should leave the state
  after some years of play identical: hash `JSON.stringify(state)` before and after.
- `npm run artifact`: after a build, writes `dist/artifact.html` and `dist/artifact-files.json` for
  publishing to claude.ai.
- `npm run assets` (`-- --check` to only check): builds `public/art` from `art/manifest.json`.
- `npm run icons`: extracts the game-icons glyphs into `src/assets/icons.ts` and draws the app's
  icon, `electron/build/icon.png`.

## Layout

- **`src/render/`:** the WebGL2 map.
  - Region colours and owners live in 64×64 data textures, so recolouring is a texture upload.
  - Border styles are computed in the vertex shader from owner and liege.
- **`src/ui/map/MapController.ts`:** owns the camera, renderer, labels, picking, input and the frame
  loop. React talks to it through methods and store sync (`MapCanvas.tsx`). Pointer moves never
  re-render React.
  - Unit markers (`render/units.ts`) take a `UnitView`: the layers the player shows
    (`unitLayerOf` in `game/mapModes.ts`, remembered per realm until the day, the diplomacy or the
    wars change), and whether foreign fleets in port show. Below `FAR_ZOOM`, `gather` puts each
    realm's markers close together on screen under one.
  - Realm names fade out between `REALM_FADE_FROM` and `REALM_FADE_TO` (`render/labels.ts`), and
    a faint name leaves its space to the province names.
- **`src/ui/`:** React screens.
  - UI state is a tiny external store (`store.ts`).
  - The game handle is `useGame()`.
  - Panels that cover the map register with `useMapInsets`, so camera framing avoids them.
  - A right-click on the map (a long press on touch) goes to `secondaryClick` (`actions.ts`): it
    orders the selected army or fleet of the player's, or opens the place's menu
    (`hud/ContextMenu.tsx`). `menuFor` works out the menu from the same checks as the panels, so a
    new action there belongs in both, with its reason when it cannot be done.
  - Every key is an action in `keys.ts` (`KEY_ACTIONS`, rebindable in the settings); actions on
    the map are run by `GameRoot`, panning and zoom by `MapController`. Keep default keys unique:
    a test checks it.
- **`src/game/`:** loading the static world (`world.ts`) and map modes.
- **`src/sim/`:** the simulation. Pure TypeScript with no DOM access, and deterministic:
  - Randomness only through `rng.ts`, whose state lives in `GameState.rng`. Never `Math.random`
    or the clock.
  - `GameState` is plain JSON (no classes, maps or sets), so a save is `JSON.stringify`. Bump
    `SAVE_VERSION` in `save.ts` (and `version` in `types.ts`) when the shape changes.
  - `tick.ts` `advanceDay` is the only entry point for time. The player and the AI change the
    state through `commands.ts`, which validate and return `{ ok }` or `{ ok: false, reason }`.
  - The month's business is spread over its first week so that no day carries it all: the
    economy and wars on the 1st (and the courts and the score on 1 January), the court and
    estates on the 2nd, treaties and unrest on the 3rd, faith and world events on the 4th,
    research, maps and colonies on the 5th, events and spies on the 6th, growth on the 7th. Each
    AI realm thinks on its own day (`aiDay`, never the 1st). Tests that need a monthly system
    must advance to its day.
  - Messages for the player go through `log.ts`. What each kind does (a pop-up, a pause, the log
    alone, nothing) is the player's setting, read through `src/ui/messages.ts`; by default
    `important` ones pause the game.
  - Economy numbers, opinions, loyalty and the AI's willingness come as `Breakdown`s, so the UI
    can show where each part comes from. The AI decides with the same breakdowns the player sees.
  - `diplomacy.ts` holds treaties, opinion and memories, claims, aggressive expansion, coalitions
    and subjects; `war.ts` holds casus belli, calls to arms and peace; `realm.ts` holds capitals
    and the end of a country. Treaties belong to independent realms only (vassals have none).
  - `politics.ts` holds laws, legitimacy, estates, council tasks and elections; `revolts.ts`
    holds revolts and vassal factions. Council bonuses go through `taskSkill(seat, task)`, not
    `seatSkill`. Call `invalidatePolitics` after changing laws, privileges or tasks outside the
    functions that do it already.
  - A revolt is a temporary country with `rebel` set; its land returns to the realm when its war
    ends (`endRevolt`). Other realms cannot treat or fight with rebels. Dead rebel slots are
    reused, so a country index may change hands after a year.
  - Faiths, heresies, culture groups and holy sites are looked up through `beliefs.ts`, never
    `world.world.religions` (heresies are not in the map data). `registerBeliefs` runs in
    `makeSimWorld`, `loadWorld` and `createGameState`; code that builds a world another way must
    call it too.
  - `faith.ts` holds province standing (faith and culture), missions and schools, accepted
    cultures, heresies, heads of faith and holy sites; `holywars.ts` holds holy wars, crusades and
    jihads and the founding of the Kingdom of Jerusalem. Great holy wars are data
    (`GREAT_HOLY_WARS` in `src/data/faiths.ts`).
  - Hot lookups are cached per day or per version counter (`strengthOf`, `accessSet`,
    `realmMembers`, the treaty index, `diversity`, army reachability): bump `mapVersion`,
    `borderVersion` or `diploVersion` whenever owners, lieges or treaties change.
  - `routeFor` first asks `canReach` (connected regions an army may enter, cached by border
    version and rights of passage, with and without the sea), so hopeless orders cost nothing.
    Keep new path searches behind it.
  - Technology (`tech.ts`, data in `src/data/techs.ts` and `eras.ts`): three tracks of 33 levels.
    Effects are summed per track in `CUMULATIVE`, so `techEffect(c, key)` is a lookup; add new
    effect keys to `TechEffects` and `EFFECT_TEXT`. Costs follow the historical years (ahead of
    time dearer, behind cheaper, neighbours cheaper); check pacing with long headless runs.
  - Units keep their role (`UnitType`) through the eras; `unitDef(type, era)` gives the name,
    icon and strength for the owner's `militaryEra`. Never read `UNITS[t]` stats for a real army.
  - Buildings have six levels; levels past `FREE_LEVELS`, and every university level, need the
    technology in `TechDef.building` (`maxBuildingLevel`). Development grows towards `devCap`.
  - New governments come from society technology and `reform`; `termYears` sets election terms.
    National revolts (`demand: 'nation'`) turn into new countries when they win.
  - Navies (`naval.ts`, AI in `navalAi.ts`, ships in `src/data/ships.ts`): fleets of warships
    (heavy, light and, from the modern era, submarines) sail the fleet graph of `movement.ts`
    (water zones and coastal ports; `findPath(…, { fleet: true })`). `shipDef(type, era)` gives
    stats and `shipLook(country, type)` the name by era. Transports are a pool on the country
    (`Country.transports`), not ships in fleets: an army may step onto water only if
    `freeTransport` has room for it (`routeFor(…, men)`, the embark check in `dailyMarch`).
    Open-ocean zones need the `ocean` technology effect (cartography).
  - Blockades are worked out once a day (`updateBlockades`) and read with `blockades(state)`, so
    the economy and sieges need no world. Armies at sea next to enemy warships are caught
    (`dailyInterception`).
  - Terra incognita (`exploration.ts`): `Country.known` is a base64 bit set of region ids (`*` for
    the whole world); use `knows`, `learn` and `revealAround`, never the string. Armies and fleets
    reveal what they reach, allies and realms share maps monthly, cartography shares them within a
    faith family each January, and the industrial era knows everything. The map shows the
    player's knowledge (`MapController.setFog`): unknown regions get `FLAG_UNKNOWN` and are drawn
    as parchment after the rivers.
  - Colonies (`colonies.ts`): unowned land settled by colonists (`Country.colonies`, missions of
    months). Native land needs the `colonists` technology effect. Colonies on another landmass in
    a colonial region (by modern country code) pass to a colonial nation: a vassal with
    `colony` set, which cannot be integrated and grows restless once it knows popular
    sovereignty.
  - Modifiers (`modifiers.ts`, data in `src/content/modifiers.json`, typed in
    `src/data/modifiers.ts`): timed effects on a realm, summed with `modifierEffect` and shown in
    breakdowns with `modifierParts`. New effect keys go in `ModifierEffects` and `MODIFIER_TEXT`
    (the schema takes its keys from there). They touch one realm only, so they clear its estate
    figures with `invalidateRealm`, not `invalidatePolitics`.
  - Events (`events.ts`, definitions in `src/data/events.ts`): conditions and AI weights ask an
    `EventContext`, so the data file imports no simulation code; effects are declarative, and
    anything more is a `SpecialId` done in `events.ts`. `monthlyEvents` draws by mean time to
    happen; world events call `fireEvent`. The AI chooses at once; the player's events wait in
    `state.events` and pause the game. `Country.history` holds the last day of each event (and
    `plague:<id>` and `nation:<id>` keys).
  - Pestilence (`plague.ts`, plagues in `PLAGUES`): `ProvinceState.plague` is the day it ends
    there, `immune` the day a new outbreak may take hold, `lost` the development to regrow.
    `provinceFactor` halves a sick province (`PLAGUE_PENALTY`); the map shows `FLAG_PLAGUE`.
  - World events (`worldEvents.ts`): comets, the Horde, the Crash, crises between rival great
    powers (from 1905) and world wars. What has happened is in `state.happened` (a day, or the
    count of world wars).
  - Decisions (`decisions.ts`, nations in `src/data/nations.ts`): proclaiming a nation changes
    the realm's tag. `countryByTag` still finds it by its old tag (`happened['tag:XXX']`); call
    `invalidateTags` after changing a tag. Curated arms and flags are keyed by tag.
  - Espionage (`espionage.ts`, plots in `src/data/espionage.ts`): `Country.spies` holds network
    strength by country index, grown while the spymaster's task is `network` and `spyTarget` is
    set. Plots go through `canPlot` and `carryOut`.
  - The standing of nations (`score.ts`): each New Year every independent realm adds its
    `standing` (a breakdown) to `Country.score`; `ranking` orders them. `state.ledger` keeps the
    great realms every ten years as `[index, realm development, score]` rows, and on
    1 January 2066 (`END_DAY`) the age ends: `happened.end`, then `happened.end_seen` once the
    player plays on.
  - The chronicle (`chronicle.ts`): a short history of great happenings, for the ledger. Write
    realm names with `theName`/`TheName` and verbs with `agree` (plural names such as "the
    Jurchen Tribes"), and use `firstTime` for things worth recording once.
  - Dead characters leave `state.characters` a year after death (`pruneCharacters`, each New
    Year), except the past rulers of living realms that regnal numbers count. Code that keeps a
    character id elsewhere must expect `character()` to return nothing for it.
  - Nothing walks all the characters in a hot path: regnal numbers and the pruning read
    `indexRecords` (past rulers by realm, and the dead), built when a save is read. Record a death
    with `die` or `markDead`, and tell the index when characters change realm (`mergeReigns`,
    `movedRealm`).
  - The month's accounts share each realm's yields, taxes and subjects (`Accounts` in
    `economy.ts`); `income(state, c)` alone works them out afresh.
  - Messages write numbers with `grouped` (`log.ts`), never `toLocaleString`: the first use of
    Intl in a session costs more than a whole day of the world.
- **`src/ui/runner.ts`:** runs the simulation from `MapController.onFrame` within a time budget,
  and bumps the store's `tick` at most every 120 ms. Panels with live numbers subscribe to `tick`.
  It remembers what each day of the month costs and leaves a heavy day for a fresh frame, and
  autosaves at the interval in the settings (an ironman campaign even when they are off).
- **Help, tour and sound:** `dialogs/Help.tsx` is How to play (`H`); `tour.tsx` is the guided tour
  of the player's first campaign (remembered with the preferences; the e2e tests mark it seen in
  `beforeEach`, the desktop test in the settings file), pointing at `data-tour` anchors and HUD
  classes. `audio.ts` makes all sound with Web Audio (no files): effects from `actions.run` and
  the runner's news, and music by era; it starts only after the first touch of the page.
- **`?debug`** in the address exposes the running game as `window.game` (the e2e tests use it to
  open panels without clicking the map).
- **The desktop app (`electron/`):** `main.cjs` serves `dist/` over `app://game/` (never a file
  outside it, with a Content-Security-Policy), minds the window, and keeps saves and settings as
  files; `preload.cjs` is the bridge the page sees as `window.native`.
  - Anything that differs between the browser and the app asks `native` from `src/ui/platform.ts`,
    which is null in a browser: `storage.ts` (saves as gzipped `.ccsave` files beside their
    `.meta.json`), `offerFile` (exports and reports), the window mode and Quit.
  - Settings, sound and the tour go through `prefs.ts`, never `localStorage` directly: one
    `settings.json` in the app, the same keys as before in a browser.
  - Closing the window asks the game to save the campaign it is playing (`saveOnClose`), waiting a
    few seconds at most.
  - `CROWNS_HOME` moves the saves, the settings and the app's own files (the test uses a
    temporary folder); `CROWNS_DEV_URL` loads a dev server instead of `dist/`.
  - Linux containers need `--no-sandbox` for Electron; production never passes it.
- **`src/shared/`:** code shared by the game and `tools/`: map format, projection and data types.
  Tools import `src/` with explicit `.ts` extensions and run under `tsx`; `tools/tsconfig.json` uses
  Bundler resolution so that `tools/simulate.ts` can pull in `src/sim` and `src/data` as they are.
- **`src/heraldry/coa.ts`:** blazon model, curated arms and the generator. Charges come from
  `src/assets/icons.ts`, which is generated by `npm run icons`; don't edit it.
- **`src/heraldry/flag.ts`:** banners and national flags drawn from the arms, by era and
  government. Draw a country's emblem with `<CoatOfArms>` or `emblemSvg`, never `coaSvg` directly.
- **Era themes:** `src/ui/themes/medieval.css` defines every variable; `eras.css` overrides them per
  era under `[data-era]`, which follows the player's era. Fonts ship as files; `npm run artifact`
  inlines them into the artifact's stylesheet (its host only allows fonts from its own CSS), so add
  only the weights a theme uses, Latin subset.

## Content

- Content that mods will one day add to or change lives as JSON in `src/content`, each file checked
  on load against a schema written with `src/shared/schema.ts` and registered with `defineContent`
  (`src/content/registry.ts`). The module in `src/data` that owns it keeps the types, the schema and
  the export the rest of the game uses. So far: the featured realms and the modifiers.
- A system's content moves there when the system is reworked. Events wait for the condition language
  of M15, since their conditions are code today.

## Art and sound

- Every picture and sound is listed in `art/manifest.json` with its source, author, licence and, if
  generated, the tool (`art/README.md`). `npm run assets` refuses anything without them, or under a
  licence the game may not ship (non-commercial, no derivatives). Never hand-edit `public/art`.
- The game asks for art with `art({ kind, era, region, type })` (`src/ui/art.ts`), which gives up
  the region, then the type, then the era, and returns null when nothing fits: the caller then draws
  its own look, as the web demo does with no art at all.
- The credits screen lists every shipped asset from `public/art/index.json`.

## Map data

- `public/data` is generated by `tools/mapgen` and committed. Never hand-edit it: change the
  pipeline or the curated tables in `tools/mapgen/curated/`, then re-run the affected steps.
- The map geometry ships as `map.json`: the gzipped binary map, base64-wrapped, because the
  claude.ai artifact host refuses binary files.
- Step order: `land`, `elevation`, `history`, `realms`, `provinces`, `seas`, `vectorize`,
  `attributes`, `scenario`, `terrain`, `export`.
  - Changing a realm override: `realms scenario export`.
  - Changing provinces: `provinces seas vectorize attributes scenario export`.
  - The province step reads the realm raster, so re-run `realms` first when overrides change.
  - `terrain` depends only on the land and elevation rasters.
- The pipeline is deterministic (no `Math.random`). Keep it that way.
- Downloads go through the environment proxy: `mapgen:download` runs Node with `--use-env-proxy`.
  `raw.githubusercontent.com`, AWS S3 and npm are reachable; naciscdn, jsDelivr and unpkg are not.
- Map units are pixels of the 16384×8192 working raster. `kmPerPxX/Y` in `src/shared/projection.ts`
  convert them to km.

## Conventions

- **TypeScript:** stays on 6.0.x, because typescript-eslint does not support 7 yet.
- **Commits:** end with the attribution lines the environment asks for. Keep model names out of
  code and commits.
- **Delivery:** push to the working branch; GitHub Pages deploys from `deploy.yml`. The claude.ai
  artifact is republished after each milestone from `dist/artifact.html` plus the files listed in
  `dist/artifact-files.json`. `desktop.yml` runs the desktop test on every push and packages the
  app for Windows, macOS and Linux on `main`, on version tags or by hand (unsigned; the macOS
  build is signed ad hoc so that it opens at all).
- **Licence:** the repo is GPL-3.0, because of the historical-basemaps data. Keep the credits in
  the README and in `src/ui/screens/Credits.tsx` in sync with the sources.
