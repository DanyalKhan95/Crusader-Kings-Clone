/**
 * The settings: interface, map and graphics, the pace of the game, sound and keys. Everything takes
 * effect at once and is kept in this browser.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { IconName } from '../../assets/icons';
import { sound, type AudioSettings } from '../audio';
import { useGame } from '../game';
import { Icon } from '../Icon';
import {
  bindKey,
  bindings,
  KEY_ACTIONS,
  keyLabel,
  keyOf,
  RESERVED_KEYS,
  resetKeys,
  unbindKey,
  withKey,
  type KeyAction,
  type KeyGroup,
} from '../keys';
import {
  appliedScale,
  AUTOSAVE_MINUTES,
  FRAME_CAPS,
  settings,
  TEXT_SCALES,
  TOP_SPEEDS,
  UI_SCALES,
  useSettings,
  type MapQuality,
} from '../settings';
import { useStore } from '../store';
import { Modal } from './Modal';

type Section = 'interface' | 'graphics' | 'game' | 'sound' | 'keys';

const SECTIONS: { id: Section; title: string; icon: IconName }[] = [
  { id: 'interface', title: 'Interface', icon: 'settings-knobs' },
  { id: 'graphics', title: 'Map and graphics', icon: 'mountains' },
  { id: 'game', title: 'Time and saving', icon: 'hourglass' },
  { id: 'sound', title: 'Sound', icon: 'speaker' },
  { id: 'keys', title: 'Keys', icon: 'keyboard' },
];

export function Settings() {
  const game = useGame();
  const phase = useStore(game.ui, (s) => s.phase);
  const [section, setSection] = useState<Section>('interface');
  // In a campaign the settings open from the game menu, and go back to it.
  const close = () => game.ui.set({ modal: phase === 'playing' ? 'menu' : 'none' });
  return (
    <Modal title="Settings" kicker="Crowns & Centuries" wide className="help settings" onClose={close}>
      <div className="help-layout">
        <nav className="help-nav" aria-label="Settings">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`help-topic ${s.id === section ? 'active' : ''}`}
              aria-current={s.id === section}
              onClick={() => setSection(s.id)}
            >
              <Icon name={s.icon} />
              <span>{s.title}</span>
            </button>
          ))}
        </nav>
        <div className="help-body settings-body">
          {section === 'interface' && <InterfaceSection />}
          {section === 'graphics' && <GraphicsSection />}
          {section === 'game' && <GameSection />}
          {section === 'sound' && <SoundSection />}
          {section === 'keys' && <KeysSection />}
        </div>
      </div>
    </Modal>
  );
}

// ── Building blocks ───────────────────────────────────────────────

function Row({ name, blurb, children }: { name: string; blurb?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <span className="setting-name">{name}</span>
        {blurb && <span className="dim small">{blurb}</span>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={`choice compact ${checked ? 'active' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="choice-name">{label}</span>
    </label>
  );
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

// ── Sections ──────────────────────────────────────────────────────

function InterfaceSection() {
  const s = useSettings((x) => x);
  const applied = useStore(appliedScale, (x) => x.value);
  return (
    <>
      <h3 className="section-title">Interface</h3>
      <Row
        name="Interface scale"
        blurb={
          <>
            The size of every panel and button, and of the names and banners on the map. Larger suits big or sharp
            screens.
            {applied < s.uiScale && (
              <>
                {' '}
                This window fits the interface at {percent(applied)} at most; it grows to {percent(s.uiScale)} in a
                larger window.
              </>
            )}
          </>
        }
      >
        <Segmented
          label="Interface scale"
          value={s.uiScale}
          options={UI_SCALES.map((v) => ({ value: v, label: percent(v) }))}
          onChange={(uiScale) => settings.set({ uiScale })}
        />
      </Row>
      <Row name="Text size" blurb="The size of the interface's text on top of its scale.">
        <Segmented
          label="Text size"
          value={s.textScale}
          options={TEXT_SCALES.map((v) => ({ value: v, label: percent(v) }))}
          onChange={(textScale) => settings.set({ textScale })}
        />
      </Row>
    </>
  );
}

const QUALITY: { value: MapQuality; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'native', label: 'Sharpest' },
];

function GraphicsSection() {
  const s = useSettings((x) => x);
  return (
    <>
      <h3 className="section-title">Map and graphics</h3>
      <Row
        name="Map quality"
        blurb="How sharply the map is drawn on high-resolution screens. Lower is faster on modest graphics."
      >
        <Segmented
          label="Map quality"
          value={s.quality}
          options={QUALITY}
          onChange={(quality) => settings.set({ quality })}
        />
      </Row>
      <Row name="Frame rate" blurb="Frames a second at most. A cap saves power and keeps laptops cool.">
        <Segmented
          label="Frame rate"
          value={s.frameCap}
          options={FRAME_CAPS.map((v) => ({ value: v, label: v ? String(v) : 'Display' }))}
          onChange={(frameCap) => settings.set({ frameCap })}
        />
      </Row>
      <Row
        name="Animations"
        blurb="The pulse of a selected province, the camera's glides and the drift behind the title."
      >
        <Toggle
          label={s.animations ? 'On' : 'Off'}
          checked={s.animations}
          onChange={(animations) => settings.set({ animations })}
        />
      </Row>
      <Row
        name="Performance overlay"
        blurb={`Frames a second, days a second, and what takes the time. ${withKey('Also on a key', 'perfOverlay')}.`}
      >
        <Toggle
          label={s.perfOverlay ? 'Shown' : 'Hidden'}
          checked={s.perfOverlay}
          onChange={(perfOverlay) => settings.set({ perfOverlay })}
        />
      </Row>
    </>
  );
}

function GameSection() {
  const s = useSettings((x) => x);
  return (
    <>
      <h3 className="section-title">Time and saving</h3>
      <Row
        name="Fastest speed"
        blurb="Days a second at speed 5. Unlimited runs as fast as the computer allows while the map stays smooth."
      >
        <Segmented
          label="Fastest speed"
          value={s.topSpeed}
          options={TOP_SPEEDS.map((v) => ({ value: v, label: v ? String(v) : 'Unlimited' }))}
          onChange={(topSpeed) => settings.set({ topSpeed })}
        />
      </Row>
      <Row name="Autosave" blurb="Minutes of play between autosaves.">
        <Segmented
          label="Autosave"
          value={s.autosaveMinutes}
          options={AUTOSAVE_MINUTES.map((v) => ({ value: v, label: v ? `${v} min` : 'Off' }))}
          onChange={(autosaveMinutes) => settings.set({ autosaveMinutes })}
        />
      </Row>
    </>
  );
}

/** Sound effects and music, each on or off with its own volume, kept in this browser. */
function SoundSection() {
  const [s, setS] = useState(sound.settings);
  const update = (patch: Partial<AudioSettings>) => {
    sound.unlock();
    sound.update(patch);
    setS(sound.settings);
  };
  const row = (on: 'effects' | 'music', volume: 'effectsVolume' | 'musicVolume', label: string, blurb: string) => (
    <div className="sound-row">
      <label className={`choice compact ${s[on] ? 'active' : ''}`}>
        <input type="checkbox" checked={s[on]} onChange={(e) => update({ [on]: e.target.checked })} />
        <span>
          <span className="choice-name">{label}</span>
          <span className="dim small">{blurb}</span>
        </span>
      </label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={s[volume]}
        disabled={!s[on]}
        aria-label={`${label}: volume`}
        onChange={(e) => update({ [volume]: Number(e.target.value) })}
        onPointerUp={() => on === 'effects' && sound.play('coin')}
      />
    </div>
  );
  return (
    <>
      <h3 className="section-title">Sound</h3>
      {row('effects', 'effectsVolume', 'Sound effects', 'The drums of war, bells, the clash of battle.')}
      {row('music', 'musicVolume', 'Music', 'Quiet music in the manner of your age.')}
    </>
  );
}

