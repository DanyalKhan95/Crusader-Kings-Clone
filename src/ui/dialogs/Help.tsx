/** How to play: a short reference to every part of the game, by topic, with the keys. */
import { useState, type ReactNode } from 'react';
import type { IconName } from '../../assets/icons';
import { MAP_MODES } from '../../game/mapModes';
import { openEncyclopedia, openSettings } from '../actions';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { SCREEN_KEYS, shortcut, type KeyAction } from '../keys';
import { useStore } from '../store';
import { startTour } from '../tour';
import { Modal } from './Modal';

interface Topic {
  id: string;
  title: string;
  icon: IconName;
  body: ReactNode;
}

const TOPICS: Topic[] = [
  {
    id: 'age',
    title: 'Your realm and the age',
    icon: 'crown',
    body: (
      <>
        <p>
          You rule a country, not a family: a kingdom, an empire, a duchy under a greater crown or a band of tribes,
          from the autumn of 1066 to the first day of 2066. Rulers come and go; the realm is yours throughout.
        </p>
        <p>
          There is no single way to win. Each New Year every independent realm scores for its standing in the world: its
          share of the world’s people and land, its tributaries, its learning against the best of its day, its armies,
          the holy places it holds and its good order. The ledger of nations keeps the tally, and on 1 January 2066 the
          age ends with a final ranking. You may play on after it.
        </p>
        <p>
          Your realm’s affairs have screens of their own, over the map, while time runs on: the realm, the court, the
          economy, the military, diplomacy, faith, government and technology. Open them with the arms at the top left or
          their keys (<Key action="screen:realm" /> <Key action="screen:court" /> <Key action="screen:economy" />{' '}
          <Key action="screen:military" /> <Key action="screen:diplomacy" /> <Key action="screen:faith" />{' '}
          <Key action="screen:government" /> <Key action="screen:technology" />
          ); the side panel shows provinces, armies, fleets and other realms.
        </p>
        <p>
          Every figure in the game can be explained: hover over a number to see the parts it is made of, and the reasons
          a button is closed to you. The encyclopedia (<Key action="encyclopedia" />) sets out every rule with its
          numbers, and underlined words in tooltips lead to it.
        </p>
      </>
    ),
  },
  {
    id: 'map',
    title: 'Time and the map',
    icon: 'hourglass',
    body: (
      <>
        <p>
          The game begins paused. Press <Key action="pause" /> or the play button to let the days run, and{' '}
          <Key action="speed1" /> to <Key action="speed5" /> to set the speed. News that needs you, a war declared on
          you, an offer, an event, pauses the game; lesser news appears at the top and fades. The log{' '}
          <Key action="log" /> keeps it all, to search and sift by kind, and the settings say for each kind of news
          whether it pops up, pauses the game, goes only to the log or is not shown at all.
        </p>
        <p>
          Drag the map to move it and turn the wheel to zoom, or use <Key action="panLeft" /> <Key action="panRight" />{' '}
          <Key action="panUp" /> <Key action="panDown" /> and <Key action="zoomIn" /> <Key action="zoomOut" />. Click a
          province or a realm to see it in the panel; <strong>right-click</strong> it (or hold a finger on it) for what
          you can do there: build and recruit at home, forge a claim, send a gift or declare war abroad, found a colony
          in empty land. Map modes show the world by realm, country, terrain, development, people, faith or, from your
          point of view, friends and foes; the banner beside them chooses whose armies and fleets are shown. Far out, a
          realm&rsquo;s armies close together share one banner, and foreign fleets in port stay out of sight unless they
          are at war with you. Every key can be changed in the settings.
        </p>
        <p>
          On the right, the outliner lists what your realm has in hand: armies and fleets, sieges, wars, buildings going
          up, colonies, missions and spies; a click goes there, and <Key action="nextArmy" /> and{' '}
          <Key action="nextFleet" /> go through your armies and fleets. Above it, alerts show what needs your hand and
          why: a click leads to the remedy, a right-click hides the alert until something changes.
        </p>
        <p>
          Beyond the lands your people know lies unknown country, drawn as bare parchment. Armies and fleets reveal what
          they reach, allies share their maps, and by the industrial age the whole world is known.
        </p>
      </>
    ),
  },
  {
    id: 'treasury',
    title: 'Treasury and land',
    icon: 'coins-pile',
    body: (
      <>
        <p>
          Provinces pay taxes and raise levies by their development. Provinces of another faith or people pay less,
          plague halves them, and an enemy blockade takes a share of a coastal province’s taxes. Laws, the steward, the
          estates, stability and technology raise or lower the whole.
        </p>
        <p>
          Spend gold on buildings (farms, markets, barracks, castles, workshops, ports, universities), six levels each,
          the later ones opened by technology; on developing a province directly; on men-at-arms and ships. When the
          treasury runs dry the realm borrows, and when no one will lend it goes bankrupt. Gold hoarded beyond three
          years of income slowly goes to waste.
        </p>
      </>
    ),
  },
  {
    id: 'war',
    title: 'War and peace',
    icon: 'crossed-swords',
    body: (
      <>
        <p>
          A war needs a cause: a claim on a province, forged by your chancellor or won by inheritance; a claim on a
          crown; a holy war against unbelievers; a coalition; your freedom from a liege. A war of conquest needs no
          cause but costs stability. Declare war from the other realm’s panel; your allies and vassals are called to
          arms.
        </p>
        <p>
          Levies come from your provinces and return home at peace; men-at-arms are paid soldiers kept in reserve. Raise
          your army from the military screen, select it on the map and <strong>right-click</strong> where it should
          march (on a touch screen, tap March and then the place). Battles turn on numbers, the kinds of soldiers, the
          terrain, rivers and the commander; castles must be besieged. Armies need supply, and starve in barren or
          crowded lands.
        </p>
        <p>
          Victories, occupied land and the goal of the war fill the war score. Negotiate peace from the war’s panel:
          provinces, gold or a white peace, as much as the score will bear. A truce follows. Conquest angers the
          neighbours, and too much of it binds them in a coalition against you.
        </p>
      </>
    ),
  },
  {
    id: 'diplomacy',
    title: 'Diplomacy and subjects',
    icon: 'shaking-hands',
    body: (
      <>
        <p>
          Independent realms make alliances, non-aggression pacts, grants of military access and guarantees; each side
          weighs an offer by its opinion of you, its fears and its interests, and says why. Gifts and old services warm
          opinion; broken pacts and plots are remembered.
        </p>
        <p>
          Vassals pay tribute and fight in your wars, and can be integrated in time; tributaries pay tribute but keep
          their own crowns. Disloyal vassals form factions and may fight for their freedom.
        </p>
      </>
    ),
  },
  {
    id: 'crown',
    title: 'Crown, laws and estates',
    icon: 'stone-throne',
    body: (
      <>
        <p>
          Your government decides who rules next: heirs by blood, elections or terms of office. Laws set the succession,
          the crown’s authority, taxation, conscription and religious policy. Stability, from −3 to +3, and the
          legitimacy of the ruler colour everything else.
        </p>
        <p>
          Four estates (the nobles, the clergy, the burghers and the commons) share the power of the realm. Loyal
          estates help; disloyal ones hinder, and a powerful estate pushed too far rises in revolt. The council of five
          (chancellor, marshal, steward, spymaster and chaplain) each takes a task on the court screen.
        </p>
      </>
    ),
  },
  {
    id: 'faith',
    title: 'Faith and culture',
    icon: 'church',
    body: (
      <>
        <p>
          Provinces of another faith or people are less loyal and less useful. Your chaplain can send missionaries to
          convert them and your steward can found schools to teach them your tongue; peoples long in your realm may be
          accepted as your own. Heads of faith bless, and call great holy wars for the holy cities until the age of
          crusades passes.
        </p>
        <p>
          Heresies rise in their time, above all the Reformation of the sixteenth century, which spreads fastest in the
          north. A crown may defend the old faith, embrace the new or let each follow his conscience.
        </p>
      </>
    ),
  },
  {
    id: 'ages',
    title: 'Learning and the ages',
    icon: 'graduate-cap',
    body: (
      <>
        <p>
          Scholars learn in three tracks, economy, military and society, from the medieval age through the renaissance,
          the early modern, the industrial and the modern to the contemporary. Knowledge ahead of its time costs more;
          what neighbours know comes cheaper.
        </p>
        <p>
          Each age brings new soldiers and ships, higher buildings, new forms of government and new ideas: nations that
          want a state of their own, and peoples who want a vote. The interface dresses in the colours of your age, and
          coats of arms give way to flags.
        </p>
      </>
    ),
  },
  {
    id: 'sea',
    title: 'Fleets, explorers and colonies',
    icon: 'galleon',
    body: (
      <>
        <p>
          Warships fight for the seas and blockade enemy ports; transports carry armies over water, and an army at sea
          near enemy warships may be caught. Ocean crossings need cartography.
        </p>
        <p>
          Colonists settle empty land, and native land once your technology allows. Colonies on another continent become
          colonial nations: loyal subjects at first, restless ones once they hear of popular sovereignty.
        </p>
      </>
    ),
  },
  {
    id: 'events',
    title: 'Events, decisions and intrigue',
    icon: 'scroll-quill',
    body: (
      <>
        <p>
          Events come to every realm: famines and good harvests, scholars and schisms, plagues, the Horde, the crash of
          the stock exchanges and wars that draw in the whole world. Each asks you to choose, and shows what each choice
          costs.
        </p>
        <p>
          Decisions let a realm that holds the heartland of a nation proclaim it: Spain, Great Britain, Italy, Germany,
          Russia, the Roman Empire restored. Your spymaster can build a network in a foreign court, then forge claims,
          steal secrets, sabotage, incite revolts or strike at the ruler, at the risk of being traced.
        </p>
      </>
    ),
  },
];

