import { parseJsonc } from '../util/jsonc.js';
import { isObject, lineOf } from '../util/text.js';
import { analyzeEnvVar } from '../analyze/env.js';
import { analyzePermissionRule } from '../analyze/permissions.js';

const EVENT_WHEN = {
  SessionStart: 'when a Claude Code session starts or resumes',
  UserPromptSubmit: 'every time you send a prompt',
  PreToolUse: 'before the agent runs a tool',
  PostToolUse: 'after the agent runs a tool',
  Stop: 'when the agent finishes a turn',
  SubagentStop: 'when a subagent finishes',
  Notification: 'when Claude Code sends a notification',
  PreCompact: 'before context compaction',
  SessionEnd: 'when a session ends',
};

const HELPER_KEYS = ['apiKeyHelper', 'awsAuthRefresh', 'awsCredentialExport', 'otelHeadersHelper', 'gcpAuthRefresh'];

/** @param {import('../context.js').ScanContext} ctx */
export function collectClaude(ctx) {
  const files = ctx.match(/^\.claude\/settings[^/]*\.json$/);
  for (const file of files) {
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

    if (isObject(cfg.hooks)) {
      for (const [event, entries] of Object.entries(cfg.hooks)) {
        for (const cmd of collectHookCommands(entries)) {
          const matcher = cmd.matcher ? ` (matcher: ${cmd.matcher})` : '';
          ctx.addCommand({
            phase: 'agent',
            surface: 'Claude Code hook',
            when: `${EVENT_WHEN[/** @type {keyof typeof EVENT_WHEN} */ (event)] ?? `on the ${event} event`}${matcher}`,
            file,
            command: cmd.command,
            raw,
          });
        }
      }
    }

    for (const key of HELPER_KEYS) {
      if (typeof cfg[key] === 'string') {
        ctx.addCommand({ phase: 'agent', surface: `Claude Code ${key}`, when: 'when Claude Code needs credentials or telemetry headers', file, command: cfg[key], raw });
      }
    }
    for (const key of ['statusLine', 'fileSuggestion']) {
      if (isObject(cfg[key]) && typeof cfg[key].command === 'string') {
        ctx.addCommand({ phase: 'agent', surface: `Claude Code ${key}`, when: key === 'statusLine' ? 'continuously while Claude Code is open' : 'while you type @-mentions', file, command: cfg[key].command, raw });
      }
    }

    if (cfg.enableAllProjectMcpServers === true) {
      ctx.addFinding('OO101', { phase: 'agent', file, line: lineOf(raw, '"enableAllProjectMcpServers"'), evidence: 'enableAllProjectMcpServers: true' });
    }

    if (isObject(cfg.env)) {
      for (const [k, v] of Object.entries(cfg.env)) {
        const why = analyzeEnvVar(k, v);
        if (why) ctx.addFinding('OO102', { phase: 'agent', file, line: lineOf(raw, `"${k}"`), evidence: `${k}=${String(v)}`, detail: why });
      }
    }

    const perms = isObject(cfg.permissions) ? cfg.permissions : {};
    if (perms.defaultMode === 'bypassPermissions') {
      ctx.addFinding('OO103', { phase: 'agent', file, line: lineOf(raw, '"defaultMode"'), evidence: 'defaultMode: bypassPermissions' });
    }
    if (cfg.skipDangerousModePermissionPrompt === true) {
      ctx.addFinding('OO103', { phase: 'agent', file, line: lineOf(raw, '"skipDangerousModePermissionPrompt"'), evidence: 'skipDangerousModePermissionPrompt: true' });
    }
    for (const rule of Array.isArray(perms.allow) ? perms.allow : []) {
      if (typeof rule !== 'string') continue;
      const verdict = analyzePermissionRule(rule);
      if (verdict) ctx.addFinding('OO104', { phase: 'agent', file, line: lineOf(raw, rule), evidence: rule, detail: verdict.why, severity: verdict.severity });
    }
    for (const dir of Array.isArray(perms.additionalDirectories) ? perms.additionalDirectories : []) {
      if (typeof dir === 'string' && /^(?:\/|~\/?|\$HOME\/?|\.\.\/\.\.)$/.test(dir.trim())) {
        ctx.addFinding('OO105', { phase: 'agent', file, line: lineOf(raw, dir), evidence: dir });
      }
    }
  }

  collectMarkdownCommands(ctx);
}

/**
 * Walk any hooks structure and return every command string with its matcher.
 * @param {unknown} node
 * @param {string} [matcher]
 * @returns {{ command: string, matcher?: string }[]}
 */
export function collectHookCommands(node, matcher) {
  /** @type {{ command: string, matcher?: string }[]} */
  const out = [];
  if (Array.isArray(node)) {
    for (const n of node) out.push(...collectHookCommands(n, matcher));
  } else if (isObject(node)) {
    const m = typeof node.matcher === 'string' ? node.matcher : matcher;
    if (typeof node.command === 'string' && (node.type === undefined || node.type === 'command')) out.push({ command: node.command, matcher: m });
    for (const [k, v] of Object.entries(node)) if (k !== 'command' && typeof v === 'object') out.push(...collectHookCommands(v, m));
  }
  return out;
}

/** Slash commands, skills and agents can embed shell and request broad tools. @param {import('../context.js').ScanContext} ctx */
function collectMarkdownCommands(ctx) {
  for (const file of ctx.match(/^\.claude\/(?:commands|skills|agents)\/.+\.md$/)) {
    const raw = ctx.read(file);
    if (raw === null) continue;
    const label = file.replace(/^\.claude\/commands\//, '/').replace(/\.md$/, '');
    for (const m of raw.matchAll(/!`([^`\n]+)`/g)) {
      ctx.addCommand({ phase: 'invoke', surface: 'Claude slash-command shell injection', when: `when you run ${label}`, file, command: m[1], raw });
    }
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    const tools = fm ? /^allowed-tools:\s*(.+)$/m.exec(fm[1]) : null;
    if (tools) {
      for (const t of tools[1].split(/,(?![^()]*\))/).map((s) => s.trim().replace(/^["'[]|["'\]]$/g, ''))) {
        const verdict = analyzePermissionRule(t);
        if (verdict) ctx.addFinding('OO104', { phase: 'invoke', file, line: lineOf(raw, 'allowed-tools'), evidence: `allowed-tools: ${t}`, detail: verdict.why, severity: verdict.severity });
      }
    }
  }
}
