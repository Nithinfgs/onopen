import fs from 'node:fs';
import path from 'node:path';
import { ScanContext } from './context.js';
import { collectClaude } from './collectors/claude.js';
import { collectMcp } from './collectors/mcp.js';
import { collectVscode } from './collectors/vscode.js';
import { collectDevcontainer } from './collectors/devcontainer.js';
import { collectNpm } from './collectors/npm.js';
import { collectMisc } from './collectors/misc.js';
import { severityRank } from './rules.js';
import { parseJsonc } from './util/jsonc.js';

/**
 * @typedef {{ root: string, label: string, triggers: import('./context.js').Trigger[], findings: import('./context.js').Finding[], inspected: string[], notes: string[], suppressed: number }} ScanResult
 */

/**
 * Scan a directory. Reads files, never executes them, never follows symlinks.
 * @param {string} dir
 * @param {{ label?: string, ignore?: string[] }} [opts] ignore entries look like "OO012" or "OO012:.mcp.json"
 * @returns {ScanResult}
 */
export function scan(dir, opts = {}) {
  const root = fs.realpathSync(path.resolve(dir));
  if (!fs.statSync(root).isDirectory()) throw new Error(`${dir} is not a directory`);
  const ctx = new ScanContext(root);
  loadKnownPackages(ctx);
  for (const collect of [collectClaude, collectMcp, collectVscode, collectDevcontainer, collectNpm, collectMisc]) collect(ctx);

  const ignore = opts.ignore ?? [];
  const keep = ctx.findings.filter((f) => !ignore.some((i) => i === f.rule || i === `${f.rule}:${f.file}`));
  keep.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.file.localeCompare(b.file) || a.line - b.line);
  return {
    root,
    label: opts.label ?? path.basename(root),
    triggers: ctx.triggers,
    findings: keep,
    inspected: [...ctx.inspected].sort(),
    notes: [...new Set(ctx.notes)],
    suppressed: ctx.findings.length - keep.length,
  };
}

/** Packages the repo already depends on are not "remote fetches" when run via npx. @param {ScanContext} ctx */
function loadKnownPackages(ctx) {
  const raw = ctx.has('package.json') ? ctx.read('package.json') : null;
  if (raw === null) return;
  try {
    const pkg = parseJsonc(raw);
    for (const f of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const name of Object.keys(pkg?.[f] ?? {})) ctx.knownPackages.add(name);
    }
  } catch {
    /* surfaced by the npm collector */
  }
}
