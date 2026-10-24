// localStorage helpers for per-viewer conveniences (win record, panel prefs).
// Storage can be missing or blocked; every call degrades to the fallback silently.

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the value just won't persist.
  }
}
