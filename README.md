# Crowns & Centuries

A grand strategy game in the spirit of Crusader Kings, played in the browser on a map of the whole
world. You rule a **country**, not a dynasty: pick any of the 188 realms of 15 September 1066, and
guide it through a thousand years of war, diplomacy, faith and invention until 1 January 2066.

**Play in the browser:** https://danyalkhan95.github.io/Crusader-Kings-Clone/ (GitHub Pages, rebuilt on
every push).

![England on 18 September 1066: Harald Hardrada has just beaten the northern earls at York, and William waits across the Channel](docs/images/england-1066.webp)

## Status

**Milestone 5: technology and eras.** A thousand years of change, from knights and manors to
missiles and global finance. Every other realm is run by the AI.

- **Research:** three tracks (economy, military and society), each of 33 levels across six eras,
  99 technologies in all. Each level has its year in history: it costs more the further it is
  ahead of its time, and less once others know it, above all your neighbours. Scholars, the
  council, the estates and universities set the pace, and a focus favours one track.
- **Arms that modernise:** every arm keeps its role while its weapons change. Spearmen become
  pikemen, then pike and shot, line infantry, infantry and mechanised infantry; knights become
  gendarmes, cuirassiers, then tanks; engines become bombards, artillery and rocket artillery.
  Air wings arrive with military aircraft.
- **An economy that evolves:** buildings gain levels 4 to 6 as technology allows (enclosed
  farms, factories, steam ports, financial centres), universities speed research, and
  development grows towards what the land and the age allow.
- **New forms of government:** absolute and constitutional monarchy, democracy with elections
  every four years, dictatorship and the communist state, taken up by reform.
- **Nationalism and ideologies:** peoples who do not belong rise for a nation of their own and,
  if they win, found one; liberal, socialist and authoritarian regimes trust their own kind and
  distrust the others.
- **Eras you can see:** the interface changes with your era, from Renaissance velvet and baroque
  navy to Victorian green and brass, modern charcoal and a flat contemporary look; coats of arms
  become banners, then national flags.

![France in 1820, in the industrial era, with its scholars on steam, railways and public health](docs/images/technology-1820.webp)

Earlier milestones:

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

Next up is **Milestone 6: navies, exploration and colonisation**. The full plan is in
[docs/ROADMAP.md](docs/ROADMAP.md).

## Controls

| Action            | Mouse / touch                            | Keys                        |
| ----------------- | ---------------------------------------- | --------------------------- |
| Pan               | drag                                     | arrow keys                  |
| Zoom              | wheel, pinch, double-click               | `+` / `-`                   |
| Inspect, treat    | click a province, army or coat of arms   |                             |
| March             | select an army, then right-click a place |                             |
| Pause, speed      | buttons at the top right                 | `Space`, `1`–`5`            |
| Map modes         | buttons at the bottom right              | `Q` `W` `E` `R` `T` `Y` `U` |
| Close panel, menu |                                          | `Esc`                       |

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
npm run simulate -- --years 50   # the whole world under AI, headless, with a summary
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

| Path             | What                                                                             |
| ---------------- | -------------------------------------------------------------------------------- |
| `src/render/`    | WebGL2 map: terrain, fills, borders, rivers, labels, picking, camera             |
| `src/sim/`       | The simulation: economy, armies, war, diplomacy, politics, faith, technology, AI |
| `src/game/`      | Loading the world, and map modes                                                 |
| `src/heraldry/`  | Coats of arms: blazon model, curated arms, generator, SVG                        |
| `src/ui/`        | React screens, HUD and era themes                                                |
| `src/shared/`    | Code used by both the game and the pipeline (map format, projection, types)      |
| `tools/`         | Map pipeline, icon extraction, artifact packaging                                |
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
