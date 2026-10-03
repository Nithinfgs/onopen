/**
 * Minimal JSONC parser: strips // and block comments and trailing commas, then JSON.parse.
 * Comments are replaced with spaces so offsets (and therefore line numbers) are preserved.
 * @param {string} text
 * @returns {any}
 */
export function parseJsonc(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else {
      out += c;
      i++;
    }
  }
  return JSON.parse(removeTrailingCommas(out));
}

/** @param {string} s */
function removeTrailingCommas(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1;
      out += s.slice(i, j + 1);
      i = j + 1;
    } else if (c === ',') {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      out += s[j] === '}' || s[j] === ']' ? ' ' : ',';
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}
