# Art and sound

The game's pictures and sounds, as they came, with `manifest.json` saying what each is. `npm run
assets` checks the manifest and builds `public/art` from it: pictures resized to their kind's largest
size and kept as WebP, figures and map symbols packed into an atlas per kind and era, sounds copied,
and `public/art/index.json` for the game. Both are committed; never hand-edit `public/art`.

Every entry needs:

- `id`: lower-case words joined by dots, starting with the kind (`event.tournament`,
  `unit.medieval_europe_cavalry`).
- `file`: the file, under `art/`.
- `kind`: `event`, `scene`, `card`, `title`, `portrait`, `unit`, `symbol`, `frame`, `music`,
  `effect` or `ambience`.
- `era`, `region` and `type` where they apply. The game asks for the most specific fit and gives up
  the region first, then the type, then the era, so an asset without them serves as the fallback.
- `source`: a URL, or where it came from.
- `author`: who made it (for period art, the artist or manuscript and its date).
- `licence`: `Public domain`, `CC0`, `CC BY 3.0`, `CC BY 4.0`, `CC BY-SA 3.0`, `CC BY-SA 4.0`,
  `SIL OFL` or `Generated`. Nothing non-commercial or without derivatives: the game may be sold, and
  pictures are cropped and resized.
- `generated`, for generated assets: `{ "tool": "…", "prompt": "…", "date": "…" }`. The licence is
  then `Generated`, `CC0` or `Public domain`. Stores ask for this.

The credits screen lists every asset from the built index. The web demo can ship without art: the
game draws its own look wherever no asset fits.
