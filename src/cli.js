import fs from 'node:fs';
import { scan } from './scan.js';
import { parseTarget, safeClone } from './fetch.js';
import { renderText } from './report/text.js';
import { renderJson } from './report/json.js';
import { renderSarif } from './report/sarif.js';
import { renderMarkdown } from './report/markdown.js';
import { RULES, SEVERITIES, severityRank } from './rules.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `onopen ${pkg.version}
See what a repo will run before you open it, install it, or trust it in your coding agent.

Usage
  onopen [target] [options]

  target   a directory (default "."), a git URL, or owner/repo for GitHub.
           Remote targets are shallow-cloned into a temp dir with hooks, submodules
           and ext:: transport disabled, scanned, then deleted.

Options
  --format <fmt>       text (default), json, sarif, markdown
  --fail-on <level>    exit 1 if a finding is at or above: info|low|medium|high|critical|none
                       (default: high)
  --min-severity <l>   hide findings below this level
  --ignore <file>      JSON file: { "ignore": ["OO012", "OO203:.mcp.json"] }
                       Never read from the scanned repo itself.
  --ref <ref>          branch or tag to clone (remote targets only)
  --verbose            also list commands that only run when you invoke them
  --no-color           disable colour (also honours NO_COLOR)
  --rules              list every rule and exit
  -v, --version        print version
  -h, --help           print this help

Exit codes: 0 ok, 1 findings at or above --fail-on, 2 usage or runtime error
`;

/**
 * @param {string[]} argv
 * @param {{ stdout: (s: string) => void, stderr: (s: string) => void, isTTY?: boolean }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  /** @type {Record<string, any>} */
  const opts = { format: 'text', failOn: 'high' };
  /** @type {string[]} */
  const positional = [];
  const needsValue = new Set(['--format', '--fail-on', '--min-severity', '--ignore', '--ref']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    let v = eq > 0 ? a.slice(eq + 1) : undefined;
    const name = a.startsWith('--') ? a.split('=')[0] : a;
    if (needsValue.has(name)) {
      v ??= argv[++i];
      if (v === undefined) return fail(io, `${name} needs a value`);
      opts[name.slice(2).replace(/-(\w)/g, (_, ch) => ch.toUpperCase())] = v;
    } else if (name === '-h' || name === '--help') return out(io, HELP);
    else if (name === '-v' || name === '--version') return out(io, `${pkg.version}\n`);
    else if (name === '--rules') return out(io, renderRules());
    else if (name === '--verbose') opts.verbose = true;
    else if (name === '--no-color') opts.noColor = true;
    else if (a.startsWith('-')) return fail(io, `unknown option ${a}`);
    else positional.push(a);
  }
  if (positional.length > 1) return fail(io, 'only one target is supported');
  if (!['text', 'json', 'sarif', 'markdown'].includes(opts.format)) return fail(io, `unknown format ${opts.format}`);
  for (const key of ['failOn', 'minSeverity']) {
    const val = opts[key];
    if (val !== undefined && !(key === 'failOn' && val === 'none') && !SEVERITIES.includes(val)) return fail(io, `invalid level ${val}`);
  }

  /** @type {string[]} */
  let ignore = [];
  if (opts.ignore) {
    try {
      const parsed = JSON.parse(fs.readFileSync(opts.ignore, 'utf8'));
      ignore = Array.isArray(parsed.ignore) ? parsed.ignore.map(String) : [];
    } catch (e) {
      return fail(io, `cannot read ignore file: ${/** @type {Error} */ (e).message}`);
    }
  }

  let cleanup = () => {};
  try {
    const target = parseTarget(positional[0] ?? '.');
    let dir = target.value;
    let label = target.value === '.' ? undefined : target.value;
    if (target.kind === 'git') {
      const clone = safeClone(target.value, opts.ref);
      cleanup = clone.cleanup;
      dir = clone.dir;
      label = target.value.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
    }
    const result = scan(dir, { ignore, label });
    const color = !opts.noColor && !process.env.NO_COLOR && Boolean(io.isTTY);
    const text =
      opts.format === 'json' ? renderJson(result, pkg.version)
      : opts.format === 'sarif' ? renderSarif(result, pkg.version)
      : opts.format === 'markdown' ? renderMarkdown(result)
      : renderText(result, { color, verbose: opts.verbose, version: pkg.version, minSeverity: opts.minSeverity });
    io.stdout(text);
    if (opts.failOn === 'none') return 0;
    const threshold = severityRank(opts.failOn);
    return result.findings.some((f) => severityRank(f.severity) >= threshold) ? 1 : 0;
  } catch (e) {
    return fail(io, /** @type {Error} */ (e).message);
  } finally {
    cleanup();
  }
}

/** @param {{ stdout: (s: string) => void }} io @param {string} s */
function out(io, s) {
  io.stdout(s);
  return 0;
}

/** @param {{ stderr: (s: string) => void }} io @param {string} msg */
function fail(io, msg) {
  io.stderr(`onopen: ${msg}\n`);
  return 2;
}

function renderRules() {
  const rows = Object.entries(RULES).map(([id, r]) => `${id}  ${r.severity.padEnd(8)} ${r.name.padEnd(30)} ${r.title}`);
  return `${rows.join('\n')}\n`;
}

/** Markdown table for docs/rules.md. */
export function rulesMarkdown() {
  const lines = ['# Rules', '', 'Generated by `node scripts/gen-rules-doc.js`. Do not edit by hand.', '', '| ID | Severity | Name | What it flags | Why it matters |', '|---|---|---|---|---|'];
  for (const [id, r] of Object.entries(RULES)) lines.push(`| ${id} | ${r.severity} | \`${r.name}\` | ${r.title} | ${r.why} |`);
  return `${lines.join('\n')}\n`;
}
