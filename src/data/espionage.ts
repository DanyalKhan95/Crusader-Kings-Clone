/**
 * Plots: what a spy network in another realm can be spent on. A network grows while the spymaster
 * works on it (0 … 100); each plot spends some of it, costs gold, and may fail or be traced back.
 */
import type { IconName } from '../assets/icons';

export type PlotId = 'claim' | 'sabotage' | 'revolt' | 'steal' | 'assassinate';
export const PLOT_ORDER: PlotId[] = ['claim', 'steal', 'sabotage', 'revolt', 'assassinate'];

export interface PlotDef {
  name: string;
  icon: IconName;
  blurb: string;
  /** network strength it spends */
  network: number;
  /** months of our income it costs */
  gold: number;
  /** chance of success, in percent, with the network just strong enough and spymasters of equal skill */
  odds: number;
  /** chance, in percent, that the victim learns who was behind it; twice that if it fails */
  exposure: number;
  /** what the victim holds against us if it does */
  anger: number;
}

export const PLOTS: Record<PlotId, PlotDef> = {
  claim: {
    name: 'Forge a claim',
    icon: 'scroll-quill',
    blurb: 'Forged charters planted in their archives give us a claim on one of their provinces by our border.',
    network: 30,
    gold: 1,
    odds: 80,
    exposure: 20,
    anger: 25,
  },
  steal: {
    name: 'Steal their secrets',
    icon: 'spy',
    blurb:
      'Our agents copy their treatises and plans: a good part of the way to a level of learning they have and we lack.',
    network: 50,
    gold: 2,
    odds: 65,
    exposure: 25,
    anger: 30,
  },
  sabotage: {
    name: 'Sabotage',
    icon: 'burning-embers',
    blurb: 'Fires in their workshops and on their building sites: taxes −10% and growth −20% for two years.',
    network: 40,
    gold: 1.5,
    odds: 70,
    exposure: 30,
    anger: 40,
  },
  revolt: {
    name: 'Incite a revolt',
    icon: 'fist',
    blurb: 'Agitators and gold stir up their most restless estate. If it is angry enough, it rises.',
    network: 60,
    gold: 3,
    odds: 60,
    exposure: 35,
    anger: 60,
  },
  assassinate: {
    name: 'Assassinate the ruler',
    icon: 'poison-bottle',
    blurb: 'Poison in a cup, a knife in the dark. Their ruler dies, and the realm may fall into turmoil.',
    network: 90,
    gold: 5,
    odds: 35,
    exposure: 50,
    anger: 100,
  },
};

export const NETWORK_MAX = 100;
