/**
 * The settings: interface, map and graphics (and the window, in the desktop app), the pace of the
 * game, news, sound and keys. Everything takes effect at once and is kept between visits.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { IconName } from '../../assets/icons';
import type { MessageKind } from '../../sim/types';
import { sound, type AudioSettings } from '../audio';
import { useGame, type SettingsSection } from '../game';
import { Icon } from '../Icon';
import {
  bindKey,
  bindings,
  KEY_ACTIONS,
  KEY_GROUPS,
  keyLabel,
  keyOf,
  RESERVED_KEYS,
  resetKeys,
  shortcut,
  unbindKey,
  withKey,
  type KeyAction,
} from '../keys';
import { MESSAGE_KINDS, RULE_INFO } from '../messages';
import { native, type WindowMode } from '../platform';
import {
  appliedScale,
  AUTOSAVE_MINUTES,
  FRAME_CAPS,
  MESSAGE_RULES,
  settings,
  TEXT_SCALES,
  TOP_SPEEDS,
  UI_SCALES,
  useSettings,
  type MapQuality,
  type MessageRule,
} from '../settings';
import { useStore } from '../store';
import { Modal } from './Modal';
import { SavesFolderButton } from './Saves';
import { resetHints } from '../hints';

const SECTIONS: { id: SettingsSection; title: string; icon: IconName }[] = [
  { id: 'interface', title: 'Interface', icon: 'settings-knobs' },
  { id: 'graphics', title: 'Map and graphics', icon: 'mountains' },
  { id: 'game', title: 'Time and saving', icon: 'hourglass' },
  { id: 'news', title: 'News', icon: 'ringing-bell' },
  { id: 'sound', title: 'Sound', icon: 'speaker' },
  { id: 'keys', title: 'Keys', icon: 'keyboard' },
];

export function Settings() {
  const game = useGame();
  const [section, setSection] = useState(() => game.ui.get().settingsSection);
  const nav = useRef<HTMLElement>(null);
  // Opened at a section: on a phone, where the sections scroll sideways, bring it into view.
  useEffect(() => {
    // (Newer browsers return a promise from scrollIntoView, which React would take for a cleanup.)
    nav.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);
  // Back to the screen the settings were opened from: the game menu, the log, How to play.
  const close = () => game.ui.set({ modal: game.ui.get().settingsBack });
  return (
    <Modal title="Settings" kicker="Crowns & Centuries" wide className="help settings" onClose={close}>
      <div className="help-layout">
        <nav className="help-nav" aria-label="Settings" ref={nav}>
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
          {section === 'news' && <NewsSection />}
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
      <Row
        name="Hints"
        blurb="A short note the first time a screen or a rule of the game comes up, with a way into the encyclopedia."
      >
        <Toggle label={s.hints ? 'Shown' : 'Hidden'} checked={s.hints} onChange={(hints) => settings.set({ hints })} />
        <button className="btn small ghost" onClick={resetHints}>
          Show them all again
        </button>
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

const WINDOW_MODES: { value: WindowMode; label: string }[] = [
  { value: 'windowed', label: 'Windowed' },
  { value: 'fullscreen', label: 'Fullscreen' },
];

/** In the desktop app: a window, or the whole screen. */
function WindowRow() {
  const [mode, setMode] = useState<WindowMode | null>(null);
  useEffect(() => {
    if (!native) return;
    let live = true;
    void native.window.getMode().then((m) => live && setMode(m));
    const stop = native.window.onMode(setMode);
    return () => {
      live = false;
      stop();
    };
  }, []);
  if (!native || !mode) return null;
  const { window: w } = native;
  return (
    <Row
      name="Window"
      blurb="Fullscreen covers the screen without a border, so other windows are a switch away. F11 or Alt+Enter switches too."
    >
      <Segmented
        label="Window"
        value={mode}
        options={WINDOW_MODES}
        onChange={(m) => {
          setMode(m);
          void w.setMode(m);
        }}
      />
    </Row>
  );
}

function GraphicsSection() {
  const s = useSettings((x) => x);
  return (
    <>
      <h3 className="section-title">Map and graphics</h3>
      <WindowRow />
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
      <Row
        name="Autosave"
        blurb="Minutes of play between autosaves. An ironman campaign keeps its save even when this is off."
      >
        <Segmented
          label="Autosave"
          value={s.autosaveMinutes}
          options={AUTOSAVE_MINUTES.map((v) => ({ value: v, label: v ? `${v} min` : 'Off' }))}
          onChange={(autosaveMinutes) => settings.set({ autosaveMinutes })}
        />
      </Row>
      {native && (
        <Row
          name="Saves"
          blurb="Saves and settings are kept in your documents folder, under Crowns & Centuries. Closing the game saves the campaign first."
        >
          <SavesFolderButton />
        </Row>
      )}
    </>
  );
}

/** What each kind of news does: a pop-up, a pause, the log alone, or nothing. */
function NewsSection() {
  const rules = useSettings((s) => s.messages);
  const logKey = shortcut('log');
  const setRule = (kind: MessageKind, rule: MessageRule) => {
    const next = { ...settings.get().messages };
    if (rule === 'auto') delete next[kind];
    else next[kind] = rule;
    settings.set({ messages: next });
  };
  return (
    <>
      <h3 className="section-title">News</h3>
      <p className="dim small">
        What each kind of news does when it comes. <b>Auto</b> shows it, and pauses the game for news that needs you;{' '}
        <b>Pause</b> always pauses; <b>Pop-up</b> never does; <b>Log</b> keeps it in the log alone; <b>Off</b> drops it.
        All but what is off is kept in the log, under the quill beside the date
        {logKey && (
          <>
            {' '}
            or on <kbd>{logKey}</kbd>
          </>
        )}
        .
      </p>
      <div className="news-grid">
        <div className="news-row news-head" aria-hidden="true">
          <span />
          {MESSAGE_RULES.map((r) => (
            <span key={r} className="caps">
              {RULE_INFO[r].label}
            </span>
          ))}
        </div>
        {MESSAGE_KINDS.map((k) => {
          const value = rules[k.kind] ?? 'auto';
          return (
            <div key={k.kind} className="news-row" role="radiogroup" aria-label={k.name}>
              <span className="news-kind">
                <Icon name={k.icon} />
                {k.name}
              </span>
              {MESSAGE_RULES.map((r) => (
                <label key={r} className="news-cell" title={`${k.name}: ${RULE_INFO[r].blurb.toLowerCase()}`}>
                  <input
                    type="radio"
                    name={`news-${k.kind}`}
                    aria-label={RULE_INFO[r].label}
                    checked={value === r}
                    onChange={() => setRule(k.kind, r)}
                  />
                </label>
              ))}
            </div>
          );
        })}
      </div>
      <div className="modal-actions">
        <button
          className="btn ghost"
          disabled={!Object.keys(rules).length}
          onClick={() => settings.set({ messages: {} })}
        >
          Restore the defaults
        </button>
      </div>
    </>
  );
}

/** Sound effects and music, each on or off with its own volume. */
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
      {KEY_GROUPS.map((g) => (
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
