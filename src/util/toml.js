/**
 * A deliberately small TOML reader covering what agent config files use:
 * tables, dotted keys, strings, booleans, numbers, arrays and inline tables.
 * Anything it cannot parse throws, and callers report the file as unparsed.
 * @param {string} text
 * @returns {Record<string, any>}
 */
export function parseToml(text) {
  /** @type {Record<string, any>} */
  const root = {};
  let current = root;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim();
    if (!line) continue;
    const table = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
    if (table) {
      const isArray = line.startsWith('[[');
      current = descend(root, splitKey(table[1]), isArray);
      continue;
    }
    const eq = indexOfTopLevel(line, '=');
    if (eq < 0) throw new Error(`toml: cannot parse line ${i + 1}`);
    const keyPath = splitKey(line.slice(0, eq));
    let valueText = line.slice(eq + 1).trim();
    while (!balanced(valueText) && i + 1 < lines.length) {
      i++;
      valueText += ` ${stripComment(lines[i]).trim()}`;
    }
    const target = descend(current, keyPath.slice(0, -1), false);
    target[keyPath[keyPath.length - 1]] = parseValue(valueText);
  }
  return root;
}

/** @param {string} s */
function stripComment(s) {
  let q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '\\' && q === '"') i++;
      else if (c === q) q = '';
    } else if (c === '"' || c === "'") q = c;
    else if (c === '#') return s.slice(0, i);
  }
  return s;
}

/** @param {string} s @param {string} ch */
function indexOfTopLevel(s, ch) {
  let q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '\\' && q === '"') i++;
      else if (c === q) q = '';
    } else if (c === '"' || c === "'") q = c;
    else if (c === ch) return i;
  }
  return -1;
}

/** @param {string} s */
function splitKey(s) {
  const parts = [];
  let buf = '';
  let q = '';
  for (const c of s.trim()) {
    if (q) {
      if (c === q) q = '';
      else buf += c;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '.') {
      parts.push(buf.trim());
      buf = '';
    } else buf += c;
  }
  parts.push(buf.trim());
  return parts;
}

/**
 * @param {Record<string, any>} obj
 * @param {string[]} keys
 * @param {boolean} lastIsArray
 */
function descend(obj, keys, lastIsArray) {
  let cur = obj;
  keys.forEach((k, idx) => {
    const last = idx === keys.length - 1;
    if (last && lastIsArray) {
      if (!Array.isArray(cur[k])) cur[k] = [];
      const fresh = {};
      cur[k].push(fresh);
      cur = fresh;
      return;
    }
    if (Array.isArray(cur[k])) cur = cur[k][cur[k].length - 1];
    else {
      if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
      cur = cur[k];
    }
  });
  return cur;
}

/** @param {string} s */
function balanced(s) {
  let depth = 0;
  let q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '\\' && q === '"') i++;
      else if (c === q) q = '';
    } else if (c === '"' || c === "'") q = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
  }
  return depth <= 0 && !q;
}

/** @param {string} s @returns {any} */
function parseValue(s) {
  const text = s.trim();
  const [value, rest] = readValue(text);
  if (rest.trim()) throw new Error('toml: trailing characters');
  return value;
}

/** @param {string} s @returns {[any, string]} */
function readValue(s) {
  s = s.trimStart();
  const c = s[0];
  if (c === '"' || c === "'") {
    const triple = s.startsWith(c.repeat(3));
    if (triple) {
      const end = s.indexOf(c.repeat(3), 3);
      if (end < 0) throw new Error('toml: unterminated string');
      return [s.slice(3, end), s.slice(end + 3)];
    }
    let j = 1;
    while (j < s.length && s[j] !== c) j += c === '"' && s[j] === '\\' ? 2 : 1;
    const raw = s.slice(1, j);
    return [c === '"' ? JSON.parse(`"${raw}"`) : raw, s.slice(j + 1)];
  }
  if (c === '[') {
    const items = [];
    let rest = s.slice(1).trimStart();
    while (!rest.startsWith(']')) {
      if (!rest) throw new Error('toml: unterminated array');
      const [v, r] = readValue(rest);
      items.push(v);
      rest = r.trimStart();
      if (rest.startsWith(',')) rest = rest.slice(1).trimStart();
    }
    return [items, rest.slice(1)];
  }
  if (c === '{') {
    /** @type {Record<string, any>} */
    const obj = {};
    let rest = s.slice(1).trimStart();
    while (!rest.startsWith('}')) {
      if (!rest) throw new Error('toml: unterminated table');
      const eq = indexOfTopLevel(rest, '=');
      if (eq < 0) throw new Error('toml: bad inline table');
      const key = splitKey(rest.slice(0, eq));
      const [v, r] = readValue(rest.slice(eq + 1));
      descend(obj, key.slice(0, -1), false)[key[key.length - 1]] = v;
      rest = r.trimStart();
      if (rest.startsWith(',')) rest = rest.slice(1).trimStart();
    }
    return [obj, rest.slice(1)];
  }
  const m = /^[^,\]}\s]+/.exec(s);
  if (!m) throw new Error('toml: bad value');
  const tok = m[0];
  let v;
  if (tok === 'true') v = true;
  else if (tok === 'false') v = false;
  else if (!Number.isNaN(Number(tok.replace(/_/g, '')))) v = Number(tok.replace(/_/g, ''));
  else v = tok;
  return [v, s.slice(tok.length)];
}
