import { execFileSync } from 'node:child_process';

const SHA = /^[0-9a-f]{4,40}$/;

/**
 * Git short sha of the deployed code, read once at boot. Never throws:
 * any failure (no git, not a repo, timeout, odd output) yields 'unknown'.
 */
export function readGitVersion({
  exec = execFileSync,
  cwd = process.cwd(),
}: { exec?: typeof execFileSync; cwd?: string } = {}): string {
  try {
    const output = exec('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
      timeout: 2000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const sha = String(output).trim();
    return SHA.test(sha) ? sha : 'unknown';
  } catch {
    return 'unknown';
  }
}
