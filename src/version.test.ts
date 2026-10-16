import { describe, it, expect, vi } from 'vitest';
import { readGitVersion } from './version';

describe('readGitVersion', () => {
  it('runs git rev-parse --short HEAD without a shell, in the given cwd', () => {
    const exec = vi.fn(() => 'abc1234\n');

    const version = readGitVersion({ exec: exec as never, cwd: '/srv/app' });

    expect(version).toBe('abc1234');
    expect(exec).toHaveBeenCalledTimes(1);
    const [file, args, options] = exec.mock.calls[0] as unknown as [string, string[], Record<string, unknown>];
    expect(file).toBe('git');
    expect(args).toEqual(['rev-parse', '--short', 'HEAD']);
    expect(options.cwd).toBe('/srv/app');
    expect(options.shell).toBeUndefined();
    expect(options.timeout).toBe(2000);
  });

  it("returns 'unknown' when git throws (missing binary, not a repo)", () => {
    const exec = vi.fn(() => {
      throw new Error('ENOENT');
    });
    expect(readGitVersion({ exec: exec as never })).toBe('unknown');
  });

  it("returns 'unknown' when git times out", () => {
    const exec = vi.fn(() => {
      throw Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' });
    });
    expect(readGitVersion({ exec: exec as never })).toBe('unknown');
  });

  it("returns 'unknown' when the output is not a hex sha", () => {
    expect(readGitVersion({ exec: (() => 'fatal: not a git repository') as never })).toBe('unknown');
    expect(readGitVersion({ exec: (() => '') as never })).toBe('unknown');
  });
});
