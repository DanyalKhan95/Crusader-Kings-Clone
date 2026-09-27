/**
 * The news of the realm, by kind: each kind's name and sign, and what the player chose for it (in the
 * settings): a pop-up that pauses when it matters, as the game always did; a pop-up that always
 * pauses; a pop-up alone; the log alone; or nothing at all.
 */
import type { IconName } from '../assets/icons';
import type { Message, MessageKind } from '../sim/types';
import { settings, type MessageRule } from './settings';

export const MESSAGE_KINDS: { kind: MessageKind; name: string; icon: IconName }[] = [
  { kind: 'war', name: 'War', icon: 'crossed-swords' },
  { kind: 'peace', name: 'Peace', icon: 'peace-dove' },
  { kind: 'battle', name: 'Battles', icon: 'swords-emblem' },
  { kind: 'siege', name: 'Sieges', icon: 'siege-tower' },
  { kind: 'army', name: 'Armies', icon: 'knight-banner' },
  { kind: 'naval', name: 'The sea', icon: 'anchor' },
  { kind: 'diplomacy', name: 'Diplomacy', icon: 'shaking-hands' },
  { kind: 'intrigue', name: 'Intrigue', icon: 'cloak-dagger' },
  { kind: 'death', name: 'Deaths', icon: 'hasty-grave' },
  { kind: 'event', name: 'Events', icon: 'scroll-unfurled' },
  { kind: 'economy', name: 'The treasury', icon: 'coins-pile' },
  { kind: 'building', name: 'Buildings', icon: 'hammer-nails' },
  { kind: 'discovery', name: 'Discoveries', icon: 'compass' },
  { kind: 'colony', name: 'Colonies', icon: 'wood-cabin' },
  { kind: 'plague', name: 'Pestilence', icon: 'plague-doctor-profile' },
];

export const KIND_ICON = Object.fromEntries(MESSAGE_KINDS.map((k) => [k.kind, k.icon])) as Record<
  MessageKind,
  IconName
>;

export const RULE_INFO: Record<MessageRule, { label: string; blurb: string }> = {
  auto: { label: 'Auto', blurb: 'A pop-up, and a pause when it matters' },
  pause: { label: 'Pause', blurb: 'A pop-up, and always a pause' },
  popup: { label: 'Pop-up', blurb: 'A pop-up, never a pause' },
  log: { label: 'Log', blurb: 'Kept in the log only' },
  off: { label: 'Off', blurb: 'Not shown at all' },
};

export function ruleFor(kind: MessageKind): MessageRule {
  return settings.get().messages[kind] ?? 'auto';
}

/** Does this news pop up? */
export function popsUp(m: Message): boolean {
  const r = ruleFor(m.kind);
  return r === 'auto' || r === 'pause' || r === 'popup';
}

/** Does this news stop the clock? */
export function pauses(m: Message): boolean {
  const r = ruleFor(m.kind);
  return r === 'pause' || (r === 'auto' && !!m.important);
}

/** Is this news in the log? */
export function logged(m: Message): boolean {
  return ruleFor(m.kind) !== 'off';
}
