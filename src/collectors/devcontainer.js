import { parseJsonc } from '../util/jsonc.js';
import { isObject, lineOf, shellJoin } from '../util/text.js';

const LIFECYCLE = [
  ['initializeCommand', 'on your host machine, before the container is created'],
  ['onCreateCommand', 'when the container is first created'],
  ['updateContentCommand', 'when the container content is updated'],
  ['postCreateCommand', 'after the container is created'],
  ['postStartCommand', 'every time the container starts'],
  ['postAttachCommand', 'every time an editor attaches'],
];

/** @type {[RegExp, import('../rules.js').Severity][]} */
const RUN_ARG_RISKS = [
  [/^--(?:privileged|pid=host|ipc=host|net(?:work)?=host|userns=host|uts=host)$/i, 'high'],
  [/^--cap-add=(?:ALL|SYS_ADMIN)$/i, 'high'],
  [/^--security-opt=(?:seccomp|apparmor|label)[:=](?:unconfined|disable)$/i, 'high'],
  [/^--device(?:=|$)/i, 'high'],
  [/^--cap-add=NET_ADMIN$/i, 'medium'],
  [/^--cap-add=SYS_PTRACE$/i, 'low'],
];

/** @param {import('../context.js').ScanContext} ctx */
export function collectDevcontainer(ctx) {
  for (const file of ctx.match(/^(?:\.devcontainer\/(?:[^/]+\/)?devcontainer\.json|\.devcontainer\.json)$/)) {
    const raw = ctx.read(file);
    if (raw === null) continue;
    /** @type {any} */
    let cfg;
    try {
      cfg = parseJsonc(raw);
    } catch {
      ctx.notes.push(`${file}: could not parse as JSON`);
      continue;
    }
    if (!isObject(cfg)) continue;

    for (const [key, when] of LIFECYCLE) {
      for (const command of commandsOf(cfg[key])) {
        const t = ctx.addCommand({ phase: 'container', surface: `dev container ${key}`, when, file, command, raw });
        if (key === 'initializeCommand') {
          ctx.addFinding('OO301', { phase: 'container', file, line: t.line, evidence: command, triggerId: t.id });
        }
      }
    }

    const runArgs = Array.isArray(cfg.runArgs) ? cfg.runArgs.map(String) : [];
    const joined = runArgs.flatMap((a, i) => (/^--(?:cap-add|security-opt|device)$/.test(a) && runArgs[i + 1] ? [`${a}=${runArgs[i + 1]}`] : [a]));
    for (const a of joined) {
      const risk = RUN_ARG_RISKS.find(([re]) => re.test(a));
      if (risk) ctx.addFinding('OO304', { phase: 'container', file, line: lineOf(raw, a.split('=')[0]), evidence: a, severity: risk[1] });
    }
    if (cfg.privileged === true) ctx.addFinding('OO304', { phase: 'container', file, line: lineOf(raw, '"privileged"'), evidence: 'privileged: true' });
    for (const c of Array.isArray(cfg.capAdd) ? cfg.capAdd : []) {
      const risk = RUN_ARG_RISKS.find(([re]) => re.test(`--cap-add=${c}`));
      if (risk) ctx.addFinding('OO304', { phase: 'container', file, line: lineOf(raw, String(c)), evidence: `capAdd: ${c}`, severity: risk[1] });
    }

    const mounts = [...(Array.isArray(cfg.mounts) ? cfg.mounts : []), cfg.workspaceMount].filter(Boolean).map((m) => (isObject(m) ? `source=${m.source},target=${m.target},type=${m.type}` : String(m)));
    for (const m of mounts) {
      if (/docker\.sock/.test(m)) ctx.addFinding('OO304', { phase: 'container', file, line: lineOf(raw, 'docker.sock'), evidence: m });
      else if (/source=(?:\/|~|\$\{localEnv:(?:HOME|USERPROFILE)\})(?:[,/]|$)|\.(?:ssh|aws|gnupg|kube)\b/.test(m) && !/source=\$\{localWorkspaceFolder\}/.test(m)) {
        ctx.addFinding('OO305', { phase: 'container', file, line: lineOf(raw, m.split(',')[0].replace('source=', '')), evidence: m });
      }
    }
  }
}

/** Lifecycle values may be a string, an argv array, or an object of named commands. @param {unknown} v @returns {string[]} */
function commandsOf(v) {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.every((x) => typeof x === 'string') && v.length ? [shellJoin(v)] : [];
  if (isObject(v)) return Object.values(v).flatMap(commandsOf);
  return [];
}
