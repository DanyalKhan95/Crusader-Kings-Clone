import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const CACHE_DIR = join(ROOT, '.cache', 'mapgen');
export const WORK_DIR = join(CACHE_DIR, 'work');
export const DEBUG_DIR = join(ROOT, 'tools', 'mapgen', 'debug');
export const OUT_DIR = join(ROOT, 'public', 'data');
