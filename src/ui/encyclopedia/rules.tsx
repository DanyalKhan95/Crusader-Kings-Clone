/**
 * The rules of the game, written out: every mechanic with the numbers the simulation uses. Numbers
 * that live in the code as constants are read from there, so an entry cannot drift from the rule.
 * Where a campaign is being played, an entry may show the realm's own figures as they stand.
 */
import type { ReactNode } from 'react';
import { BUILDING_ORDER, BUILDINGS, FREE_LEVELS, MAX_LEVEL } from '../../data/buildings';
import { PLAGUE_PENALTY } from '../../data/events';
import { NETWORK_MAX } from '../../data/espionage';
import {
  CONVERSION_SPEED,
  FAITH_PENALTY,
  HOLY_LAND_KM,
  HOLY_WAR_INTERVAL,
  STRIFE,
  TOLERANCE_CLERGY,
} from '../../data/faiths';
import { CROWN_TRIBUTE, LAW_COOLDOWN_YEARS } from '../../data/politics';
import { TRANSPORT_CAPACITY } from '../../data/ships';
import { BASE_RANGE, COLONY_UPKEEP } from '../../sim/colonies';
import { AE_FACTOR, COALITION_AE, loyalty, MEMORY, opinion, REBEL_LOYALTY } from '../../sim/diplomacy';
import {
  expenses,
  IDLE_WASTE,
  IDLE_YEARS,
  income,
  LEVY_PER_DEV,
  levyMultiplier,
  MAX_DEV,
  MAX_LOANS,
  maxManpower,
  REPARATIONS,
  TAX_PER_DEV,
  taxMultiplier,
  TRIBUTARY_TRIBUTE,
} from '../../sim/economy';
import { BLOCKADE_SIEGE, BLOCKADE_TAX } from '../../sim/naval';
import { estateLoyalty, legitimacyTarget } from '../../sim/politics';
import { REVOLT_LOYALTY } from '../../sim/revolts';
import { END_YEAR, standing } from '../../sim/score';
import { GARRISON_PER_FORT } from '../../sim/siege';
import { FOCUS_BONUS, REFORM_YEARS, researchPoints } from '../../sim/tech';
import { ESTATES, type Country } from '../../sim/types';
import {
  BATTLE_CAP,
  BLOCKADE_CAP,
  BLOCKADE_WEIGHT,
  GOAL_CAP,
  GOAL_DECAY,
  GOAL_TAKEN,
  goalScore,
  HOLDOUT_CAP,
  HUMILIATION,
  MAX_MONTHS,
  OCCUPATION_WEIGHT,
  RELEASE_BASE,
  RELEASE_WEIGHT,
  REPARATION_TERMS,
  TERM_COST,
  TRUCE_YEARS,
  VASSAL_SHARE,
} from '../../sim/war';
import type { Game } from '../game';
import { BreakdownList } from '../hud/Tip';
import { estateName } from '../../sim/politics';
import type { Entry } from './model';
import { Term as T } from './Term';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** A rule set out as a line of arithmetic. */
function F({ children }: { children: ReactNode }) {
  return <p className="formula">{children}</p>;
}

