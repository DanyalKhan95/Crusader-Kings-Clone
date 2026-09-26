# Crowns & Centuries

A grand strategy game in the spirit of Crusader Kings, played in the browser on a map of the whole
world. You rule a **country**, not a dynasty: pick any of the 188 realms of 15 September 1066, and
(in later milestones) guide it through a thousand years of war, diplomacy, faith and invention until
1 January 2066.

**Play in the browser:** https://danyalkhan95.github.io/Crusader-Kings-Clone/ (GitHub Pages, rebuilt on
every push).

![Choosing a realm in 1066](docs/images/choose-realm.webp)

## Status

**Milestone 0: the world of 1066.** This milestone covers the map and the realms. The game clock
does not run yet.

- **The map:**
  - 3,000 land provinces, 498 sea zones and 35 great lakes.
  - Hillshaded terrain with rivers.
  - Borders styled by realm, vassal and province.
  - Curved realm names.
- **Map modes:** realms, countries, terrain, development, culture and faith.
- **The world of 1066:**
  - 188 realms, with lieges and vassals and 1066 rulers.
  - Cultures and faiths for every province.
  - A coat of arms for every realm: curated for the major ones, generated for the rest.
- **Screens:**
  - Title screen and a "choose your realm" screen with 14 featured starts. Any realm can be picked
    on the map.
  - Read-only nation and province panels.
- **Look:** a medieval theme. The UI changes with the era in later milestones.

Next up is **Milestone 1: the first playable**, with time, the economy, armies, battles, sieges, war
and peace, and AI. The full plan is in [docs/ROADMAP.md](docs/ROADMAP.md).

## Controls

| Action            | Mouse / touch               | Keys                    |
| ----------------- | --------------------------- | ----------------------- |
| Pan               | drag                        | arrow keys              |
| Zoom              | wheel, pinch, double-click  | `+` / `-`               |
| Inspect           | click a province            |                         |
| Map modes         | buttons at the bottom right | `Q` `W` `E` `R` `T` `Y` |
| Close panel, back |                             | `Esc`                   |

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/, works from any folder or host
```

Checks:

```sh
npm run typecheck && npm run lint && npm test
npm run e2e        # Playwright smoke test (builds and serves the site itself)
npm run mapgen:validate
```

The generated map lives in `public/data` and is committed, so none of the above needs the map
pipeline.

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

| Path             | What                                                                        |
| ---------------- | --------------------------------------------------------------------------- |
| `src/render/`    | WebGL2 map: terrain, fills, borders, rivers, labels, picking, camera        |
| `src/game/`      | Game state and map modes (the simulation grows here from M1)                |
| `src/heraldry/`  | Coats of arms: blazon model, curated arms, generator, SVG                   |
| `src/ui/`        | React screens, HUD and era themes                                           |
| `src/shared/`    | Code used by both the game and the pipeline (map format, projection, types) |
| `tools/`         | Map pipeline, icon extraction, artifact packaging                           |
| `tests/`, `e2e/` | Vitest unit tests and Playwright end-to-end tests                           |

## Credits and licences

Crowns & Centuries is free software under the **GNU General Public License v3.0**; see
[LICENSE](LICENSE). It builds on:

| What                                       | Source                                                                                                            | Licence                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Coastlines, rivers, lakes, regions, places | [Natural Earth](https://www.naturalearthdata.com/)                                                                | Public domain                   |
| Borders of the world around 1066           | [Historical Basemaps](https://github.com/aourednik/historical-basemaps), André Ourednik et al.                    | GPL-3.0                         |
| Elevation and sea depth                    | [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) (Mapzen; SRTM, GMTED2010, ETOPO1 and others) | Open data, attribution required |
| Colours of the land                        | [NASA Blue Marble](https://visibleearth.nasa.gov/collection/1484/blue-marble), NASA Earth Observatory             | Public domain                   |
| Heraldic charges and icons                 | [game-icons.net](https://game-icons.net/), Lorc, Delapouite and contributors                                      | CC BY 3.0                       |
| Typefaces                                  | Grenze Gotisch (Omnibus-Type), Alegreya and Alegreya SC (Huerta Tipográfica), via Fontsource                      | SIL OFL 1.1                     |

Crusader Kings is a trademark of Paradox Interactive. This project is a fan-made homage and is
not affiliated with or endorsed by Paradox.
