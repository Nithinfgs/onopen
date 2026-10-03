import fs from 'node:fs';
import path from 'node:path';
import { RULES, severityRank } from './rules.js';
import { analyzeCommand } from './analyze/command.js';
import { lineOf, truncate } from './util/text.js';

/**
 * @typedef {'open'|'container'|'agent'|'shell'|'install'|'commit'|'invoke'} Phase
 * @typedef {{ id: number, phase: Phase, surface: string, when: string, file: string, line: number, command: string }} Trigger
 * @typedef {{ rule: string, severity: import('../src/rules.js').Severity, title: string, why: string, phase: Phase, file: string, line: number, evidence: string, detail?: string, triggerId?: number }} Finding
 */

export const MAX_FILE_BYTES = 1024 * 1024;
const MAX_FILES = 20000;
const SKIP_DIRS = new Set(['.git', 'node_modules']);

export class ScanContext {
  /**
   * @param {string} root absolute path of the repository root
   */
  constructor(root) {
    this.root = root;
    /** @type {Trigger[]} */
    this.triggers = [];
    /** @type {Finding[]} */
    this.findings = [];
    /** @type {string[]} */
    this.files = [];
    /** @type {string[]} */
    this.symlinks = [];
    /** @type {Set<string>} */
    this.inspected = new Set();
    /** @type {Set<string>} */
    this.knownPackages = new Set();
    /** @type {string[]} */
    this.notes = [];
    this.#walk();
  }

  #walk() {
    /** @param {string} dir */
    const visit = (dir) => {
      if (this.files.length > MAX_FILES) return;
      let entries;
      try {
        entries = fs.readdirSync(path.join(this.root, dir), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const rel = dir ? `${dir}/${e.name}` : e.name;
        if (e.isSymbolicLink()) this.symlinks.push(rel);
        else if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name)) visit(rel);
        } else if (e.isFile()) this.files.push(rel);
      }
    };
    visit('');
    this.files.sort();
  }

  /** @param {string} rel */
  has(rel) {
    return this.files.includes(rel);
  }

  /** @param {RegExp} re */
  match(re) {
    return this.files.filter((f) => re.test(f));
  }

  /**
   * Read a regular file inside the repo. Symlinks and oversized files are never read.
   * @param {string} rel
   * @returns {string|null}
   */
  read(rel) {
    if (!this.has(rel)) return null;
    try {
      const abs = path.join(this.root, rel);
      if (fs.statSync(abs).size > MAX_FILE_BYTES) {
        this.notes.push(`${rel}: skipped (larger than 1 MB)`);
        return null;
      }
      this.inspected.add(rel);
      return fs.readFileSync(abs, 'utf8');
    } catch {
      return null;
    }
  }

  /**
   * @param {string} rule
   * @param {{ phase: Phase, file: string, line?: number, evidence?: string, detail?: string, severity?: import('../src/rules.js').Severity, triggerId?: number }} p
   */
  addFinding(rule, p) {
    const r = RULES[rule];
    const key = `${rule}|${p.file}|${p.line ?? 0}|${p.evidence ?? ''}`;
    if (this.#seen.has(key)) return;
    this.#seen.add(key);
    this.findings.push({
      rule,
      severity: p.severity ?? r.severity,
      title: r.title,
      why: r.why,
      phase: p.phase,
      file: p.file,
      line: p.line ?? 1,
      evidence: truncate(p.evidence ?? '', 160),
      detail: p.detail,
      triggerId: p.triggerId,
    });
  }
  #seen = new Set();

  /**
   * Record something that runs, then analyse it.
   * @param {{ phase: Phase, surface: string, when: string, file: string, command: string, raw?: string, line?: number }} p
   */
  addCommand(p) {
    const line = p.line ?? (p.raw ? lineOf(p.raw, p.command) : 1);
    /** @type {Trigger} */
    const trigger = { id: this.triggers.length, phase: p.phase, surface: p.surface, when: p.when, file: p.file, line, command: p.command };
    this.triggers.push(trigger);
    for (const s of analyzeCommand(p.command, { knownPackages: this.knownPackages })) {
      const needle = s.evidence.split('  →  ')[0].replace(/…$/, '');
      const multi = p.command.includes('\n');
      const offending = multi ? (p.command.split('\n').find((l) => l.includes(needle)) ?? needle) : p.command;
      const at = p.raw ? lineOf(p.raw, offending.trim()) : line;
      this.addFinding(s.rule, {
        phase: p.phase,
        file: p.file,
        line: p.raw && at > 1 ? at : line,
        evidence: offending.trim(),
        detail: offending.includes(s.evidence) ? undefined : s.evidence,
        triggerId: trigger.id,
      });
    }
    return trigger;
  }

  /** Highest severity attached to a trigger. @param {number} id */
  triggerSeverity(id) {
    let best = -1;
    for (const f of this.findings) if (f.triggerId === id) best = Math.max(best, severityRank(f.severity));
    return best;
  }
}
