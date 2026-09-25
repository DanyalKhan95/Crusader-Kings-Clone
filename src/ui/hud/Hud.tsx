import { useEffect, useMemo } from 'react';
import type { IconName } from '../../assets/icons';
import { flyToRealm, selectCountry, toMenu } from '../actions';
import { CoatOfArms } from '../CoatOfArms';
import { formatDate } from '../format';
import { countryStats, useGame } from '../game';
import { Icon } from '../Icon';
import { rulerLine } from '../realm';
import { useStore } from '../store';
import { SidePanel } from './SidePanel';

export function Hud() {
  const game = useGame();
  // Frame the player's realm on arrival; child panels have reported their insets by now.
  useEffect(() => {
    const { player } = game.ui.get();
    if (player) flyToRealm(game, player, 0.4);
  }, [game]);
  return (
    <>
      <NationPlate />
      <DatePlate />
      <SidePanel />
    </>
  );
}

function NationPlate() {
  const game = useGame();
  const player = useStore(game.ui, (s) => s.player);
  const c = game.state.countries[player];
  const stats = useMemo(() => countryStats(game, player), [game, player]);
  if (!c) return null;
  return (
    <header className="panel nation">
      <button className="nation-coa" onClick={() => selectCountry(game, player, true)} aria-label={`Open ${c.name}`}>
        <CoatOfArms country={c} size={50} />
      </button>
      <div className="nation-text">
        <div className="display nation-name">{c.name}</div>
        <div className="nation-ruler">{rulerLine(c)}</div>
      </div>
      <div className="nation-stats">
        <Stat icon="village" label="Provinces" value={stats.provinces} />
        <Stat icon="podium-winner" label="Development" value={stats.development} />
        <Stat icon="crown" label="Vassals" value={stats.vassals.length} />
      </div>
    </header>
  );
}

function Stat({ icon, label, value }: { icon: IconName; label: string; value: number }) {
  return (
    <div className="stat" title={label}>
      <Icon name={icon} />
      <span className="num">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function DatePlate() {
  const game = useGame();
  const d = game.state.date;
  return (
    <div className="panel dateplate">
      <Icon name="hourglass" />
      <span className="date date-long">{formatDate(d)}</span>
      <span className="date date-short">
        {d.d} {SHORT_MONTHS[d.m - 1]} {d.y}
      </span>
      <button className="btn ghost icon-btn" onClick={() => toMenu(game)} aria-label="Main menu" title="Main menu">
        <Icon name="hamburger-menu" />
      </button>
    </div>
  );
}