/** The key of an action as bound now. */
function Key({ action }: { action: KeyAction }) {
  const k = shortcut(action);
  return k ? <kbd>{k}</kbd> : <kbd className="unbound">none</kbd>;
}

/** The key table, from the bindings as they are now. */
function keyRows(): [string, string][] {
  const keys = (actions: KeyAction[]) =>
    actions
      .map(shortcut)
      .filter((k) => k)
      .join(' ');
  return [
    [keys(['pause']), 'Pause and resume'],
    [`${shortcut('speed1')} – ${shortcut('speed5')}`, 'Game speed'],
    [
      keys(MAP_MODES.map((m) => `mode:${m.id}` as const)),
      `Map modes: ${MAP_MODES.map((m) => m.label.toLowerCase()).join(', ')}`,
    ],
    [
      keys(SCREEN_KEYS.map((s) => `screen:${s.screen}` as const)),
      'Your realm’s screens: the realm, court, economy, military, diplomacy, faith, government, technology',
    ],
    [keys(['ledger']), 'The ledger of nations'],
    [keys(['log']), 'The log of news'],
    [keys(['outliner']), 'Show or fold the outliner'],
    [keys(['help']), 'How to play'],
    [keys(['encyclopedia']), 'The encyclopedia'],
    ['Esc', 'Close a window or panel; the game menu'],
    [keys(['capital']), 'Go to the capital'],
    [keys(['nextArmy', 'nextFleet']), 'The next army, the next fleet; with Shift, the one before'],
    [keys(['panLeft', 'panRight', 'panUp', 'panDown', 'zoomIn', 'zoomOut']), 'Move and zoom the map'],
    ['Right-click', 'March the selected army or sail the selected fleet; with neither, what can be done there'],
    ['Double-click', 'Zoom in on a place'],
  ];
}

