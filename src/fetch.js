import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Decide whether a CLI target is a local directory or something to clone.
 * @param {string} target
 * @returns {{ kind: 'path', value: string } | { kind: 'git', value: string }}
 */
export function parseTarget(target) {
  if (!target || target.startsWith('-')) throw new Error(`invalid target: ${target}`);
  if (fs.existsSync(target)) return { kind: 'path', value: target };
  if (/^ext::/i.test(target)) throw new Error('refusing ext:: transport');
  if (/^(?:https?:\/\/|ssh:\/\/|git:\/\/|file:\/\/|git@[\w.-]+:)/.test(target)) return { kind: 'git', value: target };
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(target)) return { kind: 'git', value: `https://github.com/${target}.git` };
  throw new Error(`${target}: not a directory, git URL or owner/repo`);
}

/**
 * Shallow-clone into a temp dir with every code-execution path switched off:
 * no hooks, no fsmonitor, no ext:: transport, no submodules, no LFS smudge, no prompts.
 * @param {string} url
 * @param {string} [ref]
 * @returns {{ dir: string, cleanup: () => void }}
 */
export function safeClone(url, ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onopen-'));
  const args = [
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false',
    '-c', 'protocol.ext.allow=never',
    '-c', 'submodule.recurse=false',
    'clone', '--quiet', '--depth', '1', '--no-tags', '--single-branch', '--no-recurse-submodules',
    ...(ref ? ['--branch', ref] : []),
    '--', url, dir,
  ];
  try {
    execFileSync('git', args, { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' } });
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    const stderr = /** @type {any} */ (e).stderr?.toString().trim();
    throw new Error(`git clone failed${stderr ? `: ${stderr.split('\n').pop()}` : ''}`);
  }
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
