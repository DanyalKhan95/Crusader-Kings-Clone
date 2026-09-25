/**
 * Historical terrain overrides: modern satellite colours show today's farmland, but in 1066 these
 * were grasslands, marshes or river-fed breadbaskets. Polygons are [lon, lat] rings. Zones only
 * repaint lowland pixels (they never turn mountains or hills into something else).
 */
import type { Terrain } from '../steps/attributes.ts';

export interface TerrainZone {
  name: string;
  terrain: Terrain;
  ring: [number, number][];
}

export const TERRAIN_ZONES: TerrainZone[] = [
  {
    name: 'Pontic–Caspian steppe',
    terrain: 'steppe',
    ring: [
      [27.5, 47.0], [30.5, 48.4], [34, 49.3], [37.5, 50.3], [41, 51.0], [45, 51.8], [50, 52.2],
      [55, 51.8], [55, 49], [51, 46.8], [47.5, 45.8], [44, 45.2], [40, 45.8], [38, 46.9],
      [35, 46.2], [33.5, 45.9], [31, 46.4], [29.5, 45.3],
    ],
  },
  {
    name: 'Kazakh steppe',
    terrain: 'steppe',
    ring: [[55, 52], [62, 54.5], [70, 55], [78, 54], [84, 51], [81, 47.5], [74, 46], [66, 46.5], [58, 47], [55, 49]],
  },
  {
    name: 'Mongolian steppe',
    terrain: 'steppe',
    ring: [[92, 50.5], [100, 51.5], [110, 50.5], [118, 50], [122, 47], [117, 43], [108, 42.5], [100, 43.5], [92, 46]],
  },
  {
    name: 'Great Plains',
    terrain: 'steppe',
    ring: [[-112, 52], [-97, 52], [-96.5, 42], [-97, 30], [-104, 30], [-106, 38], [-110, 46]],
  },
  {
    name: 'Pampas',
    terrain: 'steppe',
    ring: [[-65, -31], [-58, -31], [-56.5, -35], [-58, -39], [-63, -39.5], [-66, -36]],
  },
  {
    name: 'Pannonian plain',
    terrain: 'plains',
    ring: [[18.5, 48], [22.5, 48.3], [22.5, 45.2], [20.5, 44.8], [18.5, 45.6]],
  },
  { name: 'Pripet marshes', terrain: 'wetlands', ring: [[24.5, 52.6], [30.5, 52.6], [30.5, 51.2], [24.5, 51.2]] },
  { name: 'Sudd', terrain: 'wetlands', ring: [[29.5, 9.8], [32.5, 9.8], [32.5, 6.2], [29.5, 6.2]] },
  { name: 'Mesopotamian marshes', terrain: 'wetlands', ring: [[45.8, 32.0], [47.8, 32.0], [47.8, 30.4], [45.8, 30.4]] },
  { name: 'Everglades', terrain: 'wetlands', ring: [[-81.6, 26.9], [-80.2, 26.9], [-80.2, 25.1], [-81.6, 25.1]] },
  { name: 'Pantanal', terrain: 'wetlands', ring: [[-58.5, -15.5], [-55.5, -15.5], [-55.5, -20.5], [-58.5, -20.5]] },
  { name: 'Okavango', terrain: 'wetlands', ring: [[21.8, -18.2], [24.2, -18.2], [24.2, -20.2], [21.8, -20.2]] },
  { name: 'Sundarbans', terrain: 'wetlands', ring: [[88.3, 22.6], [90.3, 22.6], [90.3, 21.5], [88.3, 21.5]] },
  { name: 'Vasyugan swamp', terrain: 'wetlands', ring: [[74, 58.5], [83, 58.5], [83, 56], [74, 56]] },
  {
    name: 'Nile valley and delta',
    terrain: 'farmland',
    ring: [[29.6, 31.7], [32.4, 31.6], [31.6, 30], [31.4, 28.5], [31.2, 27], [32.9, 25.8], [33.1, 24], [32.7, 24], [32.2, 25.7], [30.8, 27], [30.9, 28.5], [30.7, 30]],
  },
  {
    name: 'Sawad of Iraq',
    terrain: 'farmland',
    ring: [[43.3, 34.4], [44.6, 34.5], [45.9, 33.2], [47.2, 32], [47.6, 31], [46.6, 30.6], [45.4, 31.2], [44, 32.2], [43.2, 33.4]],
  },
  { name: 'Po valley', terrain: 'farmland', ring: [[7.8, 45.6], [12.4, 45.6], [12.4, 44.5], [9.5, 44.7], [7.8, 44.9]] },
  { name: 'Paris basin', terrain: 'farmland', ring: [[0.8, 49.6], [3.6, 49.8], [4.2, 48.4], [2.5, 47.7], [1.0, 48.0]] },
  { name: 'Flanders', terrain: 'farmland', ring: [[2.4, 51.4], [4.6, 51.5], [4.8, 50.6], [2.8, 50.4]] },
  {
    name: 'North China Plain',
    terrain: 'farmland',
    ring: [[113, 40], [117.5, 40], [119, 37.5], [120.5, 36.5], [119.5, 34.5], [117, 32.5], [114, 32.5], [112.5, 34.5], [113.5, 37]],
  },
  { name: 'Yangtze delta', terrain: 'farmland', ring: [[118.2, 32.8], [121.9, 32.4], [121.9, 30.4], [119.6, 29.8], [118.2, 31]] },
  { name: 'Sichuan basin', terrain: 'farmland', ring: [[103.5, 31.4], [105.5, 31.8], [107.5, 30.6], [106.4, 29.1], [104.2, 29.5]] },
  {
    name: 'Ganges plain',
    terrain: 'farmland',
    ring: [[77, 30.2], [80.5, 29], [84.5, 27.2], [88.5, 26.5], [89.2, 24.5], [86.5, 24.8], [83, 25], [80, 25.8], [77.4, 27.6]],
  },
  { name: 'Punjab', terrain: 'farmland', ring: [[71.5, 32.8], [75.8, 32.4], [76.6, 30.5], [74, 29.6], [71.8, 30.3]] },
  { name: 'Kaveri delta', terrain: 'farmland', ring: [[78.6, 11.4], [79.9, 11.4], [79.9, 10.2], [78.6, 10.2]] },
  { name: 'Red River delta', terrain: 'farmland', ring: [[105.3, 21.4], [107, 21.1], [106.7, 20.1], [105.6, 20.2]] },
  { name: 'Kinai plain', terrain: 'farmland', ring: [[135.2, 35.1], [136.1, 35.1], [136.1, 34.3], [135.2, 34.3]] },
];
