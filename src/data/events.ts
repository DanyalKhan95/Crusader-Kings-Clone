/**
 * Events: things that happen to a realm, with a choice of what to do about them. Each has a mean
 * time to happen (in years) for a realm that meets its conditions; some are fired by world events
 * instead (pestilence, the Horde, the crash). Conditions and choices ask the engine (sim/events.ts)
 * through an `EventContext`, so this file stays data. Texts fill in {realm} (its full name), {land}
 * (its short name), {adj}, {ruler}, {capital}, {province}, {other}, {faith} and {plague}.
 */
import type { IconName } from '../assets/icons';
import type { Country, EstateId, GameState, Skill } from '../sim/types';

/** What conditions may ask about a realm. */
export interface EventContext {
  state: GameState;
  c: Country;
  year: number;
  /** the realm's era: 0 medieval … 5 contemporary */
  era: number;
  knows(tech: string): boolean;
  atWar(): boolean;
  /** −100 … 100 */
  loyalty(e: EstateId): number;
  /** the estate's share of power, 0 … 1 */
  power(e: EstateId): number;
  rulerAge(): number;
  rulerSkill(s: Skill): number;
  rulerIs(trait: string): boolean;
  faithFamily(): string;
  cultureGroup(): string;
  hasModifier(id: string): boolean;
  /** how many of the realm's own provinces follow a faith */
  provincesOfFaith(faith: string): number;
  /** a province of the realm that passes the test, the richer the likelier; 0 if none */
  pickProvince(test?: (id: number) => boolean): number;
  /** a neighbouring independent realm that passes the test; 0 if none */
  pickNeighbour(test?: (index: number) => boolean): number;
  terrain(id: number): string;
  /** what the realm thinks of another */
  opinionOf(other: number): number;
  /** heresies of the realm's own faith that its provinces follow */
  heresiesHere(): string[];
}

export type SpecialId =
  | 'embrace_reform'
  | 'anglican'
  | 'constitution'
  | 'republic'
  | 'revolt_commons'
  | 'burn_heretics'
  | 'scholar'
  | 'general'
  | 'loan'
  | 'privilege_nobles';

export interface EventEffects {
  /** months of the realm's income gained, or spent when negative */
  gold?: number;
  stability?: number;
  legitimacy?: number;
  warExhaustion?: number;
  /** share of the full levy gained, or lost when negative */
  manpower?: number;
  /** development of the event's province */
  dev?: number;
  /** how the estates remember it */
  mood?: Partial<Record<EstateId, number>>;
  /** a modifier on the realm (see data/modifiers.ts) */
  modifier?: string;
  /** years it lasts, if not its usual span */
  years?: number;
  /** a modifier taken away */
  remove?: string;
  /** months of research gained in every track */
  research?: number;
  /** the chance that the ruler dies */
  death?: number;
  /** what the other realm will think of us */
  opinion?: number;
  /** a claim on a province of the other realm that borders ours */
  claim?: boolean;
  /** something more, done in code (see sim/events.ts) */
  run?: SpecialId;
}

export interface EventOption {
  text: string;
  effects: EventEffects;
  /** how much the AI likes it (1 if not given) */
  ai?: number | ((ctx: EventContext) => number);
  /** offered only when this holds */
  when?: (ctx: EventContext) => boolean;
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  icon: IconName;
  /** mean years until it happens to a realm that meets its conditions; 0: only when the world fires it */
  mtth: number;
  /** happens to a realm only once */
  once?: boolean;
  /** years before it may happen to the same realm again (20 if not given) */
  cooldown?: number;
  when: (ctx: EventContext) => boolean;
  /** the province it is about; 0 means it cannot happen now */
  province?: (ctx: EventContext) => number;
  /** another realm it is about; 0 means it cannot happen now */
  other?: (ctx: EventContext) => number;
  options: EventOption[];
}

const CHRISTIAN_OR_BUDDHIST = new Set(['christian', 'buddhist']);
const OLD_REGIMES = new Set(['feudal', 'absolute', 'imperial', 'clan', 'theocracy']);

