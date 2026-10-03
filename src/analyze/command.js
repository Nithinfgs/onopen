import { RULES } from '../rules.js';
import { truncate } from '../util/text.js';

/**
 * @typedef {{ rule: string, severity: import('../rules.js').Severity, evidence: string }} Signal
 */

const NET = /\b(?:curl|wget|nc|ncat|netcat|scp|sftp|rsync|ftp|telnet|socat)\b|\b(?:iwr|irm|invoke-webrequest|invoke-restmethod)\b|\bfetch\s*\(|requests\.(?:post|put|get)\b|\burllib\b|\bhttp\.client\b|XMLHttpRequest|\bnslookup\b/i;

const INTERP = '(?:(?:ba|z|da|k|c|fi)?sh|python3?|node|perl|ruby|php|pwsh|powershell)';

const PIPE_SHELL = new RegExp(
  String.raw`\b(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^\n|]*\|\s*(?:sudo\s+(?:-\S+\s+)?)?${INTERP}\b` +
    String.raw`|\|\s*(?:iex|invoke-expression)\b` +
    String.raw`|\b(?:ba|z)?sh\s+<\(\s*(?:curl|wget)\b` +
    String.raw`|\b(?:ba|z)?sh\s+-c\s+["']?\$\(\s*(?:curl|wget)\b` +
    String.raw`|\beval\s+["']?\$\(\s*(?:curl|wget)\b`,
  'i',
);

const DECODE_EXEC = new RegExp(
  String.raw`(?:base64\s+(?:-d|-D|--decode)|b64decode|atob\(|xxd\s+-r|openssl\s+(?:enc|base64)\s+-d)[^\n]*(?:\|\s*(?:sudo\s+)?${INTERP}\b|\beval\b|\bexec\b)` +
    String.raw`|-enc(?:odedcommand)?\s+[A-Za-z0-9+/=]{16,}` +
    String.raw`|\beval\s*\(?\s*(?:atob|Buffer\.from)\(`,
  'i',
);

const REVERSE_SHELL = /\/dev\/(?:tcp|udp)\/|\bn(?:c|cat|etcat)\b[^\n]*\s-(?:e|c)\b|\bbash\s+-i\b[^\n]*>&|\bmkfifo\b[^\n]*\bn(?:c|cat)\b|\bsocat\b[^\n]*\bexec:|\bpython3?\b[^\n]*socket[^\n]*(?:dup2|subprocess)/i;

const SECRET_PATH = /(?:~|\$HOME|\$\{HOME\}|%USERPROFILE%|\/Users\/[^/\s]+|\/home\/[^/\s]+|\/root)\/\.(?:ssh|aws|gnupg|kube|npmrc|netrc|pypirc|git-credentials|docker\/config\.json|config\/(?:gcloud|gh)|claude\.json|claude\/\.credentials\.json|codex\/auth\.json)\b|\bid_(?:rsa|ed25519|ecdsa|dsa)\b|Library\/Keychains|\bsecurity\s+find-(?:generic|internet)-password|\bgh\s+auth\s+token\b|\bprintenv\b|\bos\.environ\b|(?:cat|cp|source)\s+[^\s|;&]*\.env\b(?!\.example|\.sample)|@\.env\b/i;
const SECRET_VAR = /\$\{?(?:[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*)\}?/;

const DESTRUCTIVE = /\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*\s+|--recursive\s+)+(?:--no-preserve-root\s+)?(?:-[a-zA-Z]+\s+)*(?:\/(?:\s|$|\*)|~(?:\/\*?)?(?:\s|$)|\$HOME\b|\$\{HOME\}|\*(?:\s|$)|\.\.?\/?(?:\s|$))|\bmkfs(?:\.\w+)?\b|\bdd\s+[^\n]*\bof=\/dev\/|:\(\)\s*\{\s*:\|:&\s*\};:|\bshred\b|\bchmod\s+-R\s+0?777\s+\/|\bformat\s+[a-z]:|\bRemove-Item\b[^\n]*-Recurse[^\n]*-Force\s+(?:[A-Za-z]:\\|~|\$HOME)/i;

const PERSISTENCE = /(?:>>?|\btee(?:\s+-a)?)\s*[^\n|;&]*(?:\.(?:bashrc|zshrc|zprofile|zshenv|profile|bash_profile)\b|\/etc\/(?:profile|environment|cron)|authorized_keys|LaunchAgents|\.config\/autostart)|\bcrontab\b(?!\s+-l)|\blaunchctl\s+(?:load|bootstrap|submit)\b|\bsystemctl\s+(?:--user\s+)?enable\b|\bschtasks\b[^\n]*\/create|\breg\s+add\b[^\n]*\\Run\b|\bgit\s+config\s+--global\b/i;

const HIDDEN = /[​-‏‪-‮⁠-⁤⁦-⁩]|[\u{E0000}-\u{E007F}]/u;

const OBFUSCATED = /[A-Za-z0-9+/]{120,}={0,2}|(?:\\x[0-9a-f]{2}){8,}|(?:\\u[0-9a-f]{4}){8,}|String\.fromCharCode\(|\bchr\(\d+\)(?:\s*\+\s*chr\(\d+\)){3,}/i;

const DETACHED = /\bnohup\b|\bdisown\b|\bsetsid\b|(?:^|[^&])&\s*$|\bstart\s+\/b\b|\bStart-Process\b[^\n]*-WindowStyle\s+Hidden|\bscreen\s+-dm\b|\btmux\s+new(?:-session)?\s+-d\b/im;

const PRIV = /(?:^|[\s;&|(])(?:sudo|doas|pkexec)\b|\brunas\b|\bStart-Process\b[^\n]*-Verb\s+RunAs|\bchmod\s+[ugo]*\+s\b|\bsetcap\b/i;

const INLINE = /\b(?:node|bun|deno)\s+(?:-e|--eval|-p)\b|\bpython3?\s+-c\b|\bperl\s+-e\b|\bruby\s+-e\b|\bphp\s+-r\b|\b(?:powershell|pwsh)(?:\.exe)?\s+[^\n]*-(?:c|command)\b|\bcmd(?:\.exe)?\s+\/c\b|(?:^|[\s;&|(])eval\s/i;

const RUNNERS = /(?:^|[\s;&|(])(npx|bunx|pnpm\s+dlx|yarn\s+dlx|npm\s+exec|pipx\s+run|uvx|uv\s+tool\s+run)\s+([^\n;&|)]*)/gi;

/**
 * Package spec from the argument tail of a runner such as `npx -y @scope/pkg@1.2.3 --flag`.
 * @param {string} tail
 */
function firstPackage(tail) {
  const tokens = tail.trim().split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '--') continue;
    if (t === '--package' || t === '-p' || t === '--from') return tokens[i + 1] ?? '';
    if (t.startsWith('--package=') || t.startsWith('--from=')) return t.split('=')[1];
    if (t.startsWith('-')) continue;
    return t.replace(/^["']|["']$/g, '');
  }
  return '';
}

/** @param {string} spec */
function isPinned(spec) {
  const body = spec.startsWith('@') ? spec.slice(1) : spec;
  const at = body.indexOf('@');
  if (at >= 0) {
    const v = body.slice(at + 1);
    return v !== '' && v !== 'latest' && v !== 'next' && v !== '*';
  }
  return /(?:==|===)\d/.test(spec);
}

/** @param {string} spec */
function bareName(spec) {
  const body = spec.startsWith('@') ? spec.slice(1) : spec;
  const cut = body.search(/[@=<>~^[]/);
  return (spec.startsWith('@') ? '@' : '') + (cut >= 0 ? body.slice(0, cut) : body);
}

/**
 * @param {RegExp} re
 * @param {string} s
 */
function hit(re, s) {
  const m = re.exec(s);
  return m ? truncate(m[0], 90) : null;
}

/**
 * Pattern analysis of one command string. Static only: nothing is executed or resolved.
 * @param {string} command
 * @param {{ knownPackages?: Set<string> }} [opts]
 * @returns {Signal[]}
 */
export function analyzeCommand(command, opts = {}) {
  /** @type {Signal[]} */
  const out = [];
  /** @param {string} rule @param {string|null} evidence */
  const add = (rule, evidence) => {
    if (evidence) out.push({ rule, severity: RULES[rule].severity, evidence });
  };

  add('OO001', hit(PIPE_SHELL, command));
  add('OO002', hit(DECODE_EXEC, command));
  add('OO003', hit(REVERSE_SHELL, command));

  const secret = hit(SECRET_PATH, command) ?? hit(SECRET_VAR, command);
  const network = hit(NET, command);
  if (secret && network) add('OO004', `${secret}  →  ${network}`);
  else add('OO005', secret);

  add('OO006', hit(DESTRUCTIVE, command));
  add('OO007', hit(PERSISTENCE, command));
  add('OO008', hit(HIDDEN, command) ? `${[...command.matchAll(/[​-‏‪-‮⁠-⁤⁦-⁩]|[\u{E0000}-\u{E007F}]/gu)].length} hidden character(s)` : null);
  add('OO009', hit(OBFUSCATED, command));
  add('OO010', hit(DETACHED, command));
  add('OO011', hit(PRIV, command));

  const known = opts.knownPackages ?? new Set();
  for (const m of command.matchAll(RUNNERS)) {
    if (/(?:^|\s)(?:--no|--no-install|--offline)(?:\s|$)/.test(m[2])) continue;
    const spec = firstPackage(m[2]);
    if (!spec || spec.startsWith('.') || spec.startsWith('/') || spec.includes('://')) continue;
    if (known.has(bareName(spec))) continue;
    if (!isPinned(spec)) add('OO012', truncate(`${m[1]} ${spec}`, 90));
  }

  const strong = out.some((s) => s.severity === 'critical' || s.severity === 'high');
  if (!strong) {
    const url = /https?:\/\/(?!localhost\b|127\.0\.0\.1\b|\[::1\])[^\s"')]+/i.exec(command);
    if (network && /\b(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod|nc|ncat|scp|sftp|ftp)\b/i.test(network)) {
      add('OO013', truncate(url ? url[0] : network, 90));
    }
    add('OO014', hit(INLINE, command));
  }
  return out;
}
