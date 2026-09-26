import type { ReactNode } from 'react';
import { useGame } from '../game';
import { Icon } from '../Icon';

export function Modal({
  title,
  kicker,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
}) {
  const game = useGame();
  const close = onClose ?? (() => game.ui.set({ modal: 'none' }));
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className={`panel modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="btn ghost close" onClick={close} aria-label="Close">
          <Icon name="cross-mark" />
        </button>
        {kicker && <p className="caps sp-kicker">{kicker}</p>}
        <h2 className="display modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
