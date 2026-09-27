/**
 * Sound, made as it plays with the Web Audio API (there are no sound files): short effects for the
 * news of the realm and the player's commands, and quiet music that changes with the era. Nothing
 * sounds before the player first touches the page; both can be turned down or off in the settings,
 * which are kept between visits (`prefs.ts`).
 */
import type { Message, MessageKind } from '../sim/types';
import { readPref, writePref } from './prefs';

export interface AudioSettings {
  effects: boolean;
  effectsVolume: number;
  music: boolean;
  musicVolume: number;
}

const DEFAULTS: AudioSettings = { effects: true, effectsVolume: 0.6, music: false, musicVolume: 0.5 };

function loadSettings(): AudioSettings {
  try {
    const raw = readPref('audio');
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AudioSettings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export type Effect =
  | 'click'
  | 'deny'
  | 'coin'
  | 'drums'
  | 'thud'
  | 'clash'
  | 'bell'
  | 'toll'
  | 'horn'
  | 'pluck'
  | 'rise'
  | 'plague'
  | 'fanfare';

/** The one sound a batch of news makes: the weightiest kind among it. */
const NEWS: [MessageKind, Effect][] = [
  ['war', 'drums'],
  ['battle', 'clash'],
  ['naval', 'clash'],
  ['siege', 'thud'],
  ['death', 'toll'],
  ['peace', 'horn'],
  ['plague', 'plague'],
  ['discovery', 'rise'],
  ['colony', 'rise'],
  ['event', 'pluck'],
  ['diplomacy', 'pluck'],
  ['intrigue', 'pluck'],
  ['building', 'coin'],
  ['economy', 'coin'],
];

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// ── Music ─────────────────────────────────────────────────────────

interface Style {
  /** the tonic, as a MIDI note */
  root: number;
  /** the scale, in semitones above the tonic */
  mode: number[];
  wave: OscillatorType;
  attack: number;
  release: number;
  /** seconds a beat */
  beat: number;
  cutoff: number;
  /** a held drone of the chord's root and fifth under the tune */
  drone: boolean;
  /** struck notes that die away (lute, harpsichord, piano), not held ones */
  struck: boolean;
}

/** One style for each era: medieval, renaissance, early modern, industrial, modern, contemporary. */
const STYLES: Style[] = [
  // A slow Dorian line over a drone of fifths, like a recorder over a hurdy-gurdy.
  {
    root: 62,
    mode: [0, 2, 3, 5, 7, 9, 10],
    wave: 'triangle',
    attack: 0.08,
    release: 0.8,
    beat: 0.8,
    cutoff: 1800,
    drone: true,
    struck: false,
  },
  // A lute in the Mixolydian mode.
  {
    root: 55,
    mode: [0, 2, 4, 5, 7, 9, 10],
    wave: 'triangle',
    attack: 0.004,
    release: 1.3,
    beat: 0.45,
    cutoff: 2600,
    drone: false,
    struck: true,
  },
  // A harpsichord in the major.
  {
    root: 60,
    mode: [0, 2, 4, 5, 7, 9, 11],
    wave: 'sawtooth',
    attack: 0.003,
    release: 0.7,
    beat: 0.36,
    cutoff: 3000,
    drone: false,
    struck: true,
  },
  // A parlour piano in the minor.
  {
    root: 57,
    mode: [0, 2, 3, 5, 7, 8, 10],
    wave: 'sine',
    attack: 0.004,
    release: 1.8,
    beat: 0.62,
    cutoff: 3000,
    drone: false,
    struck: true,
  },
  // Slow Lydian pads.
  {
    root: 53,
    mode: [0, 2, 4, 6, 7, 9, 11],
    wave: 'sine',
    attack: 0.7,
    release: 2.4,
    beat: 1.2,
    cutoff: 1400,
    drone: true,
    struck: false,
  },
  // A soft synthesiser on the minor pentatonic.
  {
    root: 52,
    mode: [0, 3, 5, 7, 10],
    wave: 'sawtooth',
    attack: 0.35,
    release: 1.8,
    beat: 0.9,
    cutoff: 900,
    drone: true,
    struck: false,
  },
];

/**
 * Plays generative music in one style: phrases of four bars, each a walk over the scale that keeps
 * near the chord of its bar (the tonic, the fourth or the fifth), with a bar and a half of rest
 * between them. Time is counted in half beats.
 */
class Music {
  private timer = 0;
  private next = 0;
  private half = 0;
  private bar = -1;
  private degree = 0;
  private chord = 0;

  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
    private style: Style,
  ) {}

  start() {
    this.next = this.ctx.currentTime + 0.6;
    this.timer = window.setInterval(() => this.schedule(), 250);
    this.schedule();
  }

  stop() {
    window.clearInterval(this.timer);
  }

  private pitch(degree: number): number {
    const m = this.style.mode;
    const octave = Math.floor(degree / m.length);
    return midi(this.style.root + 12 * octave + m[((degree % m.length) + m.length) % m.length]);
  }

  private schedule() {
    const s = this.style;
    const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
    while (this.next < this.ctx.currentTime + 1.5) {
      const pos = this.half % 88;
      if (pos >= 64) {
        this.bar = -1;
        this.next += s.beat / 2;
        this.half++;
        continue;
      }
      const bar = Math.floor(pos / 16);
      if (bar !== this.bar) {
        this.bar = bar;
        this.chord = bar === 0 ? 0 : pick([3, 4, 3, 0]);
        if (bar === 0) this.degree = pick([0, 2, 4]);
        if (s.drone) {
          const length = s.beat * 8;
          tone(this.ctx, this.out, this.pitch(this.chord - s.mode.length), this.next, length, s, 0.09, true);
          tone(this.ctx, this.out, this.pitch(this.chord + 4 - s.mode.length), this.next, length, s, 0.06, true);
        }
      }
      const halves = pick([1, 2, 2, 2, 4, 4, 6]);
      if (Math.random() > 0.2) {
        let by = pick([-2, -1, -1, 0, 1, 1, 2]);
        if (this.degree > this.chord + 6) by = -Math.abs(by) || -1;
        else if (this.degree < this.chord - 2) by = Math.abs(by) || 1;
        this.degree = Math.max(-3, Math.min(10, this.degree + by));
        tone(this.ctx, this.out, this.pitch(this.degree), this.next, s.beat * halves * 0.45, s, 0.16, false);
      }
      this.next += (s.beat * halves) / 2;
      this.half += halves;
    }
  }
}

/** One note: an oscillator through a low-pass filter, shaped by an envelope; it frees itself. */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  freq: number,
  at: number,
  length: number,
  style: Pick<Style, 'wave' | 'attack' | 'release' | 'cutoff' | 'struck'>,
  peak: number,
  held: boolean,
) {
  const osc = ctx.createOscillator();
  osc.type = style.wave;
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = style.cutoff;
  const g = ctx.createGain();
  const attack = held ? Math.max(0.4, style.attack) : style.attack;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  const end = at + length + style.release;
  if (style.struck && !held) g.gain.exponentialRampToValueAtTime(0.0001, end);
  else {
    g.gain.setValueAtTime(peak, at + Math.max(attack, length));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
  }
  osc.connect(filter).connect(g).connect(out);
  osc.start(at);
  osc.stop(end + 0.05);
  osc.onended = () => g.disconnect();
}

