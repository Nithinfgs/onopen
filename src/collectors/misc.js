import path from 'node:path';
import fs from 'node:fs';
import { lineOf } from '../util/text.js';

const INSTRUCTION_FILES = /^(?:AGENTS\.md|CLAUDE\.md|GEMINI\.md|\.cursorrules|\.windsurfrules|\.github\/copilot-instructions\.md|\.github\/instructions\/.+\.md|\.cursor\/rules\/.+|\.claude\/.+\.md|\.clinerules(?:\/.+)?|CONVENTIONS\.md)$/i;
const HIDDEN_STRICT = /[​-‏‪-‮⁠-⁤⁦-⁩]|[\u{E0000}-\u{E007F}]/gu;
const INJECTION = /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above)\s+instructions|(?:do\s+not|don'?t|never)\s+(?:tell|inform|mention|show|reveal)[^.\n]{0,40}\b(?:user|human|developer)\b|without\s+(?:telling|informing|notifying|asking)\s+the\s+user|(?:silently|secretly|quietly)\s+(?:run|execute|send|upload|install|curl)/i;
const CONFIG_DIRS = /^(?:\.claude|\.cursor|\.vscode|\.devcontainer|\.codex|\.gemini|\.husky|\.github|\.roo|\.kiro|\.windsurf|\.zed|\.mcp\.json|\.npmrc|opencode\.jsonc?|AGENTS\.md|CLAUDE\.md)/;

/** @param {import('../context.js').ScanContext} ctx */
export function collectMisc(ctx) {
  envrc(ctx);
  husky(ctx);
  instructionFiles(ctx);
  symlinks(ctx);
}

/** @param {import('../context.js').ScanContext} ctx */
function envrc(ctx) {
  const raw = ctx.read('.envrc');
  if (raw === null) return;
  const body = raw.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).join('\n');
  if (body) ctx.addCommand({ phase: 'shell', surface: 'direnv .envrc', when: 'when you cd into the folder and run `direnv allow`', file: '.envrc', command: body, raw, line: 1 });
}

/** @param {import('../context.js').ScanContext} ctx */
function husky(ctx) {
  for (const file of ctx.match(/^\.husky\/(?!_\/)[^/]+$/)) {
    const raw = ctx.read(file);
    if (raw === null) continue;
    const body = raw.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#') && !/^\.\s+"\$\(dirname/.test(l.trim())).join('\n');
    if (body) ctx.addCommand({ phase: 'commit', surface: `Husky ${path.basename(file)} hook`, when: 'when you run the matching git action, once `npm install` has installed Husky', file, command: body, raw, line: 1 });
  }
}

/** @param {import('../context.js').ScanContext} ctx */
function instructionFiles(ctx) {
  for (const file of ctx.match(INSTRUCTION_FILES)) {
    const raw = ctx.read(file);
    if (raw === null) continue;
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const hidden = [...text.matchAll(HIDDEN_STRICT)];
    if (hidden.length) {
      const smuggled = hidden
        .map((m) => m[0].codePointAt(0) ?? 0)
        .filter((cp) => cp >= 0xe0020 && cp <= 0xe007e)
        .map((cp) => String.fromCharCode(cp - 0xe0000))
        .join('');
      const first = hidden[0];
      const line = text.slice(0, first.index).split('\n').length;
      ctx.addFinding('OO501', {
        phase: 'agent',
        file,
        line,
        evidence: `${hidden.length} invisible character(s)`,
        detail: smuggled ? `decoded hidden text: "${smuggled.slice(0, 120)}"` : undefined,
      });
    }
    const m = INJECTION.exec(text);
    if (m) ctx.addFinding('OO502', { phase: 'agent', file, line: lineOf(text, m[0]), evidence: m[0] });
  }
}

/** @param {import('../context.js').ScanContext} ctx */
function symlinks(ctx) {
  for (const rel of ctx.symlinks) {
    let target;
    try {
      target = fs.readlinkSync(path.join(ctx.root, rel));
    } catch {
      continue;
    }
    const abs = path.resolve(path.dirname(path.join(ctx.root, rel)), target);
    const inside = abs === ctx.root || abs.startsWith(ctx.root + path.sep);
    if (inside) continue;
    const configish = CONFIG_DIRS.test(rel);
    ctx.addFinding('OO601', { phase: 'agent', file: rel, line: 1, evidence: `${rel} → ${target}`, severity: configish ? 'high' : 'medium' });
  }
}
