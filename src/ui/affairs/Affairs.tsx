/**
 * The realm's affairs, each on a screen of its own over the map: the realm at a glance, the court,
 * the economy, the military, diplomacy, faith and culture, government and technology. Time runs on
 * behind them, so the date and its controls stay in view above; the tabs and their keys move between
 * the screens, and Esc goes back to the map. The side panel keeps provinces, armies, fleets and other
 * realms.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import type { IconName } from '../../assets/icons';
import { ERAS } from '../../data/eras';
import { eraOf } from '../../sim/tech';
import { closeScreen, openScreen } from '../actions';
import { art } from '../art';
import { CoatOfArms } from '../CoatOfArms';
import { useGame, type RealmScreen } from '../game';
import { Icon } from '../Icon';
import { withKey } from '../keys';
import { useSettings } from '../settings';
import { useStore } from '../store';
import { CourtScreen } from './Court';
import { DiplomacyScreen } from './Diplomacy';
import { EconomyScreen } from './Economy';
import { FaithScreen } from './Faith';
import { GovernmentScreen } from './Government';
import { MilitaryScreen } from './Military';
import { RealmScreen as RealmOverview } from './Realm';
import { TechnologyScreen } from './Technology';

export const SCREENS: { id: RealmScreen; label: string; title: string; icon: IconName }[] = [
  { id: 'realm', label: 'Realm', title: 'The realm', icon: 'crown' },
  { id: 'court', label: 'Court', title: 'The court', icon: 'stone-throne' },
  { id: 'economy', label: 'Economy', title: 'The economy', icon: 'coins-pile' },
  { id: 'military', label: 'Military', title: 'The military', icon: 'crossed-swords' },
  { id: 'diplomacy', label: 'Diplomacy', title: 'Diplomacy', icon: 'shaking-hands' },
  { id: 'faith', label: 'Faith', title: 'Faith and culture', icon: 'church' },
  { id: 'government', label: 'Government', title: 'Government and laws', icon: 'scales' },
  { id: 'technology', label: 'Technology', title: 'Technology', icon: 'graduate-cap' },
];

export function Affairs() {
  const game = useGame();
  const screen = useStore(game.ui, (s) => s.screen);
  const player = useStore(game.ui, (s) => s.player);
  useStore(game.ui, (s) => s.tick);
  useSettings((s) => s.keys);
  const tabs = useRef<HTMLElement>(null);
  // On a narrow screen the tabs scroll: the current one stays in view.
  useEffect(() => {
    tabs.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [screen]);
  const me = game.state.countries[player];
  if (!screen || !me) return null;
  const current = SCREENS.find((s) => s.id === screen)!;
  const era = ERAS[eraOf(me)];
  // The painted frame of the age, when the build has one (milestone 16); else a frame drawn in CSS.
  const frame = art({ kind: 'frame', era: era.id });
  const style = frame ? ({ '--frame-image': `url("${frame.src}")` } as CSSProperties) : undefined;
  return (
    <section className="panel affairs" aria-label={current.title} data-screen={screen}>
      <header className="affairs-head">
        <button className="affairs-arms" onClick={() => openScreen(game, 'realm')} aria-label={me.name}>
          <CoatOfArms country={me} size={42} />
        </button>
        <div className="affairs-title">
          <span className="caps affairs-realm">{me.name}</span>
          <h2 className="display">{current.title}</h2>
        </div>
        <nav className="affairs-tabs" role="tablist" aria-label="The realm’s affairs" ref={tabs}>
          {SCREENS.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === screen}
              className={`affairs-tab ${s.id === screen ? 'active' : ''}`}
              title={withKey(s.title, `screen:${s.id}`)}
              onClick={() => openScreen(game, s.id)}
            >
              <Icon name={s.icon} />
              <span>{s.label}</span>
            </button>
          ))}
        </nav>
        <button
          className="btn ghost close affairs-close"
          onClick={() => closeScreen(game)}
          aria-label="Back to the map"
          title="Back to the map (Esc)"
        >
          <Icon name="cross-mark" />
        </button>
      </header>
      <div className={`affairs-frame ${frame ? 'painted' : ''}`} style={style}>
        <div className="affairs-body" role="tabpanel" aria-label={current.title}>
          {screen === 'realm' && <RealmOverview c={me} />}
          {screen === 'court' && <CourtScreen c={me} />}
          {screen === 'economy' && <EconomyScreen c={me} />}
          {screen === 'military' && <MilitaryScreen c={me} />}
          {screen === 'diplomacy' && <DiplomacyScreen c={me} />}
          {screen === 'faith' && <FaithScreen c={me} />}
          {screen === 'government' && <GovernmentScreen c={me} />}
          {screen === 'technology' && <TechnologyScreen c={me} />}
        </div>
      </div>
    </section>
  );
}
