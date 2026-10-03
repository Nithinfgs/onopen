/** @param {import('../scan.js').ScanResult} result @param {string} version */
export function renderJson(result, version) {
  return `${JSON.stringify({ tool: 'onopen', version, target: result.label, inspected: result.inspected, findings: result.findings, triggers: result.triggers, notes: result.notes, suppressed: result.suppressed }, null, 2)}\n`;
}
