import logger from '../utils/logger';

/**
 * Folders for saved strategies. Shape: { id, name, strategyNames: string[] }.
 *
 * THE ONE PLACE THE STORE LIVES -- every function is async even though it only
 * touches localStorage today, so real endpoints change this file alone.
 * Strategies are held by NAME (a pre-id strategy has no id to hold), compared
 * trimmed and lower-cased. localStorage is a bridge: it is per-browser.
 */

const KEY = 'strategy_folders';

/** Trimmed and lower-cased — the comparison used for every name in here. */
export const normalise = (name) => String(name || '').trim().toLowerCase();

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    // Defensive: a hand-edited or half-written store must not crash the app.
    return raw
      .filter((f) => f && typeof f.name === 'string')
      .map((f) => ({
        id: String(f.id ?? f.name),
        name: f.name,
        strategyNames: Array.isArray(f.strategyNames) ? f.strategyNames.filter((n) => typeof n === 'string') : [],
      }));
  } catch (err) {
    logger.error('[folders] could not read the store:', err);
    return [];
  }
};

/**
 * Fired after every successful write.
 *
 * WHY AN EVENT: more than one view renders folders -- the sidebar tree and
 * the save dialog -- and they are not parent and child, so neither can push
 * state to the other. Each used to read the store once on mount, so filing a
 * strategy from the save dialog left the tree showing yesterday's answer
 * until the page was reloaded. The store announcing its own changes keeps
 * every listener correct without any of them knowing about the others.
 */
const CHANGED = 'strategy-folders-changed';

export const subscribeFolders = (fn) => {
  if (typeof window === 'undefined') return () => {};
  const onChange = (e) => fn(e.detail ?? read());
  // `storage` covers the other tabs; the custom event covers this one, which
  // `storage` deliberately does not fire for.
  const onStorage = (e) => { if (e.key === KEY) fn(read()); };
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onStorage);
  };
};

const write = (folders) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(folders));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CHANGED, { detail: folders }));
    }
  } catch (err) {
    // Storage full or blocked: say so rather than failing silently, because
    // the user just asked for something to be saved.
    logger.error('[folders] could not write the store:', err);
    throw new Error('Could not save — browser storage is full or blocked.', { cause: err });
  }
};

/** Ids never collide and never need a counter that could reset. */
const newId = () => `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/* ── Reads ──────────────────────────────────────────────────────────── */

export const listFolders = async () => read();

/** The folder a strategy sits in, or null. One pass, not one per folder. */
export const folderOfStrategy = (folders, name) => {
  const key = normalise(name);
  return folders.find((f) => f.strategyNames.some((n) => normalise(n) === key)) || null;
};

/** Every name that is inside SOME folder — for "what is still loose". */
export const foldedNames = (folders) => {
  const set = new Set();
  folders.forEach((f) => f.strategyNames.forEach((n) => set.add(normalise(n))));
  return set;
};

/* ── Writes ─────────────────────────────────────────────────────────── */

/**
 * A new folder, optionally pre-filled.
 *
 * Rejects an empty name and a duplicate name, which are the two rules the
 * dialogs surface. A strategy can only be in one folder, so adding it here
 * takes it out of whichever folder held it before.
 */
export const createFolder = async (name, strategyNames = []) => {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Please give the name');

  const folders = read();
  if (folders.some((f) => normalise(f.name) === normalise(clean))) {
    throw new Error('Name already exists');
  }

  const taking = new Set(strategyNames.map(normalise));
  const next = folders.map((f) => ({
    ...f,
    strategyNames: f.strategyNames.filter((n) => !taking.has(normalise(n))),
  }));
  next.push({ id: newId(), name: clean, strategyNames: [...strategyNames] });
  write(next);
  return next;
};

export const renameFolder = async (id, name) => {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Please give the name');

  const folders = read();
  // A folder keeping its own name is not a duplicate of itself.
  if (folders.some((f) => f.id !== id && normalise(f.name) === normalise(clean))) {
    throw new Error('Name already exists');
  }
  const next = folders.map((f) => (f.id === id ? { ...f, name: clean } : f));
  write(next);
  return next;
};

/**
 * Drops the folder. The STRATEGIES INSIDE ARE NOT TOUCHED here -- deleting
 * them is a separate, API-backed step the caller runs first, so a failed
 * delete cannot leave strategies orphaned by a folder that is already gone.
 */
export const deleteFolder = async (id) => {
  const next = read().filter((f) => f.id !== id);
  write(next);
  return next;
};

/** Adds names to a folder, removing them from any other. */
export const addToFolder = async (id, strategyNames = []) => {
  const adding = new Set(strategyNames.map(normalise));
  const next = read().map((f) => {
    const kept = f.strategyNames.filter((n) => !adding.has(normalise(n)));
    return f.id === id
      ? { ...f, strategyNames: [...kept, ...strategyNames] }
      : { ...f, strategyNames: kept };
  });
  write(next);
  return next;
};

export const removeFromFolder = async (id, strategyName) => {
  const key = normalise(strategyName);
  const next = read().map((f) => (f.id === id
    ? { ...f, strategyNames: f.strategyNames.filter((n) => normalise(n) !== key) }
    : f));
  write(next);
  return next;
};

/**
 * Takes a name out of whatever folder holds it — used when a strategy is
 * deleted outright, so no folder keeps a row pointing at nothing.
 */
export const forgetStrategy = async (strategyName) => {
  const key = normalise(strategyName);
  const folders = read();
  if (!folders.some((f) => f.strategyNames.some((n) => normalise(n) === key))) return folders;
  const next = folders.map((f) => ({
    ...f,
    strategyNames: f.strategyNames.filter((n) => normalise(n) !== key),
  }));
  write(next);
  return next;
};
