# Crowns & Centuries

A grand strategy game in the spirit of Crusader Kings, played in the browser on a map of the whole
world. You rule a **country**, not a dynasty: pick any of the 188 realms of 15 September 1066, and
guide it through a thousand years of war, diplomacy, faith and invention until 1 January 2066.

**Play in the browser:** https://danyalkhan95.github.io/Crusader-Kings-Clone/ (GitHub Pages, rebuilt on
every push).

![England on 18 September 1066: Harald Hardrada has just beaten the northern earls at York, and William waits across the Channel](docs/images/england-1066.webp)

## Status

**Milestone 9: foundations for a release.** The game can be played from 1066 to 2066 and beyond,
every other realm run by the AI, and it is on the road to Early Access as a desktop app (milestones
9 to 18 in the [roadmap](docs/ROADMAP.md)). This milestone laid the ground for what follows:

- **A desktop app** for Windows, macOS and Linux: windowed or fullscreen, saves and settings as
  files in your documents folder, and the campaign saved when the window closes. Unsigned test
  builds come from CI; the web version stays as a free demo.
- **Settings:** the size of the interface and its text, map quality, a frame cap, animations, the
  top speed and autosaves, and every key rebindable, shown in the tooltips and in How to play.
- **Saves:** named saves, three autosaves in rotation, a save browser with each realm's arms, date
  and time played, ironman campaigns, and save files to carry a campaign elsewhere.
- **When something breaks,** an error screen stops the clock, keeps the game, and saves a report
  with the error, the log and the campaign.
- **Speed:** a performance overlay (`F3`) and a budget for the simulation that no day breaks in
  worlds of 1340, 1915 and 2030: none above 12 ms, and 99 in 100 under 8 ms.
- **Ready for art and mods:** a pipeline that lists every picture and sound with its source and
  licence, and content in checked data files, starting with the featured realms and the modifiers.

Earlier milestones:

- **The endgame and polish (M8):** the standing of nations and the end of the age in 2066; the
  ledger of nations (`L`) with a chronicle of the thousand years; balance from headless runs of a
  thousand years; How to play (`H`), a guided tour of the first campaign, and sound made on the fly
  with Web Audio.

![The end of the age: on 1 January 2066 the nations of the world are ranked](docs/images/end-2066.webp)

- **Events, decisions and espionage (M7):** some 35 events across the eras, each a choice with
  its costs shown; the Black Death and later pestilences; Halley's comet, the Horde, the
  Reformation, the Crash and world wars; nations to proclaim; spy networks and plots.
- **Navies, exploration and colonisation (M6):** warships by era, sea battles and blockades;
  transports for armies at sea; terra incognita, expeditions and shared maps; colonies and
  colonial nations.
- **Technology and eras (M5):** three tracks of 33 levels over six eras, each level with its
  year in history; arms, buildings and governments that modernise; nationalism and ideologies;
  era themes, banners and national flags.
- **Religion and culture (M4):** other faiths and peoples within the realm; missions, schools and
  accepted cultures; religious policy; heads of faith and holy places; holy wars, crusades and
  jihads, and the Kingdom of Jerusalem; heresies and schisms; the faith map (`Y`).
- **Internal politics (M3):** laws of succession, crown authority, conscription and taxation;
  legitimacy; estates with power, loyalty and privileges; revolts and pretenders; factions of
  vassals; elective, republican and theocratic successions; council tasks; governments;
  procedural portraits.
- **Diplomacy (M2):** opinion with its reasons; alliances, non-aggression pacts, military access
  and guarantees; calls to arms; forged claims; aggressive expansion and coalitions; vassal
  loyalty, integration and tributaries; the diplomacy map (`U`).
- **The first playable (M1):** time with five speeds; an economy of taxes, levies, buildings and
  loans; armies of levies and men-at-arms, battles, sieges and war score; peace deals and
  truces; AI; saves; Hardrada and William in 1066.
- **The world of 1066 (M0):** 3,000 provinces, 498 sea zones and 35 great lakes on hillshaded
  terrain; 188 realms with rulers, lieges and coats of arms; map modes for realms, countries,
  terrain, development, culture and faith.

![Byzantium in 1066 on the faith map: the Orthodox empire, its Miaphysite east, and the holy places it holds and has lost](docs/images/faith-1066.webp)

![August 1343: the Black Death has broken out north of the Black Sea and reached Constantinople, a dark hatch lies over the stricken provinces, and the emperor must choose what to do](docs/images/plague-1343.webp)

The plan, what each milestone brought and the known gaps are in [docs/ROADMAP.md](docs/ROADMAP.md).

## Controls

