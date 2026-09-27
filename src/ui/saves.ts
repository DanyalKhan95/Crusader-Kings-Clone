/**
 * Saving and loading campaigns: saves by name, autosaves in rotation, and the one save of an ironman
 * campaign, each with what the save browser shows (realm, arms, date, time played). The storage
 * itself is in storage.ts.
 */
import { toDate } from '../sim/calendar';
import { readSave, serialize } from '../sim/save';
import { replaceState, resume } from './actions';
import { emblemSvg } from './CoatOfArms';
import { formatDate } from './format';
import type { Game } from './game';
import { native } from './platform';
import { deleteSave, listSaves, loadGame, saveGame, type SaveKind, type SaveMeta } from './storage';

/** Autosaves kept at once; the oldest makes way for the next. */
export const AUTOSAVES = 3;

/** Why a save failed, as far as the game can tell. */
export const SAVE_FAILED = native
  ? 'The save could not be written to the saves folder.'
  : 'This browser would not let the game save.';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A fresh id for a new campaign. The simulation never sees it, so it may come from the clock. */
export function newCampaignId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** The name a new save is offered: the realm and the day, "England, 15 Sep 1066". */
export function defaultSaveName(game: Game): string {
  const c = game.state.countries[game.state.player];
  const d = toDate(game.state.day);
  return `${c ? c.short : 'Campaign'}, ${d.d} ${SHORT_MONTHS[d.m - 1]} ${d.y}`;
}

/** The game as a save file, with its campaign, time played and ironman flag. */
export function serializeGame(game: Game): string {
  game.campaign ||= newCampaignId();
  return serialize(game.state, { campaign: game.campaign, played: Math.round(game.played), ironman: game.ironman });
}

function metaOf(game: Game, kind: SaveKind, label: string): Omit<SaveMeta, 'slot' | 'saved'> {
  game.campaign ||= newCampaignId();
  const s = game.state;
  const c = s.countries[s.player];
  return {
    label,
    kind,
    campaign: game.campaign,
    realm: c?.name,
    emblem: c ? emblemSvg(c, 40) : undefined,
    day: s.day,
    played: Math.round(game.played),
  };
}

/** Saves under a name; a save of the same name is overwritten. */
export async function saveNamed(game: Game, name: string, saves?: SaveMeta[]): Promise<SaveMeta> {
  const same = (saves ?? (await listSaves())).find((m) => (m.kind ?? 'manual') === 'manual' && m.label === name);
  const slot = same?.slot ?? `save:${newCampaignId()}`;
  return saveGame(slot, metaOf(game, 'manual', name), serializeGame(game));
}

/** Autosaves: an ironman campaign into its one save, any other into the oldest of the autosave slots. */
export async function autosave(game: Game): Promise<SaveMeta | null> {
  const c = game.state.countries[game.state.player];
  if (!c) return null;
  if (game.ironman) return saveIronman(game);
  const autos = (await listSaves()).filter((m) => m.kind === 'auto');
  const free = Array.from({ length: AUTOSAVES }, (_, i) => `autosave:${i + 1}`).find(
    (slot) => !autos.some((m) => m.slot === slot),
  );
  const slot =
    free ??
    autos.filter((m) => m.slot.startsWith('autosave:')).sort((a, b) => a.saved.localeCompare(b.saved))[0]?.slot ??
    'autosave:1';
  return saveGame(
    slot,
    metaOf(game, 'auto', `Autosave: ${c.name}, ${formatDate(toDate(game.state.day))}`),
    serializeGame(game),
  );
}

/** The one save of an ironman campaign. */
export function saveIronman(game: Game): Promise<SaveMeta> {
  game.campaign ||= newCampaignId();
  const c = game.state.countries[game.state.player];
  return saveGame(`ironman:${game.campaign}`, metaOf(game, 'ironman', c?.name ?? 'Ironman'), serializeGame(game));
}

/**
 * In the desktop app, closing the window first saves the campaign being played: an ironman campaign
 * into its save, any other into an autosave.
 */
export function saveOnClose(game: Game) {
  native?.beforeClose(async () => {
    if (game.ui.get().phase !== 'playing' || !game.state.countries[game.state.player]?.alive) return;
    await autosave(game);
  });
}

/** Takes a loaded save into the game and resumes it. */
export function applySave(game: Game, json: string) {
  const file = readSave(json, game.world);
  replaceState(game, file.state);
  game.campaign = file.campaign ?? newCampaignId();
  game.played = file.played ?? 0;
  game.ironman = !!file.ironman;
  resume(game);
}

/** Loads a stored save; false if it is gone or unreadable. */
export async function loadSlot(game: Game, slot: string): Promise<boolean> {
  const json = await loadGame(slot);
  if (!json) return false;
  applySave(game, json);
  return true;
}

export { deleteSave, listSaves };

/** Seconds of play as "3 h 20 min" or "12 min". */
export function formatPlayed(seconds: number | undefined): string {
  if (!seconds || seconds < 60) return 'under a minute';
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

/** When a save was made, as the save browser says it: "today at 14:05", "yesterday", "12 March 2026". */
export function formatSavedAt(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86_400_000);
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `yesterday at ${time}`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
}
