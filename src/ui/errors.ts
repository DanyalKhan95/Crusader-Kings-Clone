/**
 * What went wrong: a short log of errors, and the failure on screen. Errors in the interface, the
 * simulation or the game's own scripts stop the game and show the error panel (ErrorPanel.tsx);
 * other noise is only logged. A report gathers the error, the log, the settings and the save.
 */
import { toDate } from '../sim/calendar';
import { formatDate } from './format';
import type { Game } from './game';
import { native } from './platform';
import { serializeGame } from './saves';
import { settings } from './settings';
import { createStore } from './store';

export type FailureSource = 'interface' | 'simulation' | 'script';

export interface Failure {
  source: FailureSource;
  message: string;
  stack?: string;
  /** when it happened, as an ISO date */
  time: string;
}

/** The failure the error panel shows (null when all is well). */
export const failures = createStore<{ current: Failure | null }>({ current: null });

const LOG_SIZE = 30;
const log: Failure[] = [];

export function errorLog(): readonly Failure[] {
  return log;
}

/** The build's version and commit. */
export function buildId(): string {
  return typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
}

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message || error.name, stack: error.stack };
  return { message: typeof error === 'string' ? error : (JSON.stringify(error) ?? String(error)) };
}

/** Logs an error; `show` puts it on screen, where it stops the game until the player answers. */
export function report(error: unknown, source: FailureSource, show = true, detail?: string): Failure {
  const { message, stack } = describe(error);
  const f: Failure = {
    source,
    message,
    stack: detail ? `${stack ?? ''}\n${detail}`.trim() : stack,
    time: new Date().toISOString(),
  };
  log.push(f);
  if (log.length > LOG_SIZE) log.shift();
  // The first failure stays on screen: what follows from it is in the log.
  if (show && !failures.get().current) failures.set({ current: f });
  return f;
}

/** Errors that browsers raise without anything being wrong. */
const BENIGN = [/ResizeObserver loop/i];

/**
 * Catches errors nothing else caught. Those from the game's own scripts go on screen; those from
 * elsewhere (browser extensions, rejected promises no one needed) are only logged.
 */
export function installErrorHandlers() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    const message = e.error instanceof Error ? e.error.message : e.message;
    if (BENIGN.some((re) => re.test(message ?? ''))) return;
    const ours = !e.filename || e.filename.startsWith(location.origin) || e.filename.startsWith('file:');
    report(e.error ?? message, 'script', ours);
  });
  window.addEventListener('unhandledrejection', (e) => {
    report(e.reason, 'script', false);
  });
}

/**
 * A report for a bug: the error, the log, the build, the browser, the settings, the campaign and its
 * save, as one file to attach.
 */
export function buildReport(game: Game | null, failure: Failure | null): string {
  const s = game?.state;
  const c = s?.countries[s.player];
  let save: unknown = null;
  try {
    if (game && s?.player) save = JSON.parse(serializeGame(game));
  } catch (e) {
    save = `The save could not be made: ${describe(e).message}`;
  }
  return JSON.stringify(
    {
      format: 'crowns-and-centuries-report',
      build: buildId(),
      made: new Date().toISOString(),
      app: native ? `desktop (${native.platform})` : 'web',
      browser: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      screen:
        typeof window !== 'undefined'
          ? { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio }
          : null,
      settings: settings.get(),
      failure,
      log,
      campaign: s
        ? {
            realm: c?.name ?? null,
            date: formatDate(toDate(s.day)),
            day: s.day,
            campaign: game?.campaign,
            played: Math.round(game?.played ?? 0),
            news: s.messages.slice(-20).map((m) => `${formatDate(toDate(m.day))}: ${m.text}`),
          }
        : null,
      save,
    },
    null,
    1,
  );
}

/** The failure as short text for the clipboard. */
export function failureText(f: Failure): string {
  return `Crowns & Centuries ${buildId()}\n${f.source} error at ${f.time}: ${f.message}\n${f.stack ?? ''}`.trim();
}