| Action            | Mouse / touch                            | Keys                        |
| ----------------- | ---------------------------------------- | --------------------------- |
| Pan               | drag                                     | arrow keys                  |
| Zoom              | wheel, pinch, double-click               | `+` / `-`                   |
| Inspect, treat    | click a province, army or coat of arms   |                             |
| What to do there  | right-click a place, or hold a finger    |                             |
| March             | select an army, then right-click a place |                             |
| Sail              | select a fleet, then right-click a sea   |                             |
| Pause, speed      | buttons at the top right                 | `Space`, `1`–`5`            |
| Map modes         | buttons at the bottom right              | `Q` `W` `E` `R` `T` `Y` `U` |
| Armies shown      | the banner after the map modes           |                             |
| Your realm's tabs | coat of arms at the top left             | `I` `G` `A` `C` `J` `F` `D` |
| Technology        | the era at the top                       | `K`                         |
| Ledger of nations | scroll at the top right                  | `L`                         |
| Log of news       | quill at the top right                   | `N`                         |
| Outliner          | on the right                             | `O`                         |
| Capital           |                                          | `Home`                      |
| Next army, fleet  | the outliner                             | `Z`, `X` (`Shift`: back)    |
| How to play       | game menu                                | `H`                         |
| Performance       | settings                                 | `F3`                        |
| Close panel, menu |                                          | `Esc`                       |
| Fullscreen (app)  | settings                                 | `F11`, `Alt+Enter`          |

Every key can be changed in the settings.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/, works from any folder or host
npm run build:demo # the free web demo: the world stops a century on, and it ships no art
```

Checks:

```sh
npm run typecheck && npm run lint && npm test
npm run e2e        # Playwright smoke test (builds and serves the site itself)
npm run mapgen:validate
npm run simulate -- --years 50   # the whole world under AI, headless, with a summary
npm run daycost -- --load save.json   # the performance budget's measure (see M9 in the roadmap)
```

The generated map lives in `public/data` and is committed, so none of the above needs the map
pipeline.

### The desktop app

The same game as an app for Windows, macOS and Linux, built with Electron. It keeps saves and
settings as files in `Documents/Crowns & Centuries`, saves the campaign when its window closes, and
plays in a window or fullscreen (`F11` or `Alt+Enter`, or the settings).

```sh
npm run app        # build, then start the app
npm run app:dist   # build, then package it for this system into release/
xvfb-run -a npx playwright test --project desktop   # its end-to-end test (on Linux, with Xvfb)
```

Unsigned test builds for all three systems come from the **Desktop app** workflow: on `main`, on
version tags, or run by hand from the Actions tab.

## The map pipeline

`tools/mapgen` builds `public/data` from open data:

1. Rasterise the source data onto a 16384×8192 Miller projection.
2. Merge and split modern admin regions into about 3,000 provinces, weighted by population and
   terrain.
3. Grow the sea zones.
4. Vectorise all borders into shared, smoothed arcs.
5. Classify terrain and development, and name everything.
6. Assign the 1066 realms.
7. Render the terrain tiles.

```sh
npm run mapgen:download   # sources into .cache/ (about 1 GB)
npm run mapgen            # all steps (needs about 12 GB of memory, about 10 minutes)
npm run mapgen -- scenario export        # or just some steps
npm run mapgen:validate
```

Hand-curated tables live in `tools/mapgen/curated`:

- realms of 1066, with rulers and overrides
- cultures and faiths
- historical city names
- terrain zones
- sea names

## Project layout

| Path             | What                                                                             |
| ---------------- | -------------------------------------------------------------------------------- |
| `src/render/`    | WebGL2 map: terrain, fills, borders, rivers, labels, picking, camera             |
| `src/sim/`       | The simulation: economy, war, diplomacy, politics, faith, technology, events, AI |
| `src/game/`      | Loading the world, and map modes                                                 |
| `src/heraldry/`  | Coats of arms: blazon model, curated arms, generator, SVG                        |
| `src/ui/`        | React screens, HUD and era themes                                                |
| `src/shared/`    | Code used by both the game and the pipeline (map format, projection, types)      |
| `src/content/`   | Content as checked data files (featured realms, modifiers), ready for mods       |
| `electron/`      | The desktop app: Electron's main process, the bridge to the game, the app icon   |
| `tools/`         | Map pipeline, icons, art assets, artifact packaging                              |
| `tests/`, `e2e/` | Vitest unit tests and Playwright end-to-end tests                                |

## Credits and licences

Crowns & Centuries is free software under the **GNU General Public License v3.0**; see
[LICENSE](LICENSE). It builds on:

| What                                       | Source                                                                                                                   | Licence                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Coastlines, rivers, lakes, regions, places | [Natural Earth](https://www.naturalearthdata.com/)                                                                       | Public domain                   |
| Borders of the world around 1066           | [Historical Basemaps](https://github.com/aourednik/historical-basemaps), André Ourednik et al.                           | GPL-3.0                         |
| Elevation and sea depth                    | [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) (Mapzen; SRTM, GMTED2010, ETOPO1 and others)        | Open data, attribution required |
| Colours of the land                        | [NASA Blue Marble](https://visibleearth.nasa.gov/collection/1484/blue-marble), NASA Earth Observatory                    | Public domain                   |
| Heraldic charges and icons                 | [game-icons.net](https://game-icons.net/), Lorc, Delapouite and contributors                                             | CC BY 3.0                       |
| Typefaces                                  | Grenze Gotisch (Omnibus-Type), Alegreya and Alegreya SC (Huerta Tipográfica), via Fontsource                             | SIL OFL 1.1                     |
| Typefaces of the later eras                | Cinzel, EB Garamond, IM Fell English, Playfair Display, Old Standard TT, Oswald, Source Sans 3 and Inter, via Fontsource | SIL OFL 1.1                     |

Crusader Kings is a trademark of Paradox Interactive. This project is a fan-made homage and is
not affiliated with or endorsed by Paradox.
