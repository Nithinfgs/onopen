import { parseJsonc } from '../util/jsonc.js';
import { isObject, lineOf, shellJoin } from '../util/text.js';
import { analyzeEnvVar } from '../analyze/env.js';

const EXEC_KEY = /(?:executablePath|exePath|binPath|interpreterPath|defaultInterpreterPath|shellPath|\.executable|^git\.path$|^terminal\.integrated\.profiles\.[^.]+\.path$|\.command$)/i;

/**
 * Repo-relative path a workspace setting value points at, or null if it is absolute,
 * a bare command name, or outside the workspace.
 * @param {string} value
 */
export function repoRelative(value) {
  const v = value.replace(/^\$\{(?:workspaceFolder|workspaceRoot)\}[\\/]?/, './').replace(/\\/g, '/');
  if (/^(?:[a-zA-Z]:|\/|~|\$)/.test(v)) return null;
  if (!v.includes('/')) return null;
  /** @type {string[]} */
  const parts = [];
  for (const seg of v.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (!parts.pop()) return null;
    } else parts.push(seg);
  }
  return parts.join('/') || null;
}

/** @param {import('../context.js').ScanContext} ctx */
export function collectVscode(ctx) {
  const tasksRaw = ctx.read('.vscode/tasks.json');
  if (tasksRaw !== null) {
    try {
      const cfg = parseJsonc(tasksRaw);
      const tasks = Array.isArray(cfg?.tasks) ? cfg.tasks : [];
      for (const t of tasks) {
        if (!isObject(t) || typeof t.command !== 'string' && !isObject(t.command)) continue;
        const base = typeof t.command === 'string' ? t.command : String(t.command?.value ?? '');
        const args = (Array.isArray(t.args) ? t.args : []).map((a) => (isObject(a) ? a.value : a));
        const command = t.type === 'shell' || t.type === undefined ? [base, ...args].join(' ') : shellJoin([base, ...args]);
        const auto = isObject(t.runOptions) && t.runOptions.runOn === 'folderOpen';
        ctx.addCommand({
          phase: auto ? 'open' : 'invoke',
          surface: `VS Code task "${t.label ?? base}"`,
          when: auto ? 'when the folder is opened (after you trust the workspace)' : `when you run the task "${t.label ?? base}"`,
          file: '.vscode/tasks.json',
          command,
          raw: tasksRaw,
        });
      }
    } catch {
      ctx.notes.push('.vscode/tasks.json: could not parse as JSON');
    }
  }

  const raw = ctx.read('.vscode/settings.json');
  if (raw === null) return;
  /** @type {any} */
  let cfg;
  try {
    cfg = parseJsonc(raw);
  } catch {
    ctx.notes.push('.vscode/settings.json: could not parse as JSON');
    return;
  }
  if (!isObject(cfg)) return;
  walkSettings(cfg, '', (key, value) => {
    if (/^terminal\.integrated\.env\./.test(key) && isObject(value)) {
      for (const [k, v] of Object.entries(value)) {
        const why = analyzeEnvVar(k, v);
        if (why) ctx.addFinding('OO102', { phase: 'open', file: '.vscode/settings.json', line: lineOf(raw, `"${k}"`), evidence: `${k}=${String(v)}`, detail: why });
      }
      return;
    }
    const strings = typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((x) => typeof x === 'string').slice(0, 1) : [];
    for (const s of strings) {
      const rel = EXEC_KEY.test(key) ? repoRelative(s) : null;
      if (rel && ctx.has(rel)) {
        ctx.addFinding('OO302', { phase: 'open', file: '.vscode/settings.json', line: lineOf(raw, s), evidence: `${key}: ${s}` });
      }
    }
  });
}

/** @param {Record<string, any>} obj @param {string} prefix @param {(key: string, value: unknown) => void} fn */
function walkSettings(obj, prefix, fn) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    fn(key, v);
    if (isObject(v) && !/^terminal\.integrated\.env\./.test(key)) walkSettings(v, key, fn);
  }
}