// ── The sound of the game ─────────────────────────────────────────

class Sound {
  settings: AudioSettings = loadSettings();
  private ctx: AudioContext | null = null;
  private fx: GainNode | null = null;
  private mus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private music: Music | null = null;
  private era = 0;
  private lastNews = 0;

  /** The first touch of the page: browsers let sound begin only now. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    this.fx = this.ctx.createGain();
    this.mus = this.ctx.createGain();
    this.fx.connect(this.ctx.destination);
    this.mus.connect(this.ctx.destination);
    this.apply();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  update(patch: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...patch };
    writePref('audio', JSON.stringify(this.settings));
    this.apply();
  }

  /** The music of the player's era. */
  setEra(era: number) {
    if (era === this.era) return;
    this.era = era;
    if (this.music) {
      this.music.stop();
      this.music = null;
    }
    this.apply();
  }

  private apply() {
    if (!this.ctx || !this.fx || !this.mus) return;
    const now = this.ctx.currentTime;
    this.fx.gain.setTargetAtTime(this.settings.effects ? this.settings.effectsVolume * 0.8 : 0, now, 0.05);
    this.mus.gain.setTargetAtTime(this.settings.music ? this.settings.musicVolume * 0.9 : 0, now, 0.4);
    if (this.settings.music && !this.music) {
      this.music = new Music(this.ctx, this.mus, STYLES[Math.min(this.era, STYLES.length - 1)]);
      this.music.start();
    } else if (!this.settings.music && this.music) {
      this.music.stop();
      this.music = null;
    }
  }

  /** The news that just arrived makes one sound, a little apart from the last. */
  news(messages: Message[], player: number) {
    if (!messages.length || !this.ctx) return;
    const now = performance.now();
    if (now - this.lastNews < 400) return;
    for (const [kind, effect] of NEWS) {
      const m = messages.find((x) => x.kind === kind);
      if (!m) continue;
      this.lastNews = now;
      this.play(m.important && kind === 'event' ? 'bell' : effect, m.important || !player ? 1 : 0.6);
      return;
    }
  }