export const EVENTS: EventDef[] = [
  // ── The land ────────────────────────────────────────────────────
  {
    id: 'good_harvest',
    title: 'A Bountiful Harvest',
    text: 'The harvest in {province} is the richest anyone can remember. The granaries overflow, the herds are fat, and the peasants bless the crown.',
    icon: 'wheat',
    mtth: 18,
    cooldown: 12,
    when: (x) => !x.atWar(),
    province: (x) => x.pickProvince((id) => ['plains', 'farmland', 'hills', 'steppe'].includes(x.terrain(id))),
    options: [
      { text: 'Let the people feast', effects: { modifier: 'bountiful_harvest' }, ai: 2 },
      { text: 'Sell the surplus abroad', effects: { gold: 3, mood: { burghers: 10 } } },
    ],
  },
  {
    id: 'famine',
    title: 'Famine',
    text: 'Rain fell all summer and the grain rotted in the fields. In {province} the poor eat bark and nettles, and the roads fill with beggars making for the towns.',
    icon: 'grain',
    mtth: 25,
    cooldown: 20,
    when: (x) => x.era <= 3,
    province: (x) => x.pickProvince(),
    options: [
      {
        text: 'Open the royal granaries',
        effects: { gold: -3, modifier: 'famine', years: 1, mood: { commons: 15 } },
        ai: (x) => (x.c.gold > 100 ? 2 : 0.5),
      },
      { text: 'Let every lord feed his own', effects: { modifier: 'famine', mood: { commons: -10, nobles: 5 } } },
    ],
  },
  {
    id: 'great_fire',
    title: 'A Great Fire',
    text: 'A fire that started in a baker’s shop has burnt half of {province}. Churches, warehouses and thousands of homes are ash, and the townsfolk sleep in the fields.',
    icon: 'fire',
    mtth: 40,
    cooldown: 30,
    when: () => true,
    province: (x) => x.pickProvince((id) => x.state.provinces[id].dev >= 8),
    options: [
      { text: 'Rebuild at the crown’s cost', effects: { gold: -4, mood: { burghers: 10, commons: 5 } }, ai: 2 },
      { text: 'The townsfolk must rebuild it themselves', effects: { dev: -1, mood: { burghers: -10 } } },
    ],
  },
  {
    id: 'earthquake',
    title: 'The Earth Shakes',
    text: 'An earthquake has struck {province}. Churches have fallen on the faithful at prayer, and whole villages lie in ruins.',
    icon: 'earth-crack',
    mtth: 80,
    cooldown: 40,
    when: () => true,
    province: (x) => x.pickProvince((id) => x.terrain(id) === 'mountains' || x.terrain(id) === 'hills'),
    options: [
      { text: 'Rebuild with the crown’s gold', effects: { gold: -3, mood: { commons: 10 } }, ai: 2 },
      { text: 'They must fend for themselves', effects: { dev: -1, mood: { commons: -10 } } },
    ],
  },
  {
    id: 'silver_mine',
    title: 'Silver in the Hills',
    text: 'Miners in {province} have struck a rich vein of silver. The steward says that the crown’s share alone could pay for an army.',
    icon: 'gold-mine',
    mtth: 60,
    once: true,
    when: () => true,
    province: (x) => x.pickProvince((id) => x.terrain(id) === 'mountains' || x.terrain(id) === 'hills'),
    options: [
      { text: 'Work it for the crown', effects: { modifier: 'silver_mine', dev: 1 }, ai: 3 },
      { text: 'Grant it to the lords, for their loyalty', effects: { gold: 2, mood: { nobles: 20 } } },
    ],
  },
  {
    id: 'bandits',
    title: 'Brigands on the Roads',
    text: 'Discharged soldiers and runaway serfs have formed bands of outlaws in the woods around {province}. No merchant travels without an armed escort.',
    icon: 'bandit',
    mtth: 12,
    cooldown: 15,
    when: (x) => x.c.stability <= 0 || x.c.warExhaustion >= 5,
    province: (x) => x.pickProvince(),
    options: [
      { text: 'Hunt them down', effects: { gold: -2, mood: { burghers: 5 } }, ai: 2 },
      { text: 'Pardon any who join the army', effects: { manpower: 0.1, modifier: 'brigandage', years: 1 } },
      { text: 'We have greater worries', effects: { modifier: 'brigandage' }, ai: 0.5 },
    ],
  },
  // ── The estates ─────────────────────────────────────────────────
  {
    id: 'peasant_unrest',
    title: 'Unrest in the Countryside',
    text: 'The peasants of {province} have driven out the tax collectors and burnt the steward’s barns. They will pay nothing more, they say, until the crown hears their grievances.',
    icon: 'angry-eyes',
    mtth: 8,
    cooldown: 12,
    when: (x) => x.loyalty('commons') < -10,
    province: (x) => x.pickProvince(),
    options: [
      { text: 'Hear their grievances', effects: { gold: -2, legitimacy: -3, mood: { commons: 20 } }, ai: 2 },
      { text: 'Send in the soldiers', effects: { legitimacy: 2, mood: { commons: -15, nobles: 5 } } },
    ],
  },
  {
    id: 'noble_feud',
    title: 'A Feud between the Lords',
    text: 'Two great lords of {land} are at war with each other over an inheritance. Their men burn each other’s villages, and each demands that the crown take his side.',
    icon: 'crossed-swords',
    mtth: 15,
    cooldown: 15,
    when: (x) => x.power('nobles') >= 0.25 && x.era <= 2,
    options: [
      {
        text: 'Summon both to court and judge between them',
        effects: { gold: -1, legitimacy: 3, mood: { nobles: 10 } },
        ai: 2,
      },
      { text: 'Let them fight it out', effects: { stability: -1, mood: { nobles: -5 } }, ai: 0.5 },
      { text: 'Seize the disputed lands for the crown', effects: { gold: 3, legitimacy: 3, mood: { nobles: -20 } } },
    ],
  },
  {
    id: 'merchants_charter',
    title: 'The Merchants Ask for a Charter',
    text: 'The merchants of {province} offer the crown a handsome sum for a charter: the right to govern their own town, and to hold a market free of tolls.',
    icon: 'contract',
    mtth: 20,
    cooldown: 25,
    when: (x) => x.power('burghers') >= 0.12,
    province: (x) => x.pickProvince((id) => (x.state.provinces[id].buildings.market ?? 0) > 0),
    options: [
      { text: 'Grant the charter', effects: { gold: 4, mood: { burghers: 15, nobles: -5 } }, ai: 2 },
      { text: 'The crown’s rights are not for sale', effects: { legitimacy: 2, mood: { burghers: -10 } } },
    ],
  },
  {
    id: 'succession_crisis',
    title: 'A Disputed Succession',
    text: 'Some of the great lords doubt the right of {ruler} to the throne, and talk in corners of another candidate. They could be won over, at a price.',
    icon: 'throne-king',
    mtth: 1,
    cooldown: 15,
    when: (x) => x.state.day - x.c.rulerSince < 365 && x.c.legitimacy < 40 && x.c.laws.succession !== 'republic',
    options: [
      { text: 'Buy their loyalty', effects: { gold: -4, legitimacy: 5, mood: { nobles: 15 } }, ai: 2 },
      { text: 'Grant the nobility privileges', effects: { run: 'privilege_nobles' } },
      { text: 'Arrest the ringleaders', effects: { stability: -1, legitimacy: 5, mood: { nobles: -20 } } },
    ],
  },
  {
    id: 'corruption',
    title: 'Corruption at Court',
    text: 'Auditors have found that officials of the treasury have been selling offices and pocketing the taxes of {province}.',
    icon: 'receive-money',
    mtth: 20,
    cooldown: 20,
    when: (x) => x.c.legitimacy < 50 || x.c.stability < 1,
    province: (x) => x.pickProvince(),
    options: [
      { text: 'Hang the guilty', effects: { legitimacy: 5, mood: { nobles: -10 } }, ai: 2 },
      { text: 'Quietly replace them', effects: { gold: -1 }, ai: 2 },
      { text: 'Look the other way', effects: { modifier: 'corruption', mood: { nobles: 5 } } },
    ],
  },
  // ── The court ───────────────────────────────────────────────────
  {
    id: 'tournament',
    title: 'A Great Tournament',
    text: 'The knights of {land} beg the crown to hold a great tournament at {capital}, with jousts and a melee, and a feast to follow.',
    icon: 'medieval-pavilion',
    mtth: 15,
    cooldown: 12,
    when: (x) => x.era <= 1 && x.faithFamily() === 'christian' && OLD_REGIMES.has(x.c.gov),
    options: [
      { text: 'Hold the tournament', effects: { gold: -2, modifier: 'martial_fervour', mood: { nobles: 10 } }, ai: 2 },
      { text: 'Such follies are for idle men', effects: { mood: { nobles: -5, clergy: 5 } } },
    ],
  },
  {
    id: 'pilgrimage',
    title: 'A Pilgrimage',
    text: '{ruler} wishes to go on pilgrimage to the holy places of the {faith} faith, to pray for the realm and to atone for the sins of the crown.',
    icon: 'prayer',
    mtth: 25,
    cooldown: 30,
    when: (x) => !x.atWar() && x.rulerAge() >= 20 && x.rulerAge() <= 60 && x.era <= 2,
    options: [
      {
        text: 'Go, with a great retinue',
        effects: { gold: -3, legitimacy: 10, mood: { clergy: 10 }, death: 0.05 },
        ai: (x) => (x.rulerIs('pious') ? 3 : 1),
      },
      { text: 'Send rich gifts instead', effects: { gold: -2, legitimacy: 3, mood: { clergy: 5 } }, ai: 1.5 },
    ],
  },
  {
    id: 'ruler_ill',
    title: 'The Ruler Falls Ill',
    text: '{ruler} has taken to bed with a fever the physicians cannot name. The court whispers about the succession.',
    icon: 'heart-plus',
    mtth: 25,
    cooldown: 10,
    when: (x) => x.rulerAge() >= 45,
    options: [
      { text: 'Summon the best physicians', effects: { gold: -2, death: 0.1 }, ai: 2 },
      { text: 'Trust in prayer', effects: { mood: { clergy: 5 }, death: 0.25 } },
    ],
  },
  {
    id: 'scholar',
    title: 'A Scholar Seeks Patronage',
    text: 'A renowned scholar has come to {capital} and asks for the crown’s patronage. They say this is a mind that has mastered the works of the ancients and can read the stars.',
    icon: 'graduate-cap',
    mtth: 20,
    cooldown: 20,
    when: () => true,
    options: [
      { text: 'Welcome the scholar to court', effects: { gold: -1, modifier: 'scholars', run: 'scholar' }, ai: 2 },
      { text: 'We have no use for stargazers', effects: {} },
    ],
  },
  {
    id: 'military_reform',
    title: 'A Reforming Officer',
    text: 'A young officer has written a treatise on drill, supply and the new weapons, and asks for a command to prove the ideas in it.',
    icon: 'swords-emblem',
    mtth: 30,
    cooldown: 30,
    when: (x) => x.era >= 1,
    options: [
      {
        text: 'Give the upstart a command',
        effects: { modifier: 'military_reforms', run: 'general', mood: { nobles: -5 } },
        ai: 2,
      },
      { text: 'The old ways have served us well', effects: { mood: { nobles: 5 } } },
    ],
  },
  {
    id: 'golden_age',
    title: 'A Golden Age',
    text: 'Painters, poets and builders flock to {capital}, where the crown’s patronage has made a new Athens. They ask only for more of it.',
    icon: 'laurel-crown',
    mtth: 40,
    once: true,
    when: (x) => x.c.stability >= 2 && x.c.legitimacy >= 70 && !x.atWar() && x.era >= 1,
    options: [
      { text: 'Spend lavishly on the arts', effects: { gold: -4, modifier: 'golden_age' }, ai: 2 },
      { text: 'Spend it on the army instead', effects: { gold: -4, modifier: 'military_reforms' } },
    ],
  },
  // ── Neighbours ──────────────────────────────────────────────────
  {
    id: 'border_incident',
    title: 'A Border Incident',
    text: 'Soldiers of {other} have crossed the border, burnt a village and driven off its cattle. Their ruler says it was the work of brigands.',
    icon: 'flag-objective',
    mtth: 20,
    cooldown: 20,
    when: (x) => !x.c.liege,
    other: (x) => x.pickNeighbour((o) => x.opinionOf(o) < 0),
    options: [
      { text: 'Demand satisfaction', effects: { claim: true, opinion: -15 }, ai: 2 },
      { text: 'Let it pass', effects: { legitimacy: -3 } },
    ],
  },
  {
    id: 'embassy',
    title: 'An Embassy',
    text: 'Envoys from {other} have arrived at {capital} with gifts and assurances of their ruler’s friendship.',
    icon: 'present',
    mtth: 25,
    cooldown: 20,
    when: (x) => !x.c.liege,
    other: (x) => x.pickNeighbour((o) => x.opinionOf(o) > 10),
    options: [
      { text: 'Receive them with honour', effects: { gold: 1, opinion: 15 }, ai: 3 },
      { text: 'Send them away', effects: { legitimacy: 2, opinion: -20 } },
    ],
  },
  // ── Faith ───────────────────────────────────────────────────────
  {
    id: 'heretic_preacher',
    title: 'A Heretic Preacher',
    text: 'A preacher in {province} teaches that the {faith} church has grown rich and corrupt, and crowds leave the churches to hear the sermons.',
    icon: 'torch',
    mtth: 8,
    cooldown: 10,
    when: (x) => x.heresiesHere().length > 0,
    province: (x) => {
      const here = x.heresiesHere();
      return x.pickProvince((id) => here.includes(x.state.provinces[id].religion ?? ''));
    },
    options: [
      {
        text: 'Burn the preacher and the followers',
        effects: { run: 'burn_heretics', mood: { clergy: 10, commons: -10 } },
        ai: (x) => (x.c.laws.tolerance === 0 ? 3 : 1.5),
      },
      { text: 'Hold a public debate', effects: { gold: -1, mood: { clergy: -5, burghers: 5 } } },
      {
        text: 'Leave them in peace',
        effects: { mood: { commons: 5, clergy: -10 } },
        ai: (x) => (x.c.laws.tolerance === 2 ? 3 : 0.5),
      },
    ],
  },
  {
    id: 'monastery',
    title: 'The Monks Ask for Land',
    text: 'The abbot of a famous house asks the crown for land in {province} to found a new monastery, where the monks will pray for the realm and teach the young.',
    icon: 'church',
    mtth: 25,
    cooldown: 25,
    when: (x) => CHRISTIAN_OR_BUDDHIST.has(x.faithFamily()) && x.era <= 1,
    province: (x) => x.pickProvince(),
    options: [
      { text: 'Grant the land', effects: { gold: -1, research: 2, mood: { clergy: 15 } }, ai: 2 },
      { text: 'The crown needs its lands', effects: { mood: { clergy: -10 } } },
    ],
  },
  {
    id: 'reformation',
    title: 'The Reformation',
    text: 'Preachers in {province} teach that salvation comes by faith alone, that the Pope is no vicar of Christ, and that the church’s lands belong to the people. Printed pamphlets spread their words faster than the bishops can burn them. The realm looks to {ruler}.',
    icon: 'book-cover',
    mtth: 1,
    once: true,
    when: (x) => x.c.religion === 'catholic' && x.provincesOfFaith('protestant') + x.provincesOfFaith('reformed') > 0,
    province: (x) => x.pickProvince((id) => ['protestant', 'reformed'].includes(x.state.provinces[id].religion ?? '')),
    options: [
      { text: 'Defend the old faith', effects: { modifier: 'counter_reformation', mood: { clergy: 10 } }, ai: 3 },
      {
        text: 'Embrace the Reformation',
        effects: { run: 'embrace_reform' },
        // Northern crowns, worldly rulers and realms already much turned are drawn to it.
        ai: (x) =>
          0.3 +
          (x.cultureGroup() === 'germanic' || x.cultureGroup() === 'norse' ? 1.5 : 0) +
          (x.rulerIs('cynical') || x.rulerIs('ambitious') ? 0.8 : 0) -
          (x.rulerIs('pious') ? 0.3 : 0) +
          Math.min(2, (x.provincesOfFaith('protestant') + x.provincesOfFaith('reformed')) / 6),
      },
      { text: 'Let each follow his conscience', effects: { modifier: 'religious_peace' } },
    ],
  },
  {
    id: 'kings_great_matter',
    title: 'The King’s Great Matter',
    text: '{ruler} wants the royal marriage annulled, and the Pope refuses. Some at court say the crown needs no Pope: it should be supreme head of the church in {land}, and the wealth of the monasteries should be its own.',
    icon: 'crown',
    mtth: 3,
    once: true,
    when: (x) =>
      x.c.religion === 'catholic' && x.c.culture === 'english' && x.year >= 1527 && x.year < 1600 && !x.c.liege,
    options: [
      { text: 'Break with Rome', effects: { run: 'anglican' }, ai: 3 },
      { text: 'Submit to the Pope', effects: { legitimacy: -10, mood: { clergy: 10 } } },
    ],
  },
  // ── Ideas ───────────────────────────────────────────────────────
  {
    id: 'printing_press',
    title: 'The Printing Press',
    text: 'A craftsman has set up a press in {capital} that prints in a day what a scribe copies in a year. Books grow cheap, and so do pamphlets against the church and the crown.',
    icon: 'book-cover',
    mtth: 2,
    once: true,
    when: (x) => x.knows('printing_press'),
    options: [
      { text: 'Let the presses run free', effects: { modifier: 'printing_presses' }, ai: 2 },
      { text: 'License the printers', effects: { modifier: 'licensed_presses' }, ai: 1 },
    ],
  },
  {
    id: 'philosophers',
    title: 'The Philosophers',
    text: 'The salons of {capital} talk of reason, natural rights and the separation of powers. A famous philosopher offers to correspond with {ruler}.',
    icon: 'candle-light',
    mtth: 3,
    once: true,
    when: (x) => x.knows('enlightenment'),
    options: [
      { text: 'Invite the philosopher to court', effects: { modifier: 'enlightened_court' }, ai: 2 },
      { text: 'Ban the books', effects: { legitimacy: 3, mood: { clergy: 10, burghers: -10 } } },
    ],
  },
  {
    id: 'national_awakening',
    title: 'A National Awakening',
    text: 'Poets, historians and newspapers teach the {adj} people that they are one nation, with a language, a history and a destiny of their own.',
    icon: 'flying-flag',
    mtth: 5,
    once: true,
    when: (x) => x.knows('nationalism'),
    options: [
      { text: 'Embrace the national cause', effects: { modifier: 'national_awakening' }, ai: 2 },
      { text: 'The crown stands above nations', effects: { legitimacy: 3, mood: { nobles: 10 } } },
    ],
  },
  {
    id: 'revolution',
    title: 'Revolution!',
    text: 'The people of {capital} have stormed the prisons and raised barricades in the streets. They demand a constitution, an assembly of the nation and an end to privilege. The troops are wavering.',
    icon: 'guillotine',
    mtth: 10,
    cooldown: 30,
    when: (x) =>
      x.knows('popular_sovereignty') &&
      OLD_REGIMES.has(x.c.gov) &&
      !x.c.liege &&
      (x.loyalty('commons') < 0 || x.loyalty('burghers') < 0 || x.c.stability < 0),
    options: [
      { text: 'Grant a constitution', effects: { run: 'constitution' }, ai: 2 },
      { text: 'Crush the revolution', effects: { run: 'revolt_commons' }, ai: (x) => (x.rulerIs('cruel') ? 3 : 1.5) },
      { text: 'Proclaim the republic', effects: { run: 'republic' }, ai: 0.5 },
    ],
  },
  // ── Industry ────────────────────────────────────────────────────
  {
    id: 'factories',
    title: 'The Age of Factories',
    text: 'Steam engines drive the new mills of {province}, and the countryside empties into the smoky towns. The mill owners grow rich; their workers live twelve to a room.',
    icon: 'factory',
    mtth: 2,
    once: true,
    when: (x) => x.knows('steam_power'),
    province: (x) => x.pickProvince(),
    options: [
      { text: 'Let the mill owners build', effects: { modifier: 'industrial_boom' }, ai: 2 },
      { text: 'Protect the workers', effects: { modifier: 'factory_acts' } },
    ],
  },
  {
    id: 'railway_mania',
    title: 'Railway Mania',
    text: 'Every town in {land} wants a railway, and every banker a railway company. The ministers ask whether the state should build the lines itself.',
    icon: 'steam-locomotive',
    mtth: 3,
    once: true,
    when: (x) => x.knows('railways'),
    options: [
      { text: 'The state will build them', effects: { gold: -6, modifier: 'railway_boom' }, ai: 2 },
      { text: 'Leave it to private capital', effects: { modifier: 'railway_speculation' } },
    ],
  },
  {
    id: 'workers',
    title: 'The Workers’ Movement',
    text: 'Strikes have shut the mines and mills of {province}. The workers demand an eight-hour day and the right to organise; the owners demand that the army clear the streets.',
    icon: 'fist',
    mtth: 15,
    cooldown: 30,
    when: (x) => x.knows('socialism') && x.c.gov !== 'communist',
    province: (x) => x.pickProvince(),
    options: [
      { text: 'Legalise the unions', effects: { modifier: 'trade_unions' }, ai: 2 },
      { text: 'Send in the troops', effects: { modifier: 'repression' } },
    ],
  },
  {
    id: 'space_race',
    title: 'The Space Race',
    text: 'The scientists of {land} say they can put a man into orbit, and perhaps on the Moon, if the nation will pay for it.',
    icon: 'rocket',
    mtth: 5,
    once: true,
    when: (x) => x.knows('big_science'),
    options: [
      { text: 'To the stars!', effects: { gold: -12, modifier: 'space_age' }, ai: 2 },
      { text: 'We have troubles enough on Earth', effects: { mood: { commons: 5 } } },
    ],
  },
  // ── Fired by the world ──────────────────────────────────────────
  {
    id: 'plague_arrives',
    title: 'Pestilence',
    text: '{plague} has reached {province}. The sick die within days; whole villages are emptied, and the living flee, carrying the sickness with them.',
    icon: 'plague-doctor-profile',
    mtth: 0,
    cooldown: 0,
    when: () => true,
    options: [
      { text: 'Close the gates and the ports', effects: { modifier: 'quarantine' }, ai: 2 },
      { text: 'Order processions and prayers', effects: { legitimacy: 2, mood: { clergy: 10 } } },
      { text: 'Carry on as ever', effects: { mood: { burghers: 5 } }, ai: 0.5 },
    ],
  },
  {
    id: 'horde_arrives',
    title: 'The Horde',
    text: 'Riders from the east bring terrible news: {other} has united the peoples of the steppe, and the Horde is on the move. Cities that resist are razed; those that submit pay tribute.',
    icon: 'bow-arrow',
    mtth: 0,
    once: true,
    when: () => true,
    options: [
      { text: 'Send envoys with rich gifts', effects: { gold: -4, opinion: 40 }, ai: 1 },
      { text: 'Call the realm to arms', effects: { modifier: 'call_to_arms' }, ai: 2 },
    ],
  },
  {
    id: 'comet',
    title: 'A Comet in the Sky',
    text: 'A star with a fiery tail has hung over {capital} night after night. The astrologers cannot agree what it means, and the people wait for the crown to tell them.',
    icon: 'comet-spark',
    mtth: 0,
    cooldown: 0,
    when: (x) => x.era <= 3,
    options: [
      { text: 'It heralds the triumph of the crown', effects: { modifier: 'good_omen' }, ai: 2 },
      { text: 'Order prayers and penance', effects: { gold: -1, mood: { clergy: 10 } } },
    ],
  },
  {
    id: 'crash',
    title: 'The Crash',
    text: 'The stock exchange has crashed. Banks fail one after another, factories close their gates, and millions are out of work. The ministers are divided on what to do.',
    icon: 'receive-money',
    mtth: 0,
    once: true,
    when: () => true,
    options: [
      { text: 'Balance the budget', effects: { modifier: 'austerity' }, ai: 1 },
      { text: 'Put the people to work', effects: { gold: -6, modifier: 'public_works' }, ai: 2 },
      { text: 'Protect our industries', effects: { modifier: 'tariffs' }, ai: 1 },
    ],
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// ── Pestilence ────────────────────────────────────────────────────

/** While pestilence rages in a province, it pays and serves this much less. */
export const PLAGUE_PENALTY = 0.5;

export interface PlagueDef {
  id: string;
  /** as it reads in a sentence, e.g. "the Black Death" */
  name: string;
  /** the years in which it may break out */
  from: number;
  to: number;
  /** monthly chance that it breaks out once its time has come */
  chance: number;
  /** where it breaks out: [lon, lat, radius in km] */
  origin: [number, number, number];
  /** share of a province's development it kills */
  severity: number;
  /** monthly chance that it passes to each neighbouring province */
  spread: number;
  /** months it rages in a province */
  months: [number, number];
  /** years a province is spared once it has passed */
  immunity: number;
  /** it follows this one, if it came */
  after?: string;
}

export const PLAGUES: PlagueDef[] = [
  {
    id: 'black_death',
    name: 'the Black Death',
    from: 1340,
    to: 1370,
    chance: 1 / 30,
    origin: [35.4, 45.1, 350],
    severity: 0.22,
    spread: 0.32,
    months: [6, 12],
    immunity: 12,
  },
  {
    id: 'second_pestilence',
    name: 'the Second Pestilence',
    from: 1360,
    to: 1390,
    chance: 1 / 60,
    origin: [8, 47, 1200],
    severity: 0.08,
    spread: 0.22,
    months: [4, 9],
    immunity: 15,
    after: 'black_death',
  },
  {
    id: 'great_plague',
    name: 'the Great Plague',
    from: 1629,
    to: 1680,
    chance: 1 / 120,
    origin: [9.2, 45.5, 800],
    severity: 0.06,
    spread: 0.2,
    months: [4, 10],
    immunity: 20,
  },
  {
    id: 'cholera',
    name: 'Cholera',
    from: 1817,
    to: 1850,
    chance: 1 / 60,
    origin: [88.4, 22.6, 800],
    severity: 0.03,
    spread: 0.25,
    months: [3, 6],
    immunity: 20,
  },
  {
    id: 'spanish_flu',
    name: 'the Spanish Flu',
    from: 1918,
    to: 1925,
    chance: 1 / 6,
    origin: [2.3, 48.8, 1500],
    severity: 0.03,
    spread: 0.45,
    months: [2, 5],
    immunity: 10,
  },
];

export const PLAGUE_BY_ID: Record<string, PlagueDef> = Object.fromEntries(PLAGUES.map((p) => [p.id, p]));

/** Years in which Halley’s comet was seen, and the month it was brightest. */
export const COMETS: [number, number][] = [
  [1145, 4],
  [1222, 9],
  [1301, 10],
  [1378, 11],
  [1456, 6],
  [1531, 8],
  [1607, 10],
  [1682, 9],
  [1759, 3],
  [1835, 11],
  [1910, 4],
  [1986, 2],
];

/** Names of the wars of the great powers of the modern age, in order. */
export const WORLD_WAR_NAMES = ['the Great War', 'the Second World War', 'the Third World War', 'the Fourth World War'];
