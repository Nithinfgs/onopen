import { parseJsonc } from '../util/jsonc.js';
import { parseToml } from '../util/toml.js';
import { isObject, lineOf, shellJoin } from '../util/text.js';
import { analyzeEnvVar } from '../analyze/env.js';

const JSON_FILES = [
  '.mcp.json',
  '.cursor/mcp.json',
  '.vscode/mcp.json',
  '.roo/mcp.json',
  '.kiro/settings/mcp.json',
  '.windsurf/mcp.json',
  '.gemini/settings.json',
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.zed/settings.json',
  'opencode.json',
  'opencode.jsonc',
  '.opencode/opencode.json',
];

const TOKEN_SHAPES = /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|glpat-[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{30,})\b/;
const SECRET_KEY = /(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|AUTH|BEARER|CREDENTIAL)/i;
const PLACEHOLDER = /^(?:\$\{?[\w:.-]+\}?|\$\{input:[^}]+\}|<[^>]*>|\{\{[^}]*\}\}|%\w+%|your[-_ ].*|x{3,}|\*{3,}|changeme|example.*|)$/i;

/**
 * @typedef {{ name: string, command?: string, args: string[], url?: string, env: Record<string, unknown>, headers: Record<string, unknown> }} McpServer
 */

/** @param {import('../context.js').ScanContext} ctx */
export function collectMcp(ctx) {
  for (const file of JSON_FILES) {
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
    for (const server of extractJsonServers(cfg)) report(ctx, file, raw, server);
  }

  const codex = '.codex/config.toml';
  const raw = ctx.read(codex);
  if (raw !== null) {
    try {
      const cfg = parseToml(raw);
      for (const [name, s] of Object.entries(isObject(cfg.mcp_servers) ? cfg.mcp_servers : {})) {
        if (isObject(s)) report(ctx, codex, raw, normalize(name, s));
      }
      if (Array.isArray(cfg.notify) && cfg.notify.every((x) => typeof x === 'string')) {
        ctx.addCommand({ phase: 'agent', surface: 'Codex notify hook', when: 'when Codex emits a notification event', file: codex, command: shellJoin(cfg.notify), raw });
      }
    } catch {
      ctx.notes.push(`${codex}: could not parse as TOML`);
    }
  }
}

/** @param {any} cfg @returns {McpServer[]} */
function extractJsonServers(cfg) {
  if (!isObject(cfg)) return [];
  /** @type {McpServer[]} */
  const out = [];
  for (const key of ['mcpServers', 'servers', 'mcp', 'context_servers']) {
    const block = cfg[key];
    if (!isObject(block)) continue;
    for (const [name, s] of Object.entries(block)) if (isObject(s)) out.push(normalize(name, s));
  }
  return out;
}

/** @param {string} name @param {Record<string, any>} s @returns {McpServer} */
function normalize(name, s) {
  let command = s.command;
  let args = Array.isArray(s.args) ? s.args.map(String) : [];
  if (Array.isArray(command)) {
    args = command.slice(1).map(String);
    command = command[0];
  } else if (isObject(command)) {
    // Zed: { path, args, env }
    args = Array.isArray(command.args) ? command.args.map(String) : [];
    s = { ...s, env: command.env ?? s.env };
    command = command.path;
  }
  return {
    name,
    command: typeof command === 'string' ? command : undefined,
    args,
    url: typeof s.url === 'string' ? s.url : typeof s.serverUrl === 'string' ? s.serverUrl : undefined,
    env: isObject(s.env) ? s.env : isObject(s.environment) ? s.environment : {},
    headers: isObject(s.headers) ? s.headers : {},
  };
}

/** @param {import('../context.js').ScanContext} ctx @param {string} file @param {string} raw @param {McpServer} s */
function report(ctx, file, raw, s) {
  const line = lineOf(raw, `"${s.name}"`) || 1;
  if (s.command) {
    const command = shellJoin([s.command, ...s.args]);
    ctx.addCommand({ phase: 'agent', surface: `MCP server "${s.name}"`, when: 'when your agent starts this server (most agents ask you to approve it first)', file, command, line });
    const local = [s.command, ...s.args.slice(0, 2)].find((p) => /^\.{1,2}[\\/]/.test(p));
    if (local) ctx.addFinding('OO206', { phase: 'agent', file, line, evidence: `${s.name}: ${local}` });
  }
  if (s.url) {
    let host = s.url;
    try {
      const u = new URL(s.url);
      host = u.hostname;
      const local = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
      if (u.protocol === 'http:' && !local) ctx.addFinding('OO202', { phase: 'agent', file, line, evidence: s.url });
      else if (!local) ctx.addFinding('OO205', { phase: 'agent', file, line, evidence: `${s.name} → ${host}` });
    } catch {
      /* not a URL: ignore */
    }
  }
  for (const [bucket, values] of [['env', s.env], ['headers', s.headers]]) {
    for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (values))) {
      const val = typeof v === 'string' ? v : '';
      const vl = lineOf(raw, `"${k}"`);
      const hijack = bucket === 'env' ? analyzeEnvVar(k, v) : null;
      if (hijack) ctx.addFinding('OO102', { phase: 'agent', file, line: vl, evidence: `${s.name}: ${k}=${val}`, detail: hijack });
      const literal = !PLACEHOLDER.test(val.replace(/^Bearer\s+/i, ''));
      if (val && ((SECRET_KEY.test(k) && literal && val.length >= 12) || TOKEN_SHAPES.test(val))) {
        ctx.addFinding('OO203', { phase: 'agent', file, line: vl, evidence: `${s.name}: ${k}=${redact(val)}` });
      }
    }
  }
}

/** @param {string} v @returns {string} */
function redact(v) {
  const bearer = /^(Bearer\s+)(.*)$/i.exec(v);
  if (bearer) return `${bearer[1]}${redact(bearer[2])}`;
  return v.length <= 8 ? '****' : `${v.slice(0, 4)}…****`;
}
