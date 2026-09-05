import * as path from 'path';
import * as fs from 'fs';
import { runNestedVitest, fixturePath } from './helpers/runVitest';
import { startStubImportServer } from './helpers/stubImportServer';
import { checkExitCode } from '../../src/check';

function withCwd<T>(dir: string, fn: () => T): T {
  const original = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(original);
  }
}

describe('submission (real nested vitest run)', () => {
  it('case keys from multiple test modules are all included in one submission, attributed to their own file\'s testsuite', async () => {
    const server = await startStubImportServer(() => ({
      status: 201,
      body: { key: 'LOGIN-R7' },
    }));
    const fixtureDir = fixturePath('multi-file');
    const testpulseDir = path.join(fixtureDir, '.testpulse');
    fs.rmSync(testpulseDir, { recursive: true, force: true });

    const result = await runNestedVitest(fixtureDir, path.join(fixtureDir, 'vitest.config.js'), {
      TESTPULSE_URL: server.url,
      TESTPULSE_TOKEN: 't0k3n',
      TESTPULSE_PROJECT: 'LOGIN',
    });
    await server.close();

    expect(result.exitCode).toBe(0);
    expect(server.requests).toHaveLength(1);
    const report = (server.requests[0].body as { report: string }).report;
    expect(report).toContain('LOGIN-1');
    expect(report).toContain('SIGNUP-1');
    expect(report.match(/<testsuite /g)?.length).toBeGreaterThanOrEqual(2);
    // Each case key is attributed to its OWN file's testsuite, not merged into one.
    const loginSuiteMatch = report.match(/<testsuite name="[^"]*login[^"]*"[\s\S]*?<\/testsuite>/);
    expect(loginSuiteMatch).not.toBeNull();
    expect(loginSuiteMatch![0]).toContain('LOGIN-1');
    expect(loginSuiteMatch![0]).not.toContain('SIGNUP-1');

    fs.rmSync(testpulseDir, { recursive: true, force: true });
  });

  it('a genuinely failing test still triggers annotate and submit', async () => {
    const server = await startStubImportServer(() => ({
      status: 201,
      body: { key: 'LOGIN-R3' },
    }));
    const fixtureDir = fixturePath('failing');
    const testpulseDir = path.join(fixtureDir, '.testpulse');
    fs.rmSync(testpulseDir, { recursive: true, force: true });

    const result = await runNestedVitest(fixtureDir, path.join(fixtureDir, 'vitest.config.js'), {
      TESTPULSE_URL: server.url,
      TESTPULSE_TOKEN: 't0k3n',
      TESTPULSE_PROJECT: 'LOGIN',
    });
    await server.close();

    // vitest itself reports the test failure...
    expect(result.exitCode).not.toBe(0);
    // ...but the reporter's onTestRunEnd handler still ran and submitted.
    expect(server.requests).toHaveLength(1);
    const report = (server.requests[0].body as { report: string }).report;
    expect(report).toContain('<property name="testpulse_case_key" value="LOGIN-42"/>');
    expect(report).toContain('<failure');

    fs.rmSync(testpulseDir, { recursive: true, force: true });
  });

  it('the full chain (vitest run; testpulse-vitest check) fails the build for an unmatched, failOnUnmatched case', async () => {
    const server = await startStubImportServer(() => ({
      status: 207,
      body: {
        run: { id: 'r1', key: 'LOGIN-R4' },
        message: '1 unmatched',
        matched: 0,
        unmatched: [{ caseKey: 'LOGIN-42', verdict: 'passed' }],
      },
    }));
    const fixtureDir = fixturePath('tagged-unmatched');
    const testpulseDir = path.join(fixtureDir, '.testpulse');
    fs.rmSync(testpulseDir, { recursive: true, force: true });

    const vitestResult = await runNestedVitest(fixtureDir, path.join(fixtureDir, 'vitest.config.js'), {
      TESTPULSE_URL: server.url,
      TESTPULSE_TOKEN: 't0k3n',
      TESTPULSE_PROJECT: 'LOGIN',
      TESTPULSE_FAIL_ON_UNMATCHED: 'true',
    });
    await server.close();

    // The underlying tests all passed -- vitest's own exit code is 0.
    expect(vitestResult.exitCode).toBe(0);
    // check is what actually fails the build here.
    const checkResult = withCwd(fixtureDir, () => checkExitCode());
    expect(checkResult).not.toBe(0);

    fs.rmSync(testpulseDir, { recursive: true, force: true });
  });

  it('the full chain, run as real chained shell commands, exits non-zero overall for the unmatched+failOnUnmatched case', async () => {
    const server = await startStubImportServer(() => ({
      status: 207,
      body: { matched: 0, unmatched: [{ caseKey: 'LOGIN-42', verdict: 'passed' }] },
    }));
    const fixtureDir = fixturePath('tagged-unmatched');
    const testpulseDir = path.join(fixtureDir, '.testpulse');
    fs.rmSync(testpulseDir, { recursive: true, force: true });

    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    const checkBin = path.join(__dirname, '..', '..', 'dist', 'bin', 'check.js');

    const shellScript = `
      node "${path.join(require.resolve('vitest/package.json').replace('package.json', ''), 'vitest.mjs')}" run --config="${path.join(fixtureDir, 'vitest.config.js')}"
      vitest_status=$?
      node "${checkBin}"
      check_status=$?
      [ "$vitest_status" -eq 0 ] && [ "$check_status" -eq 0 ]
    `;

    let exitCode = 0;
    try {
      await execFileAsync('bash', ['-c', shellScript], {
        cwd: fixtureDir,
        env: {
          ...process.env,
          TESTPULSE_URL: server.url,
          TESTPULSE_TOKEN: 't0k3n',
          TESTPULSE_PROJECT: 'LOGIN',
          TESTPULSE_FAIL_ON_UNMATCHED: 'true',
        },
      });
    } catch (err) {
      exitCode = (err as { code?: number }).code ?? 1;
    }
    await server.close();

    expect(exitCode).not.toBe(0);
    fs.rmSync(testpulseDir, { recursive: true, force: true });
  });
});
