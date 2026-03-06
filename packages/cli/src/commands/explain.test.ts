import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { runExplain } from './explain.js';

describe('runExplain', () => {
  it('returns json output for known verify rules', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runExplain(process.cwd(), ['notes.missing'], { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    expect(logSpy).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload.schemaVersion).toBe('1.0');
    expect(payload.command).toBe('explain');
    expect(payload.rule.id).toBe('notes.missing');

    logSpy.mockRestore();
  });

  it('fails when the requested rule does not exist', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const exitCode = await runExplain(process.cwd(), ['missing.rule'], { format: 'text', quiet: false });

    expect(exitCode).toBe(ExitCode.Failure);
    expect(errorSpy).toHaveBeenCalledWith('playbook explain: rule not found: missing.rule');

    errorSpy.mockRestore();
  });
});
