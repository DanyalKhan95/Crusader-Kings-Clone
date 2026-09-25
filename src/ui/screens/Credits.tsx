import { useGame } from '../game';
import { Icon } from '../Icon';

const SOURCES: { what: string; who: string; license: string; href: string }[] = [
  {
    what: 'Coastlines, rivers, lakes, regions and place names',
    who: 'Natural Earth',
    license: 'Public domain',
    href: 'https://www.naturalearthdata.com/',
  },
  {
    what: 'Borders of the world around 1066',
    who: 'Historical Basemaps, by André Ourednik and contributors',
    license: 'GPL-3.0',
    href: 'https://github.com/aourednik/historical-basemaps',
  },
  {
    what: 'Elevation and sea depth',
    who: 'Terrain Tiles on AWS (Mapzen): SRTM, GMTED2010, ETOPO1 and others',
    license: 'Open data, with attribution',
    href: 'https://registry.opendata.aws/terrain-tiles/',
  },
  {
    what: 'Colours of the land',
    who: 'NASA Blue Marble, NASA Earth Observatory',
    license: 'Public domain',
    href: 'https://visibleearth.nasa.gov/collection/1484/blue-marble',
  },
  {
    what: 'Heraldic charges and interface icons',
    who: 'game-icons.net, by Lorc, Delapouite and contributors',
    license: 'CC BY 3.0',
    href: 'https://game-icons.net/',
  },
  {
    what: 'Typefaces: Grenze Gotisch, Alegreya and Alegreya SC',
    who: 'Omnibus-Type; Huerta Tipográfica',
    license: 'SIL Open Font License',
    href: 'https://fonts.google.com/specimen/Alegreya',
  },
];

export function Credits() {
  const game = useGame();
  const close = () => game.ui.set({ modal: 'none' });
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="panel modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="btn ghost close" onClick={close} aria-label="Close">
          <Icon name="cross-mark" />
        </button>
        <h2 id="credits-title" className="display modal-title">
          Sources &amp; Credits
        </h2>
        <p className="dim">
          The map is built from open data. Three thousand provinces were cut from modern regions along real terrain,
          then given to the realms of 1066.
        </p>
        <ul className="credits">
          {SOURCES.map((s) => (
            <li key={s.who}>
              <span className="credits-what caps">{s.what}</span>
              <a href={s.href} target="_blank" rel="noreferrer">
                {s.who}
              </a>
              <span className="credits-license">{s.license}</span>
            </li>
          ))}
        </ul>
        <p className="dim small">
          Crowns &amp; Centuries is free software under the GNU General Public License, version 3.
        </p>
      </div>
    </div>
  );
}
