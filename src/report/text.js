import { SEVERITIES, severityRank } from '../rules.js';
import { truncate } from '../util/text.js';

const PHASES = [
  ['open', 'WHEN YOU OPEN THE FOLDER IN VS CODE'],
  ['container', 'WHEN THE DEV CONTAINER BUILDS OR STARTS'],
  ['agent', 'WHEN A CODING AGENT STARTS OR WORKS IN THIS REPO'],
  ['shell', 'WHEN YOU cd INTO THE FOLDER'],
  ['install', 'WHEN YOU RUN npm install'],
  ['commit', 'WHEN YOU COMMIT'],
  ['invoke', 'ONLY WHEN YOU INVOKE IT'],
];

/**
 * @param {import('../scan.js').ScanResult} result
 * @param {{ color?: boolean, verbose?: boolean, version?: string, minSeverity?: import('../rules.js').Severity }} [o]
 */
export function renderText(result, o = {}) {
  const c = palette(o.color ?? false);
  const min = severityRank(o.minSeverity ?? 'info');
  const findings = result.findings.filter((f) => severityRank(f.severity) >= min);
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));
  const out = [];

  out.push(`${c.bold('onopen')} ${c.dim(o.version ?? '')}  scanned ${c.bold(result.label)}  ${c.dim(`(${result.inspected.length} config files read, nothing executed)`)}`);
  out.push('');

  const parts = [];
  if (counts.critical) parts.push(c.critical(`${counts.critical} critical`));
  if (counts.high) parts.push(c.high(`${counts.high} high`));
  if (counts.medium) parts.push(c.medium(`${counts.medium} medium`));
  if (counts.low) parts.push(c.low(`${counts.low} low`));
  const auto = result.triggers.filter((t) => t.phase !== 'invoke' && t.phase !== 'commit').length;
  out.push(`  ${parts.length ? parts.join('  ') : c.ok('no findings')}   ${c.dim(`${auto} command(s) can run without you typing them`)}`);
  out.push('');

  const flagged = new Set(result.findings.map((f) => f.triggerId).filter((x) => x !== undefined));
  for (const [phase, title] of PHASES) {
    const inPhase = findings.filter((f) => f.phase === phase);
    const quiet = result.triggers.filter((t) => t.phase === phase && !flagged.has(t.id));
    const unfiltered = min <= severityRank('info');
    const showQuiet = unfiltered && (phase === 'invoke' || phase === 'commit' ? o.verbose : true);
    if (!inPhase.length && !(showQuiet && quiet.length)) continue;
    out.push(c.bold(title));
    for (const f of inPhase) {
      out.push(`  ${badge(c, f.severity)} ${c.dim(f.rule)} ${f.file}:${f.line}`);
      out.push(`      ${f.title}`);
      if (f.detail) out.push(`      ${c.dim(f.detail)}`);
      if (f.evidence) out.push(`      ${c.dim('›')} ${truncate(f.evidence, 100)}`);
    }
    if (showQuiet) {
      for (const t of quiet) out.push(`  ${c.dim(`·  ${t.file}:${t.line}  ${truncate(t.command.replace(/\n/g, ' ; '), 80)}`)}`);
    }
    out.push('');
  }

  for (const n of result.notes) out.push(c.dim(`note: ${n}`));
  if (result.suppressed) out.push(c.dim(`${result.suppressed} finding(s) suppressed by --ignore`));
  if (result.notes.length || result.suppressed) out.push('');

  out.push(verdict(c, counts));
  out.push(c.dim('Static pattern analysis. A clean result is not proof of safety; read what runs.'));
  return `${out.join('\n')}\n`;
}

/** @param {Record<string, number>} counts */
function verdict(/** @type {ReturnType<typeof palette>} */ c, counts) {
  if (counts.critical) return c.critical('Verdict: do not open or trust this repo until you have read the critical items.');
  if (counts.high) return c.high('Verdict: review the high-severity items before trusting this repo.');
  if (counts.medium) return c.medium('Verdict: worth a quick read of the medium items.');
  return c.ok('Verdict: nothing alarming found.');
}

/** @param {ReturnType<typeof palette>} c @param {import('../rules.js').Severity} s */
function badge(c, s) {
  const label = s.toUpperCase().padEnd(8);
  return c[s](label);
}

/** @param {boolean} on */
function palette(on) {
  /** @param {string} code */
  const wrap = (code) => (/** @type {string} */ s) => (on ? `\u001b[${code}m${s}\u001b[0m` : s);
  return {
    bold: wrap('1'),
    dim: wrap('2'),
    ok: wrap('32'),
    critical: wrap('1;31'),
    high: wrap('31'),
    medium: wrap('33'),
    low: wrap('36'),
    info: wrap('2'),
  };
}