/** How to play, from the title screen or the game menu. */
export function Help() {
  const game = useGame();
  const phase = useStore(game.ui, (s) => s.phase);
  const [topic, setTopic] = useState(TOPICS[0].id);
  const t = TOPICS.find((x) => x.id === topic);
  return (
    <Modal title="How to play" kicker="Crowns & Centuries" wide className="help">
      <div className="help-layout">
        <nav className="help-nav" aria-label="Topics">
          {TOPICS.map((x) => (
            <button
              key={x.id}
              className={`help-topic ${x.id === topic ? 'active' : ''}`}
              aria-current={x.id === topic ? 'true' : undefined}
              onClick={() => setTopic(x.id)}
            >
              <Icon name={x.icon} />
              <span>{x.title}</span>
            </button>
          ))}
          <button
            className={`help-topic ${topic === 'keys' ? 'active' : ''}`}
            aria-current={topic === 'keys' ? 'true' : undefined}
            onClick={() => setTopic('keys')}
          >
            <Icon name="cog" />
            <span>Keys and mouse</span>
          </button>
        </nav>
        <article className="help-body">
          {t ? (
            <>
              <h3 className="section-title">{t.title}</h3>
              {t.body}
            </>
          ) : (
            <>
              <h3 className="section-title">Keys and mouse</h3>
              <table className="help-keys">
                <tbody>
                  {keyRows().map(([k, v]) => (
                    <tr key={k}>
                      <th scope="row">
                        <kbd>{k}</kbd>
                      </th>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="dim small">
                Every key can be changed in the settings.{' '}
                <button className="link" onClick={() => openSettings(game, 'keys')}>
                  Open the settings
                </button>
              </p>
            </>
          )}
        </article>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={() => openEncyclopedia(game)}>
          <Icon name="open-book" /> The encyclopedia
        </button>
        {phase === 'playing' && (
          <button className="btn" onClick={() => startTour(game)}>
            <Icon name="compass" /> Show me around
          </button>
        )}
      </div>
    </Modal>
  );
}
