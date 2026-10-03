/** Small text helpers shared by collectors and reporters. */

/**
 * 1-based line number of the first occurrence of `needle` in `raw`.
 * Also tries the JSON-escaped form so commands inside JSON strings are found.
 * @param {string} raw
 * @param {string} needle
 * @returns {number}
 */
export function lineOf(raw, needle) {
  if (!needle) return 1;
  const candidates = [needle, JSON.stringify(needle).slice(1, -1)];
  const firstLine = needle.split('\n')[0];
  if (firstLine) candidates.push(firstLine);
  for (const c of candidates) {
    const i = raw.indexOf(c);
    if (i >= 0) return raw.slice(0, i).split('\n').length;
  }
  return 1;
}

/**
 * @param {string} s
 * @param {number} max
 */
export function truncate(s, max = 110) {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Join argv-style parts into a display string.
 * @param {unknown[]} parts
 */
export function shellJoin(parts) {
  return parts
    .filter((p) => p !== undefined && p !== null)
    .map(String)
    .map((p) => (/^[\w@%+=:,./~$-]+$/.test(p) ? p : JSON.stringify(p)))
    .join(' ');
}

/** @param {unknown} v @returns {v is Record<string, any>} */
export function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
