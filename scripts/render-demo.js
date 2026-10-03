/**
 * Renders docs/assets/demo.svg from the real CLI output on examples/hostile-repo.
 * Nothing in the image is hand-written: re-run `npm run render:demo` after changing output.
 */
import fs from 'node:fs';
import { main } from '../src/cli.js';

/** @type {Record<string, string>} */
const COLORS = { 31: '#ff7b72', 32: '#56d364', 33: '#e3b341', 36: '#79c0ff' };
const FG = '#e6edf3';
const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
const FS = 13;
const CW = 7.85;
const LH = 19;

let out = '';
main(['examples/hostile-repo', '--fail-on', 'none', '--min-severity', 'critical'], { stdout: (s) => (out += s), stderr: () => {}, isTTY: true });
const lines = ['\u001b[2m$\u001b[0m \u001b[1mnpx onopen\u001b[0m ./repo-i-just-cloned', ...out.replace(/\n+$/, '').split('\n')];

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** @param {string} s */
// eslint-disable-next-line no-control-regex
const strip = (s) => s.replace(/\u001b\[[\d;]*m/g, '');

/** @param {string} line */
function spans(line) {
  const parts = [];
  let style = { bold: false, dim: false, color: FG };
  let last = 0;
  // eslint-disable-next-line no-control-regex
  for (const m of line.matchAll(/\u001b\[([\d;]*)m/g)) {
    if (m.index > last) parts.push({ text: line.slice(last, m.index), ...style });
    last = m.index + m[0].length;
    for (const code of (m[1] || '0').split(';')) {
      if (code === '0') style = { bold: false, dim: false, color: FG };
      else if (code === '1') style = { ...style, bold: true };
      else if (code === '2') style = { ...style, dim: true };
      else if (COLORS[code]) style = { ...style, color: COLORS[code] };
    }
  }
  if (last < line.length) parts.push({ text: line.slice(last), ...style });
  return parts;
}

const maxChars = Math.max(...lines.map((l) => strip(l).length));
const width = Math.ceil(maxChars * CW + 56);
const height = lines.length * LH + 78;
const body = lines
  .map((line, i) => {
    const y = 62 + i * LH;
    const tspans = spans(line)
      .map((p) => `<tspan fill="${p.color}"${p.bold ? ' font-weight="700"' : ''}${p.dim ? ' opacity="0.55"' : ''}>${esc(p.text)}</tspan>`)
      .join('');
    return `<text x="28" y="${y}" class="l" xml:space="preserve">${tspans}</text>`;
  })
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Terminal output of onopen scanning a hostile example repository and reporting critical findings">
<style>
.l{font:${FS}px ${FONT};white-space:pre}
</style>
<rect width="${width}" height="${height}" rx="10" fill="#0d1117"/>
<rect width="${width}" height="34" rx="10" fill="#161b22"/><rect y="24" width="${width}" height="10" fill="#161b22"/>
<circle cx="20" cy="17" r="6" fill="#ff5f56"/><circle cx="40" cy="17" r="6" fill="#ffbd2e"/><circle cx="60" cy="17" r="6" fill="#27c93f"/>
<text x="${width / 2}" y="21" text-anchor="middle" font-family="${FONT}" font-size="12" fill="#8b949e">onopen — examples/hostile-repo</text>
${body}
</svg>
`;
fs.writeFileSync(new URL('../docs/assets/demo.svg', import.meta.url), svg);
console.log(`docs/assets/demo.svg  ${width}x${height}  ${(svg.length / 1024).toFixed(1)} KB  ${lines.length} lines`);
