import type { ReactNode } from 'react';
import { useGame } from '../game';
import { Icon } from '../Icon';

export function Modal({
  title,
  kicker,
  children,
  onClose,
  wide = false,
  closable = true,
  className = '',
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  /** false for a question that must be answered */
  closable?: boolean;
  className?: string;
}) {
  const game = useGame();
  const close = closable ? (onClose ?? (() => game.ui.set({ modal: 'none' }))) : undefined;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className={`panel modal ${wide ? 'wide' : ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        {close && (
          <button className="btn ghost close" onClick={close} aria-label="Close">
            <Icon name="cross-mark" />
          </button>
        )}
        {kicker && <p className="caps sp-kicker">{kicker}</p>}
        <h2 className="display modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