  play(effect: Effect, loud = 1) {
    const ctx = this.ctx,
      out = this.fx;
    if (!ctx || !out || !this.settings.effects || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.01;
    const plain = { wave: 'sine' as OscillatorType, attack: 0.004, release: 0.1, cutoff: 6000, struck: true };
    switch (effect) {
      case 'click':
        tone(ctx, out, 880, t, 0.03, plain, 0.12 * loud, false);
        break;
      case 'deny':
        tone(ctx, out, 150, t, 0.08, { ...plain, wave: 'triangle', cutoff: 900 }, 0.3 * loud, false);
        break;
      case 'coin':
        tone(ctx, out, 2093, t, 0.02, { ...plain, release: 0.25 }, 0.12 * loud, false);
        tone(ctx, out, 2794, t + 0.06, 0.02, { ...plain, release: 0.3 }, 0.1 * loud, false);
        break;
      case 'thud':
        this.drum(t, 0.9 * loud);
        break;
      case 'drums':
        this.drum(t, 0.9 * loud);
        this.drum(t + 0.32, 0.7 * loud);
        this.drum(t + 0.64, 1 * loud);
        break;
      case 'clash':
        this.noise(t, 0.18, 2600, 0.35 * loud);
        this.drum(t, 0.6 * loud);
        break;
      case 'bell':
        this.bell(t, 587, 0.22 * loud, 2.2);
        break;
      case 'toll':
        this.bell(t, 196, 0.3 * loud, 3.5);
        break;
      case 'horn':
        for (const [n, d] of [
          [55, 0],
          [59, 0.05],
          [62, 0.1],
        ])
          tone(
            ctx,
            out,
            midi(n),
            t + d,
            0.9,
            { wave: 'sawtooth', attack: 0.12, release: 0.6, cutoff: 1100, struck: false },
            0.1 * loud,
            false,
          );
        break;
      case 'pluck':
        for (const [n, d] of [
          [67, 0],
          [71, 0.09],
          [74, 0.18],
        ])
          tone(
            ctx,
            out,
            midi(n),
            t + d,
            0.05,
            { wave: 'triangle', attack: 0.003, release: 0.7, cutoff: 3000, struck: true },
            0.16 * loud,
            false,
          );
        break;
      case 'rise':
        [60, 64, 67, 72].forEach((n, i) =>
          tone(ctx, out, midi(n), t + i * 0.08, 0.05, { ...plain, wave: 'triangle', release: 0.5 }, 0.14 * loud, false),
        );
        break;
      case 'plague':
        tone(
          ctx,
          out,
          midi(43),
          t,
          0.8,
          { wave: 'sawtooth', attack: 0.2, release: 0.8, cutoff: 500, struck: false },
          0.12 * loud,
          false,
        );
        tone(
          ctx,
          out,
          midi(49),
          t,
          0.8,
          { wave: 'sawtooth', attack: 0.2, release: 0.8, cutoff: 500, struck: false },
          0.1 * loud,
          false,
        );
        break;
      case 'fanfare':
        this.bell(t, 523, 0.2, 2.5);
        [60, 64, 67, 72, 76].forEach((n, i) =>
          tone(
            ctx,
            out,
            midi(n),
            t + 0.15 + i * 0.14,
            0.4,
            { wave: 'sawtooth', attack: 0.03, release: 0.5, cutoff: 1800, struck: false },
            0.08,
            false,
          ),
        );
        break;
    }
  }

  /** A drum: a low tone falling in pitch. */
  private drum(at: number, loud: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(110, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.6 * loud, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    osc.connect(g).connect(this.fx!);
    osc.start(at);
    osc.stop(at + 0.5);
    osc.onended = () => g.disconnect();
    this.noise(at, 0.05, 900, 0.15 * loud);
  }

  /** A bell: partials that do not quite agree, dying away slowly. */
  private bell(at: number, f: number, loud: number, length: number) {
    const ctx = this.ctx!;
    for (const [ratio, part] of [
      [1, 1],
      [2, 0.5],
      [2.76, 0.35],
      [5.4, 0.2],
    ])
      tone(
        ctx,
        this.fx!,
        f * ratio,
        at,
        0.01,
        { wave: 'sine', attack: 0.004, release: length / ratio ** 0.3, cutoff: 8000, struck: true },
        loud * part,
        false,
      );
  }

  /** A burst of noise through a band-pass filter: steel on steel, or the skin of a drum. */
  private noise(at: number, length: number, band: number, loud: number) {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) {
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = band;
    filter.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(loud, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    src.connect(filter).connect(g).connect(this.fx!);
    src.start(at);
    src.stop(at + length + 0.02);
    src.onended = () => g.disconnect();
  }
}

export const sound = new Sound();
