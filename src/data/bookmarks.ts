/** Featured starts on the choose-your-realm screen for 15 September 1066. */
export type Difficulty = 'Easy' | 'Moderate' | 'Hard' | 'Very hard';

export interface Bookmark {
  tag: string;
  difficulty: Difficulty;
  blurb: string;
}

export const SCENARIO_INTRO =
  'Edward the Confessor is dead, and three men claim the crown of England. Far to the east, Turkish horsemen ride against Byzantium, and the Song emperors rule the richest realm on earth.';

export const BOOKMARKS: Bookmark[] = [
  {
    tag: 'ENG',
    difficulty: 'Hard',
    blurb:
      "Harold Godwinson was crowned in January. Now Harald Hardrada's fleet has reached the north, and Duke William gathers his ships across the Channel. Three claimants, one crown.",
  },
  {
    tag: 'NRM',
    difficulty: 'Moderate',
    blurb:
      'William the Bastard holds a promise of the English crown and a papal banner. Normandy is small, and a vassal of France, but its knights are the finest in Christendom.',
  },
  {
    tag: 'NRW',
    difficulty: 'Hard',
    blurb:
      'Harald Hardrada, the last great Viking king, has sailed for England with three hundred ships. Win the north, or die in the attempt.',
  },
  {
    tag: 'FRA',
    difficulty: 'Hard',
    blurb:
      'The boy-king Philip I reigns from Paris, while his vassals in Normandy, Aquitaine and Flanders hold far more land than he does.',
  },
  {
    tag: 'HRE',
    difficulty: 'Moderate',
    blurb:
      'Henry IV, sixteen years old, rules the largest realm in Christendom. His dukes are restless, and a reforming papacy is about to challenge the crown itself.',
  },
  {
    tag: 'BYZ',
    difficulty: 'Moderate',
    blurb:
      'Constantinople is still the greatest city of the Christian world. But the treasury is thin, the army neglected, and the Turks are raiding deep into Anatolia.',
  },
  {
    tag: 'SEL',
    difficulty: 'Easy',
    blurb:
      "Alp Arslan's Turks rule from Khorasan to Baghdad. Rich Anatolia and the Fatimid south both lie within reach of his horsemen.",
  },
  {
    tag: 'FAT',
    difficulty: 'Moderate',
    blurb:
      'The Ismaili caliphs rule from Cairo, but famine and feuding regiments are tearing Egypt apart. Restore the caliphate, or watch it fall.',
  },
  {
    tag: 'RUS',
    difficulty: 'Moderate',
    blurb:
      "Iziaslav rules from golden Kiev, but his brothers hold the other great cities of the Rus', and the Cumans have come to the southern steppe.",
  },
  {
    tag: 'CAS',
    difficulty: 'Hard',
    blurb:
      "Sancho II received Castile when his father's kingdom was split among three sons. Unite the Christian north, then turn on the rich taifas of al-Andalus.",
  },
  {
    tag: 'VEN',
    difficulty: 'Very hard',
    blurb:
      'A city of merchants built on a lagoon. Venice has no great army, but its galleys carry the trade between Byzantium and the Latin west.',
  },
  {
    tag: 'SNG',
    difficulty: 'Easy',
    blurb:
      'The Song empire is the most populous and inventive state on earth, yet the Liao and the Western Xia press hard on its northern frontier.',
  },
  {
    tag: 'CHO',
    difficulty: 'Moderate',
    blurb:
      'The Chola kings rule the south of India and command the sea lanes to Srivijaya. Hold off the Chalukyas and keep the ocean trade flowing.',
  },
  {
    tag: 'GHA',
    difficulty: 'Very hard',
    blurb:
      'Ghana grows rich on the gold of the western Sahel. But in the desert to the north, the Almoravids are rising.',
  },
];