const GROUPS: KeyGroup[] = ['Time', 'Screens', 'Map modes', 'Camera'];
const LABEL = new Map(KEY_ACTIONS.map((a) => [a.id, a.label]));

/** Every action with its two keys; click a key, then press the new one. */
function KeysSection() {
  useSettings((s) => s.keys);
  const [capture, setCapture] = useState<{ action: KeyAction; slot: 0 | 1 } | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!capture) return;
    // Ahead of every other handler, so the key pressed does nothing but bind.
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        setCapture(null);
        return;
      }
      const key = keyOf(e);
      if (['Shift', 'Control', 'Alt', 'AltGraph', 'Meta'].includes(key)) return; // wait for the key itself
      if (RESERVED_KEYS.has(key)) {
        setNote(`${keyLabel(key)} cannot be bound.`);
        return;
      }
      const taken = bindKey(capture.action, key, capture.slot);
      setNote(
        taken
          ? `${keyLabel(key)} was taken from “${LABEL.get(taken)}”, which now has ${
              bindings(taken).map(keyLabel).join(' or ') || 'no key'
            }.`
          : '',
      );
      setCapture(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capture]);

  const slot = (action: KeyAction, i: 0 | 1) => {
    const key = bindings(action)[i];
    const waiting = capture?.action === action && capture.slot === i;
    return (
      <span className="key-slot">
        <button
          className={`btn small key-button ${waiting ? 'waiting' : ''} ${key ? '' : 'empty'}`}
          aria-label={`${LABEL.get(action)}, ${i ? 'second' : 'first'} key: ${
            waiting ? 'press a key' : key ? keyLabel(key) : 'none'
          }`}
          onClick={() => {
            setNote('');
            setCapture(waiting ? null : { action, slot: i });
          }}
        >
          {waiting ? 'Press a key…' : key ? keyLabel(key) : '—'}
        </button>
        {key && !waiting && (
          <button className="key-clear" aria-label={`Remove ${keyLabel(key)}`} onClick={() => unbindKey(action, key)}>
            ×
          </button>
        )}
      </span>
    );
  };

  return (
    <>
      <h3 className="section-title">Keys</h3>
      <p className="dim small">
        Click a key, then press the one you want. Esc cancels, and always closes windows and goes back.
      </p>
      {note && (
        <p className="alert" role="status">
          {note}
        </p>
      )}
      {GROUPS.map((g) => (
        <section key={g} className="key-group">
          <h4 className="caps key-group-title">{g}</h4>
          <ul className="key-list">
            {KEY_ACTIONS.filter((a) => a.group === g).map((a) => (
              <li key={a.id}>
                <span>{a.label}</span>
                {slot(a.id, 0)}
                {slot(a.id, 1)}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="modal-actions">
        <button
          className="btn ghost"
          onClick={() => {
            resetKeys();
            setNote('Every key is back to its default.');
          }}
        >
          Restore the default keys
        </button>
      </div>
    </>
  );
}
