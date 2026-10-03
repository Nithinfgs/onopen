import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Create a throwaway repo from a { relativePath: contents } map.
 * @param {Record<string, string>} files
 */
export function makeRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onopen-test-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return dir;
}

/** @param {import('../src/scan.js').ScanResult} r */
export const rules = (r) => r.findings.map((f) => f.rule).sort();
