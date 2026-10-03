import { parseJsonc } from '../util/jsonc.js';
import { isObject, lineOf } from '../util/text.js';

/** Scripts npm runs on a plain `npm install` in a directory. */
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare'];
const REGISTRY_OK = /(?:^|\.)(?:npmjs\.org|npmjs\.com|yarnpkg\.com|pkg\.github\.com)$/;

/** @param {import('../context.js').ScanContext} ctx */
export function collectNpm(ctx) {
  const manifests = ctx.match(/(?:^|\/)package\.json$/);
  const rootRaw = ctx.read('package.json');
  /** @type {string[]} */
  let patterns = [];
  if (rootRaw !== null) {
    try {
      const ws = parseJsonc(rootRaw)?.workspaces;
      patterns = Array.isArray(ws) ? ws : Array.isArray(ws?.packages) ? ws.packages : [];
    } catch {
      /* reported below */
    }
  }
  const pnpm = ctx.read('pnpm-workspace.yaml');
  if (pnpm !== null) {
    const block = /^packages:\s*\n((?:[ \t]*-[^\n]*\n?|[ \t]*#[^\n]*\n?|[ \t]*\n)*)/m.exec(pnpm);
    for (const m of (block?.[1] ?? '').matchAll(/^\s*-\s*['"]?([^'"\n#]+?)['"]?\s*(?:#.*)?$/gm)) patterns.push(m[1]);
  }
  const isWorkspace = workspaceMatcher(patterns);

  for (const file of manifests) {
    const nested = file !== 'package.json';
    if (nested && !isWorkspace(file.replace(/\/package\.json$/, ''))) continue;
    const raw = ctx.read(file);
    if (raw === null) continue;
    /** @type {any} */
    let pkg;
    try {
      pkg = parseJsonc(raw);
    } catch {
      ctx.notes.push(`${file}: could not parse as JSON`);
      continue;
    }
    if (!isObject(pkg)) continue;

    const scripts = isObject(pkg.scripts) ? pkg.scripts : {};
    for (const name of INSTALL_SCRIPTS) {
      if (typeof scripts[name] !== 'string') continue;
      ctx.addCommand({
        phase: 'install',
        surface: `npm "${name}" script`,
        when: nested ? `when you run npm install (workspace package ${file})` : 'when you run npm install in this folder',
        file,
        command: scripts[name],
        raw,
      });
    }

    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const deps = isObject(pkg[field]) ? pkg[field] : {};
      for (const [name, spec] of Object.entries(deps)) {
        if (typeof spec === 'string' && /^(?:git\+|git:|github:|gitlab:|bitbucket:|https?:\/\/|[\w.-]+\/[\w.-]+(?:#.*)?$)/.test(spec)) {
          const pinned = /#[0-9a-f]{40}$/i.test(spec);
          ctx.addFinding('OO402', { phase: 'install', file, line: lineOf(raw, `"${name}"`), evidence: `${name}: ${spec}`, severity: pinned ? 'low' : 'medium', detail: pinned ? 'pinned to a commit' : undefined });
        }
      }
    }
  }

  npmrc(ctx);
  yarnrc(ctx);
}

/** @param {import('../context.js').ScanContext} ctx */
function npmrc(ctx) {
  const file = '.npmrc';
  const raw = ctx.read(file);
  if (raw === null) return;
  raw.split(/\r?\n/).forEach((text, i) => {
    const line = text.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) return;
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    const at = { phase: /** @type {const} */ ('install'), file, line: i + 1 };
    if (/^(?:script-shell|node-options|git)$/.test(key)) ctx.addFinding('OO403', { ...at, evidence: line });
    else if (/_authToken|_auth$|_password$/.test(key) && value && !/^\$\{[^}]+\}$/.test(value)) ctx.addFinding('OO403', { ...at, evidence: `${key}=****`, detail: 'a literal auth token is committed' });
    else if (/(?:^|:)registry$/.test(key)) {
      try {
        const host = new URL(value).hostname;
        if (!REGISTRY_OK.test(host)) ctx.addFinding('OO404', { ...at, evidence: line });
      } catch {
        /* variable or relative */
      }
    }
  });
}

/** @param {import('../context.js').ScanContext} ctx */
function yarnrc(ctx) {
  const raw = ctx.read('.yarnrc.yml');
  if (raw === null) return;
  const m = /^\s*yarnPath:\s*(\S+)/m.exec(raw);
  if (m) ctx.addFinding('OO406', { phase: 'install', file: '.yarnrc.yml', line: lineOf(raw, m[0].trim()), evidence: `yarnPath: ${m[1]}` });
}

/**
 * Match a repo-relative directory against npm/yarn/pnpm workspace globs (`*`, `**`, `!negation`).
 * @param {string[]} patterns
 * @returns {(dir: string) => boolean}
 */
export function workspaceMatcher(patterns) {
  /** @param {string} glob */
  const toRegex = (glob) =>
    new RegExp(
      `^${glob
        .replace(/^\.\//, '')
        .replace(/\/+$/, '')
        .split('/')
        .map((seg) => (seg === '**' ? '.*' : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')))
        .join('/')}$`,
    );
  const include = patterns.filter((p) => !p.startsWith('!')).map(toRegex);
  const exclude = patterns.filter((p) => p.startsWith('!')).map((p) => toRegex(p.slice(1)));
  return (dir) => include.some((re) => re.test(dir)) && !exclude.some((re) => re.test(dir));
}
