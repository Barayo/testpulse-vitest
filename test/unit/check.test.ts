import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkExitCode } from '../../src/check';

describe('checkExitCode', () => {
  let cwd: string;
  let originalCwd: string;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    originalCwd = process.cwd();
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'testpulse-vitest-check-'));
    process.chdir(cwd);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(cwd, { recursive: true, force: true });
    errorSpy.mockRestore();
  });

  function writeMarker(marker: unknown) {
    fs.mkdirSync(path.join(cwd, '.testpulse'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.testpulse', 'result.json'), JSON.stringify(marker));
  }

  it('exits non-zero when the marker says failed:true', () => {
    writeMarker({ failed: true });
    expect(checkExitCode()).not.toBe(0);
  });

  it('exits 0 when the marker says failed:false', () => {
    writeMarker({ failed: false });
    expect(checkExitCode()).toBe(0);
  });

  it('exits non-zero with a message naming a likely misconfiguration cause when the marker is missing', () => {
    expect(checkExitCode()).not.toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('TestPulseReporter'));
    const allCalls = errorSpy.mock.calls.flat().join(' ');
    expect(allCalls).not.toContain('ENOENT');
  });

  it('prints the specific reason from the marker rather than the generic failure message', () => {
    writeMarker({ failed: true, reason: 'TESTPULSE_TOKEN is required' });
    checkExitCode();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('TESTPULSE_TOKEN is required'));
  });

  it('never echoes any other resolved configuration setting\'s value alongside the reason', () => {
    writeMarker({ failed: true, reason: 'TESTPULSE_TOKEN is required' });
    checkExitCode();
    const allCalls = errorSpy.mock.calls.flat().join(' ');
    expect(allCalls).not.toContain('https://');
  });
});
