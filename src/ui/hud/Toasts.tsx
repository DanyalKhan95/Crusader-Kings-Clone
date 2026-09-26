import { useEffect } from 'react';
import type { IconName } from '../../assets/icons';
import { toDate } from '../../sim/calendar';
import type { MessageKind } from '../../sim/types';
import { flyToProvince } from '../actions';
import { useGame } from '../game';
import { Icon } from '../Icon';
import { useStore } from '../store';

const KIND_ICON: Record<MessageKind, IconName> = {
  war: 'crossed-swords',
  peace: 'peace-dove',
  battle: 'swords-emblem',
  siege: 'siege-tower',
  death: 'hasty-grave',
  building: 'hammer-nails',
  economy: 'coins-pile',
  army: 'knight-banner',
  event: 'scroll-unfurled',
  diplomacy: 'shaking-hands',
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** News of the realm, newest at the bottom. Fades after a while unless it matters. */
export function Toasts() {
  const game = useGame();
  const toasts = useStore(game.ui, (s) => s.toasts);
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => {
      const current = game.ui.get().toasts;
      const msgs = game.state.messages;
      // Drop the oldest unimportant one.
      const drop = current.find((id) => !msgs.find((m) => m.id === id)?.important) ?? current[0];
      game.ui.set({ toasts: current.filter((id) => id !== drop) });
    }, 9000);
    return () => clearTimeout(t);
  }, [game, toasts]);
  const messages = toasts.map((id) => game.state.messages.find((m) => m.id === id)).filter((m) => !!m);
  if (!messages.length) return null;
  const dismiss = (id: number) => game.ui.set({ toasts: game.ui.get().toasts.filter((t) => t !== id) });
  return (
    <ol className="toasts" aria-live="polite">
      {messages.map((m) => {
        const d = toDate(m.day);
        return (
          <li key={m.id} className={`panel toast kind-${m.kind} ${m.important ? 'important' : ''}`}>
            <Icon name={KIND_ICON[m.kind]} />
            <button
              className="toast-text"
              onClick={() => {
                if (m.province) flyToProvince(game, m.province, 0.8);
                dismiss(m.id);
              }}
            >
              <span className="toast-date caps">
                {d.d} {SHORT_MONTHS[d.m - 1]} {d.y}
              </span>
              {m.text}
            </button>
            <button className="toast-close" onClick={() => dismiss(m.id)} aria-label="Dismiss">
              ×
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** One line of feedback or an instruction at the bottom of the screen. */
export function NoticeBar() {
  const game = useGame();
  const notice = useStore(game.ui, (s) => s.notice);
  const orderMode = useStore(game.ui, (s) => s.orderMode);
  const text = orderMode ? 'Click a province to march there. Right-click does the same at any time.' : notice;
  if (!text) return null;
  return (
    <div className="panel notice" role="status">
      {text}
      {orderMode && (
        <button className="btn ghost small" onClick={() => game.ui.set({ orderMode: false })}>
          Cancel
        </button>
      )}
    </div>
  );
}