/** A small table of two or more columns, the first a label. */
function Table({ head, rows }: { head?: string[]; rows: ReactNode[][] }) {
  return (
    <div className="enc-table-wrap">
      <table className="enc-table">
        {head && (
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {c}
                  </th>
                ) : (
                  <td key={j}>{c}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The player's realm, when a campaign is being played. */
function me(game: Game): Country | undefined {
  const s = game.ui.get();
  return s.phase === 'playing' ? game.state.countries[s.player] : undefined;
}

/** A live figure, only while a campaign is played. */
const live =
  (show: (game: Game, c: Country) => ReactNode) =>
  (game: Game): ReactNode => {
    const c = me(game);
    return c?.alive ? show(game, c) : null;
  };

type Rule = Omit<Entry, 'category' | 'id'> & { id: string };

const REALM = 'The realm';
const ECONOMY = 'Treasury and land';
const MILITARY = 'Armies';
const WAR = 'War and peace';
const DIPLOMACY = 'Diplomacy';
const CROWN = 'Crown and estates';
const FAITH = 'Faith and culture';
const LEARNING = 'Learning';
const SEA = 'The sea and the unknown';
const FORTUNE = 'Fortune and intrigue';

export const RULE_GROUPS = [REALM, ECONOMY, MILITARY, WAR, DIPLOMACY, CROWN, FAITH, LEARNING, SEA, FORTUNE];

const RULES: Rule[] = [
  // ── The realm ───────────────────────────────────────────────────
  {
    id: 'realm',
    group: REALM,
    title: 'Your realm',
    icon: 'crown',
    summary: 'You rule a country, not a family, from 1066 to 2066 and beyond.',
    terms: ['country', 'rank', 'county', 'duchy', 'kingdom', 'empire', 'capital'],
    see: ['rule:standing', 'rule:time', 'rule:subjects', 'rule:characters'],
    body: () => (
      <>
        <p>
          A realm is a country and everything bound to it. Its <strong>rank</strong> (county, duchy, kingdom or empire)
          sets how many peoples it may accept and how its neighbours see it; proclaiming a{' '}
          <T to="rule:decisions">nation</T> can raise it. Its <strong>capital</strong> holds a fort of its own, and when
          it falls the court moves to the richest province left.
        </p>
        <p>
          A realm may have <T to="rule:subjects">vassals</T>, who hold land under it, and tributaries, who pay it. Its
          rulers come and go (<T to="rule:characters">characters</T>), but the realm is yours throughout: if it is
          destroyed, you may take up another.
        </p>
        <p>
          There is no single way to win. Each New Year every independent realm adds its{' '}
          <T to="rule:standing">standing</T> to its score, and on 1 January {END_YEAR} the age ends with a final
          ranking.
        </p>
      </>
    ),
  },
  {
    id: 'time',
    group: REALM,
    title: 'Time and the calendar',
    icon: 'hourglass',
    summary: 'Days pass at five speeds; the month’s business is spread over its first week.',
    terms: ['speed', 'pause', 'month', 'day', 'calendar'],
    see: ['rule:events', 'rule:technology'],
    body: () => (
      <>
        <p>
          The world moves a day at a time. Armies march, battles are fought, sieges advance and buildings rise every
          day; the rest happens once a month, spread over its first week so that no one day carries it all:
        </p>
        <Table
          rows={[
            ['1st', 'Taxes and expenses, levies recovering, war weariness; on 1 January the score of every realm'],
            ['2nd', 'Deaths, stability, legitimacy, the moods of the estates, elections'],
            ['3rd', 'Memories, integration, coalitions, claims, revolts and factions'],
            ['4th', 'Conversion and schools, heresies, pestilence, great holy wars, world events'],
            ['5th', 'Research, shared maps, colonies'],
            ['6th', 'Events and spy networks'],
            ['7th', 'The growth of the land'],
          ]}
        />
        <p>
          Each realm of the AI makes its plans once a month, on a day of its own. The game begins paused; news that
          needs you pauses it again, as the settings for news decide.
        </p>
      </>
    ),
  },
  {
    id: 'standing',
    group: REALM,
    title: 'Standing and the end of the age',
    icon: 'podium-winner',
    summary: 'Each New Year every independent realm scores for its place in the world.',
    terms: ['score', 'ranking', 'ledger', 'victory', 'win', '2066'],
    see: ['rule:realm', 'rule:faith', 'rule:technology'],
    body: () => (
      <>
        <p>On the first day of every year each independent realm adds to its score:</p>
        <Table
          rows={[
            ['Lands and peoples', '1,000 × its share of the development of the whole world (vassals included)'],
            ['Tributaries', '500 × their share of the world’s development'],
            ['Learning', '20 × its average technology level ÷ that of the most learned realm'],
            ['Might', '200 × its share of all the men of the world’s realms'],
            ['Holy places', '2 for each holy place of its faith it holds'],
            ['Good order', 'stability + (legitimacy − 50) ÷ 25'],
          ]}
        />
        <p>
          The ledger of nations (<kbd>L</kbd>) keeps the tally and, every ten years, notes the great realms for its
          chart of the centuries. On 1 January {END_YEAR} the age ends: the ranking is final, and you may play on.
        </p>
      </>
    ),
    live: live((game, c) => <BreakdownList title="Your standing at the next New Year" b={standing(game.state, c)} />),
  },
  {
    id: 'characters',
    group: REALM,
    title: 'Rulers and characters',
    icon: 'meeple-king',
    summary: 'Rulers, heirs, councillors and commanders: five skills, a few traits, and mortal.',
    terms: ['ruler', 'heir', 'skill', 'diplomacy', 'martial', 'stewardship', 'intrigue', 'learning', 'death', 'age'],
    see: ['rule:succession', 'rule:council', 'cat:traits'],
    body: () => (
      <>
        <p>
          Characters have five skills: <strong>diplomacy</strong>, <strong>martial</strong>,{' '}
          <strong>stewardship</strong>, <strong>intrigue</strong> and <strong>learning</strong>, raised or lowered by
          their <T to="cat:traits">traits</T>. The ruler’s skills add to the realm’s figures (stewardship to taxes,
          martial to levies, diplomacy to what others think of you, and each to one track of research); councillors add
          theirs through the <T to="rule:council">council</T>’s tasks, and commanders lead armies and fleets with their
          martial skill.
        </p>
        <p>Every month each character may die, the more likely the older:</p>
        <Table
          head={['Age', 'A year']}
          rows={[
            ['Under 16', '0.6%'],
            ['16 to 39', '1.2%'],
            ['40 to 49', '2.2%'],
            ['50 to 59', '4.5%'],
            ['60 to 69', '9%'],
            ['70 to 79', '16%'],
            ['80 and over', '30%'],
          ]}
        />
        <p>
          Some traits change the odds (the strong live longer, the frail do not). A commander who loses a battle dies in
          it one time in seventeen, a victor one time in a hundred. When the ruler dies, the{' '}
          <T to="rule:succession">succession</T> decides who comes next.
        </p>
      </>
    ),
  },
  {
    id: 'succession',
    group: REALM,
    title: 'Succession',
    icon: 'stone-throne',
    summary: 'Who rules next: the heir, the ablest of the court, or the one the council elects.',
    terms: ['heir', 'election', 'elective', 'hereditary', 'republic', 'theocratic', 'regnal'],
    see: ['law:succession', 'rule:legitimacy', 'rule:characters'],
    body: () => (
      <>
        <p>The succession law of the realm decides who takes the throne when a ruler dies:</p>
        <Table
          head={['Law', 'The next ruler', 'Legitimacy at the start']}
          rows={[
            ['Hereditary', 'The heir', '30 + half the old ruler’s, at most 80'],
            ['Elective', 'The ablest of the heir, the council and the court (the heir has an edge)', '55'],
            ['Republic', 'Elected every eight years (four in a democracy); may be re-elected', '70'],
            ['Theocratic', 'The most learned of the court', '65'],
          ]}
        />
        <p>
          Electors weigh the sum of a candidate’s skills, more learning under a theocracy, more stewardship and
          diplomacy in a republic, and prefer those between 25 and 60. Every new reign but a republic’s costs a point of{' '}
          <T to="rule:stability">stability</T>. A child on the throne lowers legitimacy by 15 until they come of age at
          16. Rulers of the same name are numbered as history numbers them.
        </p>
      </>
    ),
  },

  // ── Treasury and land ───────────────────────────────────────────
  {
    id: 'development',
    group: ECONOMY,
    title: 'Development',
    icon: 'village',
    summary: 'How settled and prosperous a province is: the source of taxes, levies and supply.',
    terms: ['dev', 'growth', 'develop', 'invest', 'province'],
    see: ['rule:taxes', 'rule:levies', 'rule:buildings', 'rule:provinces'],
    body: () => (
      <>
        <p>
          Each point of development yields {TAX_PER_DEV} gold a month in <T to="rule:taxes">taxes</T> and {LEVY_PER_DEV}{' '}
          men for the <T to="rule:levies">levies</T>, before everything else that raises or lowers them. It also feeds
          armies (<T to="rule:supply">supply</T>) and counts towards the realm’s <T to="rule:standing">standing</T>.
        </p>
        <p>
          A province can grow only as far as the land and the age allow: its development of 1066, raised by 5% for each
          level of the owner’s economic technology, plus one, and never above {MAX_DEV}.
        </p>
        <F>cap = development of 1066 × (1 + 0.05 × economy level) + 1</F>
        <p>On the 7th of each month, every province below its cap may grow by a point. The chance is</p>
        <F>
          0.25% × (½ below stability 0) × (1 + 5% per point of the steward’s stewardship, when developing the land) × (1
          + the commons’ goodwill × 10%) × (1 + technology and modifiers) × (1 − development ÷ cap) × (1 + the
          province’s buildings)
        </F>
        <p>
          Farmland and workshops raise the last part. Gold can also be spent to develop a province at once, a point at a
          time; it costs more the more developed it is, and in later eras:
        </p>
        <F>cost = 20 × (1 + development ÷ 4) × (1 + ½ × era) gold</F>
        <p>Pestilence takes development away, and it grows back slowly once the sickness has passed.</p>
      </>
    ),
  },
  {
    id: 'provinces',
    group: ECONOMY,
    title: 'Provinces of other faiths and peoples',
    icon: 'meeple-group',
    summary: 'A province of another faith or people pays and serves less, by the realm’s policy.',
    terms: ['province factor', 'unbelievers', 'foreign', 'kindred', 'culture', 'faith', 'withheld'],
    see: ['rule:faith', 'rule:culture', 'law:tolerance', 'rule:plague'],
    body: () => (
      <>
        <p>
          The taxes and levies of each province are cut when its people do not share the ruler’s{' '}
          <T to="rule:faith">faith</T> or <T to="rule:culture">culture</T>. The faith’s share depends on the realm’s{' '}
          <T to="law:tolerance">religious policy</T>:
        </p>
        <Table
          head={['', 'Persecution', 'Established church', 'Tolerance']}
          rows={[
            ['A sister faith', ...FAITH_PENALTY.map((p) => `−${pct(p[0])}`)],
            ['Another family of faiths', ...FAITH_PENALTY.map((p) => `−${pct(p[1])}`)],
          ]}
        />
        <p>
          A kindred people (of the same culture group) withholds 5%, a foreign people 15%, and 25% once the realm thinks
          of itself as a nation (the age of nationalism, in the society track). Your own people and the cultures you
          have accepted withhold nothing. A province struck by pestilence pays and serves {pct(PLAGUE_PENALTY)} less
          while the sickness rages. The cuts add up, and a province never pays less than nothing.
        </p>
      </>
    ),
  },
  {
    id: 'taxes',
    group: ECONOMY,
    title: 'Taxes and income',
    icon: 'coins-pile',
    summary: 'What each province pays, what the realm’s laws and people make of it, and tribute.',
    terms: ['income', 'gold', 'tax', 'tribute', 'treasury'],
    see: ['rule:development', 'rule:provinces', 'rule:expenses', 'law:taxation', 'rule:subjects'],
    body: () => (
      <>
        <p>Each month every province the realm holds and controls pays</p>
        <F>
          development × {TAX_PER_DEV} × (1 + its buildings) × its <T to="rule:provinces">faith and people</T>
        </F>
        <p>
          less {pct(BLOCKADE_TAX)} where an enemy fleet <T to="rule:blockades">blockades</T> the coast. The sum is then
          multiplied by the realm’s tax rate (never below 30%), made of:
        </p>
        <Table
          rows={[
            ['Taxation law', '×0.8, ×1, ×1.2 or ×1.4'],
            ['Conscription law', 'heavy −5%, total −10%'],
            ['Government', 'from −30% (a horde) to +20% (a merchant republic or a democracy)'],
            ['The ruler', '+1% per point of stewardship'],
            ['The steward', '+1.5% per point of stewardship, when collecting taxes'],
            ['The burghers', 'up to ±10%, by their loyalty and power'],
            ['Stability', '+5% per point, −5% per point below zero'],
            ['War weariness', '−1% per point'],
            ['Technology and modifiers', 'as they come'],
            ['Privileges', '−5% for each of the nobles, clergy and burghers who hold them'],
          ]}
        />
        <p>
          Vassals pay their liege a share of their own taxes set by the liege’s <T to="law:crown">crown authority</T> (
          {CROWN_TRIBUTE.map(pct).join(', ')}); tributaries pay {pct(TRIBUTARY_TRIBUTE)}. No tribute is paid while they
          are at war with their lord.
        </p>
      </>
    ),
    live: live((game, c) => (
      <>
        <BreakdownList title="Your tax rate" b={taxMultiplier(game.state, c)} percent />
        <BreakdownList title="Your income a month" b={income(game.state, c)} />
      </>
    )),
  },
  {
    id: 'expenses',
    group: ECONOMY,
    title: 'Expenses',
    icon: 'receive-money',
    summary: 'Soldiers, ships, interest on loans, and the waste of an idle treasury.',
    terms: ['upkeep', 'costs', 'maintenance', 'waste', 'hoard'],
    see: ['rule:men-at-arms', 'rule:levies', 'rule:loans', 'rule:transports'],
    body: () => (
      <>
        <p>Each month the treasury pays for:</p>
        <Table
          rows={[
            ['Men-at-arms in the field', 'their upkeep, by arm and era'],
            ['Men-at-arms at home', 'a smaller upkeep, by arm and era'],
            ['Raised levies', '0.05 gold per hundred men in the field'],
            ['Warships', 'by role and era'],
            ['Transports', 'by era'],
            ['Interest on loans', 'a twelfth of the yearly interest of each'],
            ['An idle treasury', `${pct(IDLE_WASTE)} a month of the gold beyond ${IDLE_YEARS} years of income`],
          ]}
        />
        <p>
          Technology lowers the upkeep of men-at-arms. Gold far beyond any need is lost to idle courtiers and
          embezzlement: spend it on <T to="rule:buildings">buildings</T>, <T to="rule:development">development</T> or
          soldiers.
        </p>
      </>
    ),
    live: live((game, c) => <BreakdownList title="Your expenses a month" b={expenses(game.state, c)} />),
  },
  {
    id: 'loans',
    group: ECONOMY,
    title: 'Loans and bankruptcy',
    icon: 'bank',
    summary: 'An empty treasury borrows; when no one will lend, the realm goes bankrupt.',
    terms: ['loan', 'debt', 'interest', 'bankrupt', 'borrow'],
    see: ['rule:expenses', 'rule:stability'],
    body: () => (
      <>
        <p>
          A realm may borrow eight months of its income (at least 50 gold) at 12% a year, less with banking technology
          (down to 3.6%). When the treasury falls below zero at the month’s reckoning, it borrows by itself. It can owe
          at most {MAX_LOANS} loans.
        </p>
        <p>When no one will lend any more, the realm is bankrupt:</p>
        <ul>
          <li>its debts are repudiated and the treasury starts again at nothing;</li>
          <li>
            <T to="rule:stability">stability</T> falls by 2;
          </li>
          <li>half its men-at-arms, at home and in the field, desert, and half its warships and transports.</li>
        </ul>
        <p>Loans can be repaid in full whenever the treasury holds their amount.</p>
      </>
    ),
  },
  {
    id: 'buildings',
    group: ECONOMY,
    title: 'Buildings',
    icon: 'castle',
    summary: `Seven kinds, ${MAX_LEVEL} levels each; the first ${FREE_LEVELS} open to all, the rest by technology.`,
    terms: ['build', 'construction', 'farms', 'market', 'castle', 'university', 'port', 'workshop', 'barracks'],
    see: ['cat:buildings', 'rule:development', 'rule:technology'],
    body: () => (
      <>
        <p>
          A province builds one thing at a time. Each kind of building has {MAX_LEVEL} levels: any realm may build the
          first {FREE_LEVELS}, the later ones (and every level of the university) need a technology. Each level costs
          more and takes longer than the one before:
        </p>
        <Table
          head={['Level', '1', '2', '3', '4', '5', '6']}
          rows={[
            ['Cost', '×1', '×2', '×3.5', '×5.5', '×8', '×11'],
            ['Time', '×1', '×1.3', '×1.6', '×1.8', '×2', '×2.2'],
          ]}
        />
        <p>Each level adds its effects again:</p>
        <Table
          head={['Building', 'Each level', 'Level 1']}
          rows={BUILDING_ORDER.map((t) => {
            const b = BUILDINGS[t];
            const e = b.effects;
            const bits = [
              e.tax && `taxes +${pct(e.tax)}`,
              e.levy && `levies +${pct(e.levy)}`,
              e.growth && `growth +${pct(e.growth)}`,
              e.supply && `supply +${pct(e.supply)}`,
              e.fort && `${e.fort} fort level`,
              e.research && 'research points',
            ].filter(Boolean);
            return [
              <T key={t} to={`building:${t}`}>
                {b.name}
              </T>,
              bits.join(', '),
              `${b.cost} gold, ${b.days} days`,
            ];
          })}
        />
        <p>
          Markets strengthen the burghers and castles the nobles among the <T to="rule:estates">estates</T>. Ports need
          a coast, workshops a province of development 5 or more, and universities 8 or more.
        </p>
      </>
    ),
  },

  // ── Armies ──────────────────────────────────────────────────────
  {
    id: 'levies',
    group: MILITARY,
    title: 'Levies',
    icon: 'meeple-group',
    summary: 'Men called up from the provinces: many, cheap and fragile, and slow to replace.',
    terms: ['manpower', 'levy', 'raise', 'conscription', 'militia', 'conscripts'],
    see: ['rule:men-at-arms', 'law:conscription', 'rule:development', 'unit:levy'],
    body: () => (
      <>
        <p>Each province gives the realm’s pool of levies</p>
        <F>
          development × {LEVY_PER_DEV} × (1 + its buildings) × its <T to="rule:provinces">faith and people</T>
        </F>
        <p>and the whole is multiplied by the realm’s levy rate:</p>
        <Table
          rows={[
            ['Conscription law', '×0.75, ×1, ×1.3 or ×1.6'],
            ['Government', 'from −20% (a merchant republic) to +30% (a horde)'],
            ['The ruler', '+1% per point of martial skill'],
            ['The marshal', '+1.5% per point of martial skill, when mustering the levies'],
            ['The nobility', 'up to ±10%, by their loyalty and power'],
            ['Stability', '+3% per point'],
            ['Technology and modifiers', 'as they come'],
            ['Common rights', '−10% while the commons hold their privilege'],
          ]}
        />
        <p>
          Levies spent in war come back at a tenth of the full pool a month (more when the commons are content). Raising
          the army gathers the levies and the <T to="rule:men-at-arms">men-at-arms</T> at the capital; raised levies
          cost 0.05 gold a month per hundred men, and go home when the army is disbanded.
        </p>
      </>
    ),
    live: live((game, c) => (
      <>
        <BreakdownList title="Your levy rate" b={levyMultiplier(game.state, c)} percent />
        <BreakdownList title="Your levies when fully rested" b={maxManpower(game.state, c)} digits={0} unit=" men" />
      </>
    )),
  },
  {
    id: 'men-at-arms',
    group: MILITARY,
    title: 'Men-at-arms',
    icon: 'swordman',
    summary: 'Paid soldiers recruited by the regiment and kept at home until the army is raised.',
    terms: ['regiment', 'recruit', 'reserve', 'soldiers', 'professional'],
    see: ['cat:arms', 'rule:battles', 'rule:expenses', 'rule:levies'],
    body: () => (
      <>
        <p>
          Men-at-arms are recruited in regiments with gold, from the military screen or a province’s menu, and wait at
          home (at a small upkeep) until the army is raised; in the field they cost more. Each <T to="cat:arms">arm</T>{' '}
          has its own strength, toughness, pursuit and screen, and beats some others.
        </p>
        <p>
          Every arm keeps its role through the ages while its weapons change: spearmen become pikemen, line infantry and
          mechanised infantry. Its strength grows with the realm’s military era (×1, 1.35, 1.8, 2.4, 3.2 and 4.2), and
          so does its price (×1, 1.25, 1.55, 1.9, 2.3 and 2.8).
        </p>
        <p>
          Heavy horse is for knightly realms (feudal, imperial, theocratic and the monarchies that follow them) until
          the industrial era makes it everyone’s; horse archers are for the peoples of the steppe; air wings need
          aircraft.
        </p>
      </>
    ),
  },
  {
    id: 'battles',
    group: MILITARY,
    title: 'Battles',
    icon: 'crossed-swords',
    summary: 'Armies at war in one province fight a round a day until one side breaks.',
    terms: ['battle', 'combat', 'damage', 'counter', 'terrain', 'river', 'crossing', 'pursuit', 'retreat', 'commander'],
    see: ['rule:morale', 'rule:war-score', 'cat:arms', 'rule:men-at-arms'],
    body: () => (
      <>
        <p>Each day of battle, every hundred men of each arm deal damage:</p>
        <F>
          damage × (1 + technology and modifiers) × (1 − ½ × the share of the enemy that counters them) × (1 + 4% per
          point of the commander’s martial skill) × (½ + ½ × morale)
        </F>
        <p>
          The attacker, the side that marched in, deals less on hard ground: 85% in hills, jungle and wetlands, 90% in
          forest and taiga, 70% in mountains; and 75% in the first three days after crossing a river or a strait. A
          little chance moves each side’s damage up or down by as much as 15%.
        </p>
        <p>
          Losses fall hardest on the fragile: each arm loses men in proportion to its numbers over its toughness. Morale
          drops with every loss. A side breaks when its morale falls to 20% or fewer than 12% of its men are left; after
          fifteen days the side that has kept more of its men wins.
        </p>
        <p>
          The loser flees to a safe province nearby, and loses more in the pursuit: up to 40% of those left, by the
          winner’s pursuit against its own screen. Its armies start again with no morale. Each battle moves the{' '}
          <T to="rule:war-score">war score</T> by up to 12, and adds to the <T to="rule:war-weariness">war weariness</T>{' '}
          of both sides.
        </p>
      </>
    ),
  },
  {
    id: 'morale',
    group: MILITARY,
    title: 'Morale',
    icon: 'rally-the-troops',
    summary: 'An army’s will to fight: lost in battle, won back in camp.',
    terms: ['morale', 'drill', 'rout'],
    see: ['rule:battles', 'rule:council'],
    body: () => (
      <>
        <p>
          Morale runs from 0 to 100%. In battle it falls with every loss, by 2.5 times the share of the army lost, and a
          little more each day; an army whose morale falls to 20% breaks. Out of battle it comes back by 3% a day,
          faster with a marshal drilling the troops (5% more per point of martial skill), military technology and some
          modifiers.
        </p>
        <p>A beaten army starts again from nothing: give it time before the next fight.</p>
      </>
    ),
  },
  {
    id: 'supply',
    group: MILITARY,
    title: 'Supply and attrition',
    icon: 'bread',
    summary: 'A province feeds only so many men; beyond that, armies waste away.',
    terms: ['attrition', 'supply limit', 'starve', 'hunger', 'disease'],
    see: ['rule:development', 'rule:battles'],
    body: () => (
      <>
        <p>Each province can feed</p>
        <F>(2,500 + development × 900) × (1 + its farms and ports) × its land × (1 + technology)</F>
        <p>men without loss, where the land counts:</p>
        <Table
          rows={[
            ['Farmland', '×1.5'],
            ['Plains', '×1.2'],
            ['Steppe, hills and forest', '×0.9'],
            ['Drylands', '×0.7'],
            ['Taiga, jungle and wetlands', '×0.6'],
            ['Mountains', '×0.5'],
            ['Desert and tundra', '×0.4'],
            ['Ice', '×0.2'],
          ]}
        />
        <p>
          An army larger than that loses men each month: 6% for every time over the limit, at most 12% a month. In enemy
          land it loses 1% a month more, and at sea half a percent. Split large armies before a long march.
        </p>
      </>
    ),
  },
  {
    id: 'sieges',
    group: MILITARY,
    title: 'Sieges and occupation',
    icon: 'siege-tower',
    summary: 'Open country falls in days; walls must be besieged.',
    terms: ['siege', 'fort', 'castle', 'garrison', 'occupation', 'occupy', 'walls', 'breach'],
    see: ['rule:war-score', 'building:castle', 'rule:blockades'],
    body: () => (
      <>
        <p>
          An army standing unopposed in an enemy province takes it. Open country falls in eight days. A province with
          walls, the capital (one level of fort) and each level of castle, needs a siege, and a besieger must outnumber
          its garrison of {GARRISON_PER_FORT} men per level of fort. Each day the siege advances by
        </p>
        <F>
          (1 + 8% per point of siege power) × (1 + 2% per point of the spymaster’s intrigue, when undermining walls) ×
          (½ + the besiegers ÷ four times the garrison, counted up to 1½) × (1 + {pct(BLOCKADE_SIEGE)} if the coast is
          blockaded) ÷ (35 × fort level)
        </F>
        <p>
          and the province falls when the progress is full. Siege engines, and later guns, give siege power, as good as
          the realm can make them. Now and then a breach, or disease in the garrison, speeds things along.
        </p>
        <p>
          Occupied land counts towards the <T to="rule:war-score">war score</T>, pays its taxes to no one, and returns
          to its owner at the peace unless the treaty gives it away.
        </p>
      </>
    ),
  },

  // ── War and peace ───────────────────────────────────────────────
  {
    id: 'casus-belli',
    group: WAR,
    title: 'Declaring war',
    icon: 'flag-objective',
    summary: 'Every war needs a cause, and some wars cannot be declared at all.',
    terms: ['casus belli', 'cause', 'declare', 'war goal', 'truce'],
    see: ['cat:war', 'rule:claims', 'rule:war-score', 'rule:calls-to-arms'],
    body: () => (
      <>
        <p>
          A war is declared for a cause (<T to="cat:war">casus belli</T>) and a goal: a claimed province, a throne, a
          holy place, freedom. The cause sets what the victor may ask at the peace table and how much the neighbours
          fear what is taken (<T to="rule:aggressive-expansion">aggressive expansion</T>).
        </p>
        <p>A realm cannot declare war:</p>
        <ul>
          <li>as a vassal, except to claim a foreign throne (as William did) or to fight for its independence;</li>
          <li>on its allies, on realms it has a non-aggression pact with or guarantees, or on its own subjects;</li>
          <li>during a truce, which follows every peace for {TRUCE_YEARS} years;</li>
          <li>on rebels fighting another crown.</li>
        </ul>
        <p>
          A war of conquest needs no cause, but costs a point of <T to="rule:stability">stability</T> and alarms every
          neighbour. Declaring calls your allies, guarantors and vassals to arms, and theirs.
        </p>
      </>
    ),
  },
  {
    id: 'calls-to-arms',
    group: WAR,
    title: 'Calls to arms',
    icon: 'rally-the-troops',
    summary: 'Allies, guarantors, overlords and coalitions are called into a war; refusing breaks the bond.',
    terms: ['call to arms', 'ally', 'allies', 'join', 'refuse', 'betrayed'],
    see: ['rule:treaties', 'rule:opinion', 'rule:coalitions'],
    body: () => (
      <>
        <p>
          When a war begins, each side calls those bound to it: allies, those who guarantee the defender, the overlord
          of a tributary, the members of a coalition, and the faithful in a great holy war. Vassals always follow their
          liege. A realm cannot come if it has a truce, a pact or an alliance with the other side as well.
        </p>
        <p>The AI weighs a call like this, and comes if the sum is zero or more:</p>
        <Table
          rows={[
            ['The bond', 'an alliance +40, any other +30; −15 for an ally’s war of aggression'],
            ['Opinion', '0.4 × what it thinks of the leader, −0.2 × what it thinks of the enemy'],
            ['War weariness', '−3 per point'],
            ['Other wars', '−25 for each war it already fights'],
            ['The odds', '−30 if the enemy is half again as strong'],
            ['Distance', 'up to −30, by the distance between the capitals'],
            ['Debts', '−20 with two loans or more'],
          ]}
        />
        <p>
          Refusing breaks the bond: the alliance or guarantee ends, a tributary goes free, a coalition loses the member,
          and the leader remembers the betrayal (−50 opinion, −15 for a coalition).
        </p>
      </>
    ),
  },
  {
    id: 'war-score',
    group: WAR,
    title: 'War score',
    icon: 'scales',
    summary: 'From −100 to 100: how the war stands, and what it can buy at the peace table.',
    terms: ['war score', 'warscore', 'ticking', 'war goal', 'occupation'],
    see: ['rule:peace', 'rule:battles', 'rule:sieges', 'rule:blockades'],
    body: () => (
      <>
        <p>
          War score runs from −100 to 100, and each side sees it from its own side: what one side gains, the other
          loses. It is the sum of these shares, each shown apart in the war’s panel:
        </p>
        <Table
          rows={[
            ['Enemy land we hold', `${OCCUPATION_WEIGHT} × the share of the other side’s development occupied`],
            ['Our land they hold', 'the same, against'],
            [
              'Battles we won',
              `up to ${BATTLE_CAP}; each victory adds up to 12 (8 at sea), more for a bloodier defeat, and wears half as much off the enemy’s victories`,
            ],
            ['Battles we lost', `the same, against, up to ${BATTLE_CAP}`],
            [
              'Enemy coasts blockaded',
              `${BLOCKADE_WEIGHT} × the share of the other side’s development under blockade, up to ${BLOCKADE_CAP}`,
            ],
            ['Our coasts blockaded', `the same, against, up to ${BLOCKADE_CAP}`],
          ]}
        />
        <p>
          The war goal counts for more the longer it is held. Taking a goal that is a place (the province fought over,
          or the capital in a war for a throne) is worth {GOAL_TAKEN} at once; then every month it is held adds to its
          count, up to {MAX_MONTHS} months, and the count is worth more with each month:
        </p>
        <Table
          head={['Months held', 'War score']}
          rows={[1, 3, 6, 12, 18, 24].map((m) => [String(m), `${Math.round(goalScore(m))}`])}
        />
        <p>
          The goal’s count reaches {GOAL_CAP} at most. Once the goal is lost, the count drains by {GOAL_DECAY} months a
          month. The goal of a war for independence or of a revolt is held while the rebels keep their own land free
          (for half a year, or three months for a revolt).
        </p>
        <p>
          Defenders who have lost no land for a year count months of their own, on the same scale up to {HOLDOUT_CAP},
          against the attackers; these fade by {GOAL_DECAY} months a month once the enemy gains a foothold.
        </p>
      </>
    ),
  },
  {
    id: 'peace',
    group: WAR,
    title: 'Making peace',
    icon: 'peace-dove',
    summary: 'Every demand has a price in war score; the other side weighs it against the war and its weariness.',
    terms: ['peace', 'terms', 'white peace', 'treaty', 'surrender', 'reparations', 'vassalise', 'release', 'humiliate'],
    see: ['rule:war-score', 'rule:aggressive-expansion', 'rule:war-weariness', 'rule:subjects'],
    body: () => (
      <>
        <p>Each demand costs war score:</p>
        <Table
          rows={[
            ['A province', '130 × its share of the losers’ development + 4; half for a claimed province'],
            ['Gold', '25 for a year of the loser’s income, in proportion'],
            ['A throne', '70'],
            ['Tribute (a tributary)', '25 + up to 50, by the size of their realm'],
            ['A vassal', '40 + up to 40, by the size of their realm'],
            [
              'A people set free',
              `${RELEASE_WEIGHT * 100} × its share of the losers’ development + ${RELEASE_BASE}, for each people`,
            ],
            ['A change of faith', `${TERM_COST.convert}`],
            ['Humiliation', `${TERM_COST.humiliate}`],
            ...REPARATION_TERMS.map((r) => [`Reparations for ${r.years} years`, `${r.cost}`]),
            ['Breaking their alliances', `${TERM_COST.breakAlliances}`],
            [
              'Renouncing their claims',
              `${TERM_COST.renounce} + ${TERM_COST.perClaim} a claim (three for a crown), up to ${TERM_COST.renounce + TERM_COST.maxClaims}`,
            ],
            ['Independence', '50'],
            ['A revolt’s demands', '40'],
            ['Crushing a revolt', '30'],
          ]}
        />
        <p>
          A chancellor who negotiates takes up to a fifth off. The other side weighs the terms, and accepts at zero or
          more: the war score, less what is asked, plus half its <T to="rule:war-weariness">war weariness</T> and 3 for
          every year the war has lasted beyond three. A side with a war score of 99 or more accepts anything. The peace
          dialog shows how they weigh it, before the offer is sent.
        </p>
        <p>
          A white peace, with nothing given, is weighed the same way: the proposer’s war score, plus 10, plus one and a
          half times the other side’s weariness, plus 15 for every year of war beyond two.
        </p>
        <Table
          head={['Term', 'What it does']}
          rows={[
            [
              'A vassal',
              `Only a realm with no liege or overlord, and no more than ${pct(VASSAL_SHARE)} the size of the victor’s realm. It makes peace in its other wars, gives up its treaties, and its land joins the victor’s realm; it alarms the neighbours as half the conquest of all of it.`,
            ],
            [
              'A people set free',
              'The provinces of a culture that is not the crown’s own (never its capital) become a realm of their own, grateful to the victor.',
            ],
            [
              'A change of faith',
              'The loser’s crown and capital take up the victor’s faith; the rest of its people keep their own.',
            ],
            [
              'Humiliation',
              `The loser’s crown loses ${HUMILIATION.loser} legitimacy and the victor’s gains ${HUMILIATION.winner}; the loser remembers it (${HUMILIATION.memory}).`,
            ],
            [
              'Reparations',
              `The loser pays ${pct(REPARATIONS)} of its taxes each month to the victor, unless they go to war again.`,
            ],
          ]}
        />
        <p>
          The victor gains a point of <T to="rule:stability">stability</T> and the loser loses one; a truce of{' '}
          {TRUCE_YEARS} years follows. Land taken is remembered by those who lost it, and alarms the neighbours (
          <T to="rule:aggressive-expansion">aggressive expansion</T>). Those who fought side by side remember it (+10).
        </p>
      </>
    ),
  },
  {
    id: 'war-weariness',
    group: WAR,
    title: 'War weariness',
    icon: 'tattered-banner',
    summary: 'Long and bloody wars tire the realm; peace heals it.',
    terms: ['war exhaustion', 'weariness', 'exhaustion'],
    see: ['rule:peace', 'rule:estates', 'rule:taxes'],
    body: () => (
      <>
        <p>
          Every month at war adds 0.3 to a realm’s war weariness (less with a chancellor who negotiates), and every
          battle adds a point for each 2,500 men lost. It runs from 0 to 20 and falls by half a point for each month of
          peace.
        </p>
        <Table
          head={['', 'For each point']}
          rows={[
            ['Taxes', '−1%'],
            ['Loyalty of the commons', '−2.5'],
            ['Loyalty of the burghers', '−1'],
            ['Loyalty of vassals', '−1'],
            ['Answering calls to arms', '−3'],
          ]}
        />
        <p>
          A weary realm is readier to make peace (see <T to="rule:peace">making peace</T>); the AI leaves a war it is
          tired of.
        </p>
      </>
    ),
  },
  {
    id: 'claims',
    group: WAR,
    title: 'Claims',
    icon: 'scroll-unfurled',
    summary: 'A right to a province, forged by the chancellor: a cause for war and cheaper at the peace.',
    terms: ['claim', 'forge', 'fabricate', 'chancellor', 'throne claim'],
    see: ['rule:casus-belli', 'rule:peace', 'rule:council', 'plot:claim'],
    body: () => (
      <>
        <p>
          A realm may forge a claim on a province that borders its own. It costs 25 gold + 3 for each point of the
          province’s development, and takes about ten months:
        </p>
        <F>
          days = 300 × (1 − 2% per point of the chancellor’s diplomacy) × ⅔ when searching the archives, at least 90
        </F>
        <p>
          One claim is forged at a time. A claim is a cause for war, and a claimed province costs half the war score at
          the peace table. Claims on land the realm already holds are fulfilled; claims on empty land lapse. The realm
          that is claimed resents it (−10 opinion for each claim, up to −40).
        </p>
        <p>
          Claims on a whole throne come from history and inheritance: pressing one, and winning, puts your ruler on that
          throne and joins the two realms.
        </p>
      </>
    ),
  },
  {
    id: 'aggressive-expansion',
    group: WAR,
    title: 'Aggressive expansion',
    icon: 'angry-eyes',
    summary: 'Conquest makes neighbours wary; enough of it binds them into a coalition.',
    terms: ['ae', 'wary', 'wariness', 'infamy', 'badboy'],
    see: ['rule:coalitions', 'rule:opinion', 'rule:peace'],
    body: () => (
      <>
        <p>
          When land changes hands at a peace, every independent realm within 1,200 km of it grows wary of the conqueror
          (fully within 300 km, less and less beyond). For each province taken they remember
        </p>
        <F>−(development × 1.5 + 4) × nearness × the cause’s weight</F>
        <Table
          head={['Cause', 'Weight']}
          rows={[
            ['A claim', String(AE_FACTOR.claim)],
            ['A throne', String(AE_FACTOR.throne)],
            ['Conquest', String(AE_FACTOR.conquest)],
            ['A coalition', String(AE_FACTOR.coalition)],
            ['A holy war', String(AE_FACTOR.holy)],
            ['Making a realm a tributary', '0.25 of all its land'],
            ['Other land taken', '1'],
          ]}
        />
        <p>
          Wariness counts against their opinion of you, and fades by {MEMORY.ae.decay} a month. At {COALITION_AE} a
          realm at least three quarters as strong as you may join a coalition against you.
        </p>
      </>
    ),
  },
  {
    id: 'coalitions',
    group: WAR,
    title: 'Coalitions',
    icon: 'crossed-chains',
    summary: 'Realms that fear a conqueror band together, and strike when they are strong enough.',
    terms: ['coalition', 'league', 'alliance against'],
    see: ['rule:aggressive-expansion', 'cb:coalition'],
    body: () => (
      <>
        <p>
          A realm whose wariness of another reaches {COALITION_AE}, and that is not its ally or bound to it, may join a
          coalition against it; it leaves once its wariness fades above −25. The player joins or leaves by choice.
        </p>
        <p>
          The strongest member leads. When the coalition can muster a tenth more men than the target and its allies (who
          count at 60%), it declares a <T to="cb:coalition">coalition war</T>, and every member is called to arms. After
          such a war, the members’ wariness is halved and the coalition is dissolved.
        </p>
      </>
    ),
  },
  {
    id: 'revolts',
    group: WAR,
    title: 'Revolts and factions',
    icon: 'fist',
    summary:
      'Estates pushed too far rise, peoples of the age of nations want their own state, and vassals their freedom.',
    terms: ['revolt', 'rebels', 'uprising', 'faction', 'ultimatum', 'national revolt', 'pretender'],
    see: ['rule:estates', 'rule:subjects', 'rule:culture'],
    body: () => (
      <>
        <p>
          <strong>Estates.</strong> An estate holding a fifth of the realm’s power or more, whose loyalty falls below{' '}
          {REVOLT_LOYALTY}, may rise, the more likely the angrier and the stronger it is (up to one month in four). It
          wants lower taxes, lighter conscription, less power for the crown or privileges; nobles who have lost faith in
          a ruler of little legitimacy (below 35) fight for a pretender instead. Part of the realm breaks away as a
          rebel realm, and the war decides: if the rebels win, their demand becomes law, and the crown loses 10
          legitimacy.
        </p>
        <p>
          <strong>Nations.</strong> In the age of nationalism, a foreign people of three provinces or more and 8% of the
          realm’s development may rise for a state of its own, the likelier the more of them and the angrier the
          commons. If it wins, it becomes a new country.
        </p>
        <p>
          <strong>Factions.</strong> Vassals whose loyalty falls below zero form a faction for independence. Once they
          muster three fifths of their liege’s remaining strength, they send an ultimatum: their freedom, or war.
          Subjects of the AI whose loyalty falls below {REBEL_LOYALTY} fight for their independence when they feel
          strong enough.
        </p>
      </>
    ),
  },

  // ── Diplomacy ───────────────────────────────────────────────────
  {
    id: 'opinion',
    group: DIPLOMACY,
    title: 'Opinion',
    icon: 'conversation',
    summary: 'What one realm thinks of another, from −200 to 200, and every reason for it.',
    terms: ['opinion', 'relations', 'memory', 'memories', 'grudge', 'favour'],
    see: ['rule:treaties', 'rule:gifts', 'rule:aggressive-expansion', 'rule:subjects'],
    body: () => (
      <>
        <p>Every realm weighs every other:</p>
        <Table
          rows={[
            ['Faith', 'the same +15; a sister faith −5; another family −15; the head of our faith +15'],
            ['Ideals', 'shared modern ideals +15; rival ideologies −15 to −30'],
            ['Culture', 'the same +10; kindred +5'],
            ['Treaties', 'allies +40; a non-aggression pact +15; they protect us +20; under our protection +10'],
            ['Holy places', '−10 if they hold our faith’s'],
            ['War', 'at war −100; a recent war (a truce) −20'],
            ['Claims', '−10 for each claim on our land, up to −40; a claim on our throne −30'],
            ['A dangerous neighbour', '−10 if they border us and are half again as strong'],
            ['Their ruler', '+1.5 per point of diplomacy; their chancellor’s embassies +½ per point'],
            ['Memories', 'what they have done, fading month by month'],
          ]}
        />
        <p>Memories fade by so much a month:</p>
        <Table
          head={['Memory', 'Fades by', 'Range']}
          rows={Object.values(MEMORY).map((m) => [m.label, String(m.decay), `${m.min} to ${m.max}`])}
        />
      </>
    ),
    live: live((game, c) => {
      const lord = c.liege || c.overlord;
      return lord ? (
        <BreakdownList
          title={`What ${game.state.countries[lord].short} thinks of you`}
          b={opinion(game.state, game.world, lord, c.index)}
          digits={0}
        />
      ) : null;
    }),
  },
  {
    id: 'treaties',
    group: DIPLOMACY,
    title: 'Treaties',
    icon: 'contract',
    summary: 'Alliances, non-aggression pacts, military access and guarantees, between independent realms.',
    terms: ['treaty', 'pact', 'alliance', 'nap', 'access', 'guarantee', 'propose'],
    see: ['pact:alliance', 'pact:nap', 'pact:access', 'pact:guarantee', 'rule:calls-to-arms'],
    body: () => (
      <>
        <p>
          Only independent realms make treaties: vassals follow their liege, and tributaries may not make alliances.
          Four kinds exist: an <T to="pact:alliance">alliance</T>, a <T to="pact:nap">non-aggression pact</T>,{' '}
          <T to="pact:access">military access</T> and a <T to="pact:guarantee">guarantee of independence</T>.
        </p>
        <p>
          A realm accepts a proposal when its willingness, a breakdown of opinion, fears and interests, is zero or more.
          For an alliance: −20 for being bound at all, half its opinion, +25 for a common threat, up to +25 for your
          strength (or −20 for your weakness), less for the distance between the capitals, and −25 for each ally beyond
          the first it already has.
        </p>
        <p>Breaking a treaty is remembered: −30 opinion for an alliance, −15 for the others.</p>
      </>
    ),
  },
  {
    id: 'subjects',
    group: DIPLOMACY,
    title: 'Vassals and tributaries',
    icon: 'kneeling',
    summary: 'Subjects pay, and vassals fight; their loyalty decides whether they stay.',
    terms: ['vassal', 'tributary', 'subject', 'loyalty', 'integrate', 'integration', 'liege', 'overlord'],
    see: ['law:crown', 'rule:revolts', 'rule:opinion', 'rule:peace'],
    body: () => (
      <>
        <p>
          A <strong>vassal</strong> holds its land under a liege: it pays a share of its taxes set by the liege’s{' '}
          <T to="law:crown">crown authority</T>, joins every war of its liege, and has no foreign policy of its own. A{' '}
          <strong>tributary</strong> keeps its crown and its treaties (except alliances) and pays{' '}
          {pct(TRIBUTARY_TRIBUTE)} of its taxes; its overlord defends it. A beaten realm becomes either at the{' '}
          <T to="rule:peace">peace table</T>.
        </p>
        <p>Loyalty starts from the subject’s opinion of its lord, and adds:</p>
        <Table
          rows={[
            ['Its duty', 'a vassal −5; a tributary −15'],
            ['Crown authority', 'from +10 (autonomous vassals) to −20 (absolute authority)'],
            ['The lord’s legitimacy', '0.4 × (legitimacy − 50)'],
            ['The lord’s stability', '+5 per point'],
            ['A new ruler', 'up to −20 in the first five years of a reign'],
            ['Its ruler', 'ambitious −15, content +10'],
            ['Foreign masters', '−10 if of another culture group'],
            ['The might of the crown', 'from −40 to +30, by the lord’s strength against its own'],
            ['A watchful spymaster', '+½ per point of intrigue'],
            ['Being integrated', '−25'],
            ['The lord’s war weariness', '−1 per point'],
            ['A colony', '−5 for the ocean between; −25 once it has heard of popular sovereignty'],
          ]}
        />
        <p>
          A loyal vassal (0 or more) can be <strong>integrated</strong>: its land becomes the liege’s once the work is
          done, eight points for each point of its development (at least 40), at 4 a month plus half the diplomacy of
          the ruler and of the chancellor. Colonial nations govern themselves and cannot be integrated. Disloyal
          subjects form <T to="rule:revolts">factions</T>.
        </p>
      </>
    ),
    live: live((game, c) => {
      const lord = c.liege || c.overlord;
      return lord ? (
        <BreakdownList title="Your loyalty to your lord" b={loyalty(game.state, game.world, c.index)} digits={0} />
      ) : null;
    }),
  },
  {
    id: 'gifts',
    group: DIPLOMACY,
    title: 'Gifts',
    icon: 'present',
    summary: 'Four months of the recipient’s income buy a lasting warmth.',
    terms: ['gift', 'present', 'bribe'],
    see: ['rule:opinion'],
    body: () => (
      <p>
        A gift costs four months of the recipient’s income (at least 20 gold) and is remembered: +25 opinion, up to +50,
        fading by half a point a month.
      </p>
    ),
  },

  // ── Crown and estates ───────────────────────────────────────────
  {
    id: 'stability',
    group: CROWN,
    title: 'Stability',
    icon: 'scales',
    summary: 'From −3 to +3: how settled the realm is. It touches almost everything.',
    terms: ['stability', 'unrest', 'order'],
    see: ['rule:legitimacy', 'rule:estates', 'rule:council'],
    body: () => (
      <>
        <p>Each point of stability, up or down, counts for:</p>
        <Table
          rows={[
            ['Taxes', '+5%'],
            ['Levies', '+3%'],
            ['Research', '+3%'],
            ['The legitimacy the crown heads for', '+4'],
            ['Loyalty of every estate and every vassal', '+5'],
          ]}
        />
        <p>Below zero the land grows at half the pace, and the AI starts no wars and forges no claims.</p>
        <p>
          Stability drifts back towards +1 (towards 0 when legitimacy is below 30): each month the chance of a step up
          is 4%, +0.4% per point of the chaplain’s learning when preaching obedience, and a little more with a loyal
          clergy; a step down from above is half as likely.
        </p>
        <Table
          head={['It falls', '']}
          rows={[
            ['A war of conquest declared', '−1'],
            ['A war lost', '−1 (a war won: +1)'],
            ['A new reign (not in a republic)', '−1'],
            ['A harsher law, a change of succession', '−1'],
            ['A privilege revoked', '−1'],
            ['Bankruptcy', '−2'],
          ]}
        />
      </>
    ),
  },
  {
    id: 'legitimacy',
    group: CROWN,
    title: 'Legitimacy',
    icon: 'crowned-heart',
    summary: 'From 0 to 100: the ruler’s right to rule, in the eyes of the great and the good.',
    terms: ['legitimacy', 'right to rule'],
    see: ['rule:succession', 'rule:stability', 'rule:estates', 'rule:laws'],
    body: () => (
      <>
        <p>Legitimacy moves each month a point (two, when far off) towards a mark made of:</p>
        <Table
          rows={[
            ['The right to rule', '50'],
            ['Years on the throne', '+1 a year, up to +20'],
            ['Stability', '+4 per point'],
            ['A theocracy', '+10'],
            ['The clergy', 'up to ±10, by their loyalty and power'],
            ['The court chaplain', '+1 per point of learning, when anointing the crown'],
            ['Holy places of the faith held', '+3 each, up to +10'],
            ['Technology and modifiers', 'as they come'],
            ['A pious ruler', '+5'],
            ['A child on the throne', '−15'],
          ]}
        />
        <p>
          Legitimacy makes the nobles and clergy loyal (0.3 × its distance from 50) and vassals too (0.4 ×). It pays for
          changes of <T to="rule:laws">law</T> (5; 15 for the succession) and for accepting a people (10); a blessing
          from the head of the faith adds 10. Below 30, stability heads for 0 instead of +1; below 35, the nobles may
          rise for a pretender.
        </p>
      </>
    ),
    live: live((game, c) => (
      <BreakdownList title="The legitimacy your crown heads for" b={legitimacyTarget(game.state, c)} digits={0} />
    )),
  },
  {
    id: 'laws',
    group: CROWN,
    title: 'Laws',
    icon: 'scroll-quill',
    summary: `Five laws; each changes a step at a time, at a cost, and then rests for ${LAW_COOLDOWN_YEARS} years.`,
    terms: ['law', 'laws', 'change law', 'cooldown'],
    see: ['law:succession', 'law:crown', 'law:conscription', 'law:taxation', 'law:tolerance'],
    body: () => (
      <>
        <p>
          The realm’s laws are its <T to="law:succession">succession</T>, <T to="law:crown">crown authority</T>,{' '}
          <T to="law:conscription">conscription</T>, <T to="law:taxation">taxation</T> and{' '}
          <T to="law:tolerance">religious policy</T>. A law changes one step at a time and costs 5 legitimacy (15 for
          the succession); a harsher law (more authority, conscription or taxes, or less tolerance) also costs a point
          of stability. After any change the laws rest for {LAW_COOLDOWN_YEARS} years.
        </p>
        <p>
          The forms of government decide which successions are possible: republics and democracies elect, theocracies
          choose from the clergy, absolute and constitutional monarchies are hereditary.
        </p>
      </>
    ),
  },
  {
    id: 'estates',
    group: CROWN,
    title: 'The estates',
    icon: 'meeple-group',
    summary: 'Nobles, clergy, burghers and commons share the realm’s power; loyal ones help, angry ones hinder.',
    terms: [
      'estate',
      'estates',
      'nobles',
      'nobility',
      'clergy',
      'burghers',
      'commons',
      'privilege',
      'influence',
      'loyalty',
    ],
    see: ['estate:nobles', 'estate:clergy', 'estate:burghers', 'estate:commons', 'rule:revolts'],
    body: () => (
      <>
        <p>
          Power is shared between four estates by the form of government, then shifted: markets give the burghers up to
          15 points and castles the nobles up to 10 (by their levels over the provinces), crown authority takes 5 from
          the nobles for each level, and privileges give their holders 10.
        </p>
        <p>
          Each estate’s loyalty runs from −100 to 100, from laws, the ruler, stability, legitimacy, strife, war
          weariness and recent dealings; privileges add 25, and an estate with more than 40% of the power grows too
          proud to obey. What an estate does for the realm is
        </p>
        <F>clamp(loyalty ÷ 50, −1, 1) × min(1.5, 4 × its share of the power)</F>
        <Table
          head={['Estate', 'Its help, or hindrance']}
          rows={[
            ['Nobility', 'levies ±10%; military research'],
            ['Clergy', 'legitimacy ±10; stability recovering; social research'],
            ['Burghers', 'taxes ±10%; economic research'],
            ['Commons', 'levies recovering ±20%; growth ±10%'],
          ]}
        />
        <p>
          A privilege wins an estate’s loyalty at a price (the lords, church and towns pay 5% less in taxes, the commons
          serve 10% less). Taking it back angers them (−30) and costs a point of stability. An estate with a fifth of
          the power and loyalty below {REVOLT_LOYALTY} may <T to="rule:revolts">revolt</T>.
        </p>
      </>
    ),
    live: live((game, c) => (
      <>
        {ESTATES.map((e) => (
          <BreakdownList
            key={e}
            title={`Loyalty of the ${estateName(c, e).toLowerCase()}`}
            b={estateLoyalty(game.state, c, e)}
            digits={0}
          />
        ))}
      </>
    )),
  },
  {
    id: 'council',
    group: CROWN,
    title: 'The council',
    icon: 'organigram',
    summary: 'Five councillors, each with a task; a councillor helps only with the task set.',
    terms: ['council', 'councillor', 'task', 'chancellor', 'marshal', 'steward', 'spymaster', 'chaplain'],
    see: ['seat:chancellor', 'seat:marshal', 'seat:steward', 'seat:spymaster', 'seat:chaplain', 'rule:characters'],
    body: () => (
      <>
        <p>
          The <T to="seat:chancellor">chancellor</T> (diplomacy), <T to="seat:marshal">marshal</T> (martial),{' '}
          <T to="seat:steward">steward</T> (stewardship), <T to="seat:spymaster">spymaster</T> (intrigue) and{' '}
          <T to="seat:chaplain">court chaplain</T> (learning) each take one task at a time, and bring their skill to it
          alone: a steward collecting taxes adds nothing to the growth of the land. Some skills count whatever the task:
          the chancellor’s diplomacy speeds integration and forged claims, the chaplain’s learning speeds conversion,
          the spymaster’s intrigue builds networks and carries out plots, and the steward, marshal and chaplain each add
          to a track of research.
        </p>
        <p>
          Councillors are chosen from the court; new courtiers arrive each New Year. A seat left empty brings nothing.
        </p>
      </>
    ),
  },
  {
    id: 'government',
    group: CROWN,
    title: 'Government and reform',
    icon: 'capitol',
    summary: `The form of the state: taxes, levies, the estates’ power, succession. Reforms come with learning, ${REFORM_YEARS} years apart.`,
    terms: ['government', 'reform', 'monarchy', 'republic', 'democracy', 'election', 'ideology'],
    see: ['cat:governments', 'rule:laws', 'rule:estates', 'rule:technology'],
    body: () => (
      <>
        <p>
          Each <T to="cat:governments">form of government</T> has its own taxes and levies, shares power among the{' '}
          <T to="rule:estates">estates</T> in its own way and allows its own successions. New forms open with the
          society track of <T to="rule:technology">technology</T> (tribes and hordes may take up feudalism once they
          know a little). A realm may reform its government once in {REFORM_YEARS} years.
        </p>
        <p>
          Modern governments carry ideals: liberal, socialist or authoritarian. Realms of the same modern ideals think
          better of each other (+15), rivals worse. Republics and democracies elect their leader every eight years (four
          in a democracy), and an incumbent with legitimacy of 50 or more has an edge.
        </p>
      </>
    ),
  },

  // ── Faith and culture ───────────────────────────────────────────
  {
    id: 'faith',
    group: FAITH,
    title: 'Faith',
    icon: 'church',
    summary: 'Provinces of other faiths pay and serve less; missions bring them to the crown’s.',
    terms: [
      'religion',
      'faith',
      'conversion',
      'convert',
      'missionaries',
      'head of faith',
      'blessing',
      'holy site',
      'holy places',
    ],
    see: ['cat:faiths', 'law:tolerance', 'rule:provinces', 'rule:holy-wars', 'rule:heresies'],
    body: () => (
      <>
        <p>
          Faiths belong to families: Christian, Islamic, Buddhist, Dharmic and others. A province of a sister faith (the
          same family) or of another family pays and serves less (<T to="rule:provinces">see the table</T>) and angers
          the commons, by the realm’s <T to="law:tolerance">religious policy</T>:
        </p>
        <Table
          head={['', 'Persecution', 'Established church', 'Tolerance']}
          rows={[
            ['Strife among the commons', ...STRIFE.map((v) => `×${v}`)],
            ['Speed of conversion', ...CONVERSION_SPEED.map((v) => `×${v}`)],
            ['The clergy', ...TOLERANCE_CLERGY.map((v) => (v > 0 ? `+${v}` : String(v)))],
          ]}
        />
        <p>
          The court chaplain, sending missionaries, converts one province at a time, the richest first. A province needs
          60 + 12 per point of development; each month the mission does
        </p>
        <F>
          (3 + 0.6 per point of the chaplain’s learning) × the policy’s speed × 1.5 for a sister faith × (1 +
          technology)
        </F>
        <p>
          Some faiths have a <strong>head</strong>: the Pope, the Ecumenical Patriarch, the Caliph, the Imam-Caliph.
          Their realm is well liked by the faithful (+15), may call <T to="rule:holy-wars">great holy wars</T>, and
          gives a blessing, once in ten years, for three months of the asker’s income: +10 legitimacy.
        </p>
        <p>
          Each faith has <strong>holy places</strong>. Holding them adds 3 legitimacy each (up to 10) and to the realm’s{' '}
          <T to="rule:standing">standing</T>; realms of the faith resent unbelievers who hold them (−10).
        </p>
      </>
    ),
  },
  {
    id: 'culture',
    group: FAITH,
    title: 'Culture',
    icon: 'conversation',
    summary: 'Peoples of the realm: its own, those it accepts, kindred and foreign.',
    terms: ['culture', 'people', 'accept', 'accepted', 'assimilation', 'schools', 'nationalism', 'diversity'],
    see: ['rule:provinces', 'rule:revolts', 'rule:faith'],
    body: () => (
      <>
        <p>
          A province’s people are the realm’s own, accepted, kindred (of the same culture group) or foreign. Kindred
          peoples withhold 5% of their taxes and levies, foreign ones 15%, and foreign peoples weigh on the loyalty of
          the commons (−20 for a realm of foreigners only). In the age of nationalism both grow: 25% withheld, and up to
          −45 with the commons, and a large foreign people may <T to="rule:revolts">rise for its own state</T>.
        </p>
        <p>
          A realm may <strong>accept</strong> a people that makes up a tenth of it or more, for 10 legitimacy: a county
          none, a duchy one, a kingdom two, an empire three, and technology adds more. Accepted peoples count as the
          realm’s own.
        </p>
        <p>
          The steward, founding schools, turns one province at a time to the realm’s culture, the richest first, at (3 +
          ½ per point of the steward’s stewardship + 0.2 per point of the ruler’s diplomacy) × (1 + technology) a month.
          A foreign province among the realm’s own people also takes up their ways by itself now and then.
        </p>
      </>
    ),
  },
  {
    id: 'holy-wars',
    group: FAITH,
    title: 'Holy wars, crusades and jihads',
    icon: 'holy-grail',
    summary:
      'Christian and Muslim realms fight unbelievers; their heads of faith call the faithful to free holy cities.',
    terms: ['holy war', 'crusade', 'jihad', 'great holy war', 'jerusalem', 'kingdom of jerusalem'],
    see: ['cb:holy', 'cb:crusade', 'rule:faith'],
    body: () => (
      <>
        <p>
          A realm of a Christian or Islamic faith may wage a <T to="cb:holy">holy war</T> on a neighbour of another
          family of faiths, for a province on its border or a holy place of its own faith that they hold. The goal costs
          half the war score at the peace, and victory adds 5 legitimacy.
        </p>
        <p>
          Once in a generation (at least {HOLY_WAR_INTERVAL} years apart), the head of a faith may call a{' '}
          <T to="cb:crusade">great holy war</T> to free a holy city: the Pope a crusade for Jerusalem from 1090, the
          Caliph a jihad, until 1700. Every realm of the faith is called; each weighs its piety, its troubles and the
          distance. If the faithful win, the land within {HOLY_LAND_KM} km of the city is won for the faith (a crusade
          founds the Kingdom of Jerusalem), and every realm that fought gains 10 legitimacy.
        </p>
      </>
    ),
  },
  {
    id: 'heresies',
    group: FAITH,
    title: 'Heresies and schisms',
    icon: 'burning-embers',
    summary: 'New teachings rise in their time and place, spread among the faithful, and may split a faith.',
    terms: ['heresy', 'heresies', 'reformation', 'protestant', 'schism', 'cathar', 'lutheran'],
    see: ['rule:faith', 'law:tolerance', 'cat:faiths'],
    body: () => (
      <>
        <p>
          Each heresy has its time and its cradle: the Cathars in the south of France from 1140, the Hussites in
          Bohemia, the Reformation in the sixteenth century. A preacher rises there, and the teaching spreads from
          province to province among the faithful of the old faith, faster in a realm whose crown has taken it up, and
          more readily among some peoples than others (the Reformation in the north).
        </p>
        <p>
          Where the old faith rules, a heresy dies out slowly, faster under persecution. A crown whose capital and
          people have turned may break with the old faith: a schism, and the realm follows the new teaching. Some events
          offer the choice outright.
        </p>
      </>
    ),
  },

  // ── Learning ────────────────────────────────────────────────────
  {
    id: 'technology',
    group: LEARNING,
    title: 'Technology',
    icon: 'graduate-cap',
    summary: 'Three tracks of 33 levels, each dated to history: ahead of its time dearer, behind it cheaper.',
    terms: ['research', 'tech', 'technology', 'focus', 'learning', 'scholars', 'university'],
    see: ['cat:technologies', 'cat:eras', 'rule:eras', 'building:university'],
    body: () => (
      <>
        <p>
          A realm studies three tracks at once, <T to="track:economy">economy</T>, <T to="track:military">military</T>{' '}
          and <T to="track:society">society</T>, each level in its order. Each month every track gains
        </p>
        <F>
          (1 + 0.35 × √(development ÷ 10) + 6% of the ruler’s skill + 4% of the councillor’s skill + the universities +
          up to ±0.45 for the estate) × (1 + learning + 3% per point of stability + {pct(FOCUS_BONUS)} for the realm’s
          focus + 10% in a democracy)
        </F>
        <p>
          The skill is stewardship for the economy (with the steward), martial for the military (the marshal) and
          learning for society (the chaplain); the estate is the burghers, the nobles or the clergy. Universities count
          by the square root of their levels: a few great ones count more than many small.
        </p>
        <p>A level costs what an ordinary realm of its day would have gathered since the level before:</p>
        <F>110 × the years between the two levels in history, at least 300</F>
        <p>
          It costs 5% more for each year it is ahead of its time (up to 80 years), and less the longer it has been
          known: 1.5% a year, up to half. Each neighbour that knows it takes off 10% (a liege counts twice), up to 40%.
          No level costs less than 30% of its base.
        </p>
      </>
    ),
    live: live((game, c) => (
      <>
        <BreakdownList title="Economy research a month" b={researchPoints(game.state, c, 'economy')} />
        <BreakdownList title="Military research a month" b={researchPoints(game.state, c, 'military')} />
        <BreakdownList title="Society research a month" b={researchPoints(game.state, c, 'society')} />
      </>
    )),
  },
  {
    id: 'eras',
    group: LEARNING,
    title: 'Eras',
    icon: 'hourglass',
    summary: 'A realm’s era follows its learning, and dresses its soldiers, ships and look.',
    terms: ['era', 'age', 'medieval', 'renaissance', 'early modern', 'industrial', 'modern', 'contemporary'],
    see: ['cat:eras', 'rule:technology', 'rule:men-at-arms'],
    body: () => (
      <>
        <p>
          The game spans six <T to="cat:eras">eras</T>, from the medieval to the contemporary. A realm’s era follows the
          average of its three tracks; its <strong>military era</strong>, which sets what its soldiers and ships are and
          how strong, follows the military track alone.
        </p>
        <p>
          A new era brings new soldiers and ships, higher buildings, new forms of government and new ideas: nations that
          want a state of their own, peoples who want a vote. The interface dresses in the colours of your era, and
          coats of arms give way to flags. From the industrial era, every realm knows the whole world.
        </p>
      </>
    ),
  },

  // ── The sea and the unknown ─────────────────────────────────────
  {
    id: 'navies',
    group: SEA,
    title: 'Fleets and naval battles',
    icon: 'galleon',
    summary: 'Warships of three roles fight for the seas, blockade ports and catch armies at sea.',
    terms: ['navy', 'fleet', 'warship', 'admiral', 'naval battle', 'shipyard'],
    see: ['cat:ships', 'rule:transports', 'rule:blockades', 'rule:exploration'],
    body: () => (
      <>
        <p>
          Warships are built in ports and sail in fleets, led by an admiral. Each keeps its role through the ages while
          the ships change: <T to="ship:heavy">heavy ships</T> (war cogs to battleships) beat{' '}
          <T to="ship:light">light ones</T>, light ones hunt <T to="ship:submarine">submarines</T> (from the modern
          era), and submarines sink the heavy.
        </p>
        <p>
          Fleets of realms at war fight where they meet, a round a day, until one side breaks and flees. Warships next
          to an enemy coast <T to="rule:blockades">blockade</T> it, and those at sea catch enemy armies crossing it.
          Open ocean needs cartography; steamships sail 1.7 times as fast.
        </p>
      </>
    ),
  },
  {
    id: 'transports',
    group: SEA,
    title: 'Transports',
    icon: 'cargo-ship',
    summary: 'A pool of ships that carries the realm’s armies over the sea.',
    terms: ['transport', 'embark', 'crossing', 'invasion', 'interception'],
    see: ['rule:navies', 'ship:transport'],
    body: () => (
      <>
        <p>
          Transports are not in fleets: every realm keeps a pool of them, built in its ports. An army may step onto the
          water only if the free transports can carry it; each carries more men in later eras:
        </p>
        <Table
          head={['Era', 'Men per transport']}
          rows={TRANSPORT_CAPACITY.map((n, i) => [String(i + 1), String(n)])}
        />
        <p>
          An army at sea where enemy warships lie, without an escort at least half as strong, loses men every day (up to
          a quarter a day) and the transports that carried them, until it makes land.
        </p>
      </>
    ),
  },
  {
    id: 'blockades',
    group: SEA,
    title: 'Blockades',
    icon: 'anchor',
    summary: `Warships off an enemy coast cut its taxes by ${pct(BLOCKADE_TAX)} and speed sieges there.`,
    terms: ['blockade', 'port', 'coast'],
    see: ['rule:navies', 'rule:sieges', 'rule:taxes'],
    body: () => (
      <p>
        A fleet at war lying in a sea zone blockades every enemy coastal province on it. A blockaded province pays{' '}
        {pct(BLOCKADE_TAX)} less in taxes, and a siege there goes {pct(BLOCKADE_SIEGE)} faster, since the garrison
        cannot be supplied from the sea. Blockades are worked out every morning.
      </p>
    ),
  },
  {
    id: 'exploration',
    group: SEA,
    title: 'The unknown world',
    icon: 'treasure-map',
    summary: 'Each realm knows only part of the world; the rest is bare parchment until someone goes there.',
    terms: ['terra incognita', 'exploration', 'explore', 'unknown', 'fog', 'map', 'cartography'],
    see: ['rule:navies', 'rule:colonies'],
    body: () => (
      <>
        <p>
          In 1066 a realm knows the lands and seas around its own (farther for great realms and steppe peoples), the
          holy places of its faith and, for kingdoms and empires, the lands where its family of faiths rules. The rest
          is unknown: drawn as parchment, and closed to colonists.
        </p>
        <p>
          Armies and fleets reveal what they reach; a fleet can be sent to explore. Realms share their maps with their
          vassals, lieges and allies each month; with cartography, each January, the realms of a family of faiths that
          know it share theirs. From the industrial era every realm knows the whole world.
        </p>
      </>
    ),
  },
  {
    id: 'colonies',
    group: SEA,
    title: 'Colonies',
    icon: 'wood-cabin',
    summary: 'Land no realm rules can be settled: slowly, at a cost, and far away only with technology.',
    terms: ['colony', 'colonist', 'colonial nation', 'natives', 'settle'],
    see: ['rule:exploration', 'rule:subjects', 'cat:technologies'],
    body: () => (
      <>
        <p>
          A colonist settles a province no realm rules, known to the realm, next to its land or on a coast within{' '}
          {BASE_RANGE} km of it (farther with technology). Founding it costs 30 gold + 5 per point of the land’s natural
          development, and {COLONY_UPKEEP} gold a month while it grows. It takes
        </p>
        <F>48 months × (1 + the natives ÷ 4) ÷ (1 + 0.15 × economic era)</F>
        <p>
          A realm has one colonist, and technology adds more. Settling among natives needs cartography or joint-stock
          companies, and the natives may strike at the colony.
        </p>
        <p>
          Colonies on another continent, in a colonial region where the realm holds three provinces or more, pass to a
          colonial nation: a vassal that governs them, which cannot be integrated and grows restless once it hears of
          popular sovereignty.
        </p>
      </>
    ),
  },

  // ── Fortune and intrigue ────────────────────────────────────────
  {
    id: 'events',
    group: FORTUNE,
    title: 'Events',
    icon: 'scroll-quill',
    summary: 'Harvests and fires, scholars and schisms: each asks the realm to choose.',
    terms: ['event', 'choice', 'option', 'mean time'],
    see: ['cat:events', 'rule:modifiers', 'rule:world-events'],
    body: () => (
      <>
        <p>
          Each month a realm may meet one <T to="cat:events">event</T>. Each has a mean time: an event of twenty years
          comes about once in twenty years to a realm that meets its conditions, and then rests for its own span (twenty
          years unless it says otherwise); some happen only once. World events, the pestilence and wars fire events of
          their own.
        </p>
        <p>
          Every option says what it costs and brings before you choose: gold (counted in months of your income),
          stability, legitimacy, levies, research, the moods of the estates, a <T to="rule:modifiers">modifier</T> for
          some years. Your events wait for your answer and stop the clock; the AI chooses at once, by how much it likes
          each option.
        </p>
      </>
    ),
  },
  {
    id: 'modifiers',
    group: FORTUNE,
    title: 'Modifiers',
    icon: 'hourglass',
    summary: 'Boons and misfortunes a realm carries for some years, named in every figure they touch.',
    terms: ['modifier', 'famine', 'boom', 'depression'],
    see: ['cat:modifiers', 'rule:events'],
    body: () => (
      <p>
        A <T to="cat:modifiers">modifier</T> is carried for a time, from a season to decades: a famine, a trade boom,
        the fury of a horde, the burdens of total war. Events, world events and plots give them. Each adds its effects
        to the realm’s figures (taxes, levies, growth, research, morale, legitimacy, the estates, what others think of
        it) and is named in the breakdowns. A realm that already carries one keeps it until the later of the two ends.
      </p>
    ),
  },
  {
    id: 'plague',
    group: FORTUNE,
    title: 'Pestilence',
    icon: 'plague-doctor-profile',
    summary: 'Plagues break out in their time and place, and spread over land and along the sea lanes.',
    terms: ['plague', 'pestilence', 'black death', 'disease', 'quarantine', 'epidemic'],
    see: ['cat:plagues', 'rule:development', 'rule:provinces'],
    body: () => (
      <>
        <p>
          Each <T to="cat:plagues">plague</T> comes in its own years and breaks out where history saw it begin. Every
          month it may pass from each sick province to each neighbour, and from ports along the coasts of the same
          waters. A province struck loses part of its development, pays and serves {pct(PLAGUE_PENALTY)} less for the
          months the sickness rages, cannot be developed meanwhile, and is spared for years once it has passed. The land
          fills again slowly: each lost point has a 1% chance a month of coming back.
        </p>
        <p>Quarantine (from events) and public health (a technology) slow its spread into a realm.</p>
      </>
    ),
  },
  {
    id: 'world-events',
    group: FORTUNE,
    title: 'Happenings of the whole world',
    icon: 'globe',
    summary: 'The comet, the Horde, the Crash, the crises of great powers and the world wars.',
    terms: ['horde', 'mongols', 'genghis', 'comet', 'crash', 'depression', 'world war', 'great powers', 'crisis'],
    see: ['rule:events', 'rule:plague', 'rule:modifiers'],
    body: () => (
      <ul>
        <li>
          <strong>The comet</strong> returns every 76 years or so, and every realm must decide what it portends.
        </li>
        <li>
          <strong>The Horde.</strong> Between 1203 and 1240, a nomad of the eastern steppe may unite the tribes: its
          realm becomes a horde, stronger than any army of its day and hungry for conquest, and every realm it comes to
          border hears of it.
        </li>
        <li>
          <strong>The Crash.</strong> From 1929, once the world has stock exchanges enough, they crash together: every
          realm with one falls into depression and must choose how to meet it.
        </li>
        <li>
          <strong>Crises.</strong> From 1905, a generation after the last world war, two great powers (the eight richest
          independent realms) that share a border may come to a crisis, about once in ten years; the stronger marches,
          and their alliances decide whether the world follows. The player is never made to strike first.
        </li>
        <li>
          <strong>World wars.</strong> From 1900, a war with three great powers or more on each side becomes a world
          war, at least forty years after the last: it is named, every realm in it goes over to total war, and each side
          calls its allies in turn.
        </li>
      </ul>
    ),
  },
  {
    id: 'decisions',
    group: FORTUNE,
    title: 'Proclaiming a nation',
    icon: 'stone-tower',
    summary: 'A realm that holds a nation’s heartland may take its name, rank and arms.',
    terms: ['decision', 'nation', 'proclaim', 'unify', 'form'],
    see: ['cat:nations', 'rule:claims'],
    body: () => (
      <p>
        Great <T to="cat:nations">nations</T> wait to be proclaimed: Spain, Great Britain, Italy, Germany, Russia, the
        Roman Empire restored and others. A realm of the right people (or faith) that holds enough of a nation’s
        heartland, itself or through its vassals, may proclaim it once its time has come: the realm takes the nation’s
        name, rank and arms, and claims the rest of its land. Only one realm may proclaim each nation.
      </p>
    ),
  },
  {
    id: 'espionage',
    group: FORTUNE,
    title: 'Spies and plots',
    icon: 'spy',
    summary: `The spymaster builds a network in one foreign realm (0 to ${NETWORK_MAX}), then spends it on plots.`,
    terms: ['spy', 'spies', 'network', 'plot', 'intrigue', 'assassinate', 'sabotage', 'exposure'],
    see: ['cat:plots', 'seat:spymaster', 'rule:opinion'],
    body: () => (
      <>
        <p>
          A spymaster set to build a network works agents into one foreign realm. Each month the network grows by 2 +
          0.3 per point of the spymaster’s intrigue, +1 in a neighbour and −1 in a realm more than 2,500 km away, less
          0.15 per point of intrigue of a rival spymaster watching their realm (at least 0.5). Networks elsewhere wither
          by 2 a month.
        </p>
        <p>
          A network is spent on <T to="cat:plots">plots</T>, each at a price in gold and network strength. The chance of
          success grows with a network to spare and a better spymaster than theirs, and falls if theirs watches the
          realm. A plot may be traced back (twice as likely if it fails), and the victim does not forget.
        </p>
      </>
    ),
  },
];

export const RULE_ENTRIES: Entry[] = RULES.map((r) => ({ ...r, id: `rule:${r.id}`, category: 'rules' }));
