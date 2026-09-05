import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TestPulseReporter } from '../../src/reporter';
import { readResultMarker } from '../../src/resultMarker';
import * as httpClient from '../../src/httpClient';
import { makeFakeTestCase, makeFakeTestModule } from './helpers/vitestReporterObjects';

jest.mock('../../src/httpClient');
const mockedHttpClient = httpClient as jest.Mocked<typeof httpClient>;

describe('TestPulseReporter', () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    originalCwd = process.cwd();
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'testpulse-vitest-reporter-'));
    process.chdir(cwd);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(cwd, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function makeReporter(options: Record<string, unknown> = {}) {
    return new TestPulseReporter({
      url: 'https://testpulse.example',
      project: 'LOGIN',
      token: 't0k3n',
      ...options,
    } as never);
  }

  async function runEnd(reporter: TestPulseReporter): Promise<void> {
    await reporter.onTestRunEnd?.([] as never, [], 'passed' as never);
  }

  it('a 201 response writes failed:false and logs the summary', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 201, body: { key: 'LOGIN-R1' } });
    const reporter = makeReporter();
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    expect(readResultMarker()).toEqual({ present: true, marker: { failed: false } });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('LOGIN-R1'));
  });

  it('a 207 response with default config writes failed:false and logs unmatched keys', async () => {
    mockedHttpClient.postImport.mockResolvedValue({
      status: 207,
      body: { matched: 0, unmatched: [{ caseKey: 'LOGIN-42' }] },
    });
    const reporter = makeReporter();
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    expect(readResultMarker()).toEqual({ present: true, marker: { failed: false } });
  });

  it('a 207 response with failOnUnmatched enabled writes failed:true', async () => {
    mockedHttpClient.postImport.mockResolvedValue({
      status: 207,
      body: { matched: 0, unmatched: [{ caseKey: 'LOGIN-42' }] },
    });
    const reporter = makeReporter({ failOnUnmatched: true });
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    expect(readResultMarker()).toEqual({
      present: true,
      marker: { failed: true, reason: expect.stringContaining('LOGIN-42') },
    });
  });

  it('a 207 response with default config suggests enabling failOnUnmatched', async () => {
    mockedHttpClient.postImport.mockResolvedValue({
      status: 207,
      body: { matched: 0, unmatched: [{ caseKey: 'LOGIN-42' }] },
    });
    const reporter = makeReporter();
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('enable failOnUnmatched'));
  });

  it('a 207 response with failOnUnmatched already enabled does not suggest enabling it', async () => {
    mockedHttpClient.postImport.mockResolvedValue({
      status: 207,
      body: { matched: 0, unmatched: [{ caseKey: 'LOGIN-42' }] },
    });
    const reporter = makeReporter({ failOnUnmatched: true });
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    const allLogs = logSpy.mock.calls.flat().join(' ');
    expect(allLogs).not.toContain('enable failOnUnmatched');
    expect(allLogs).toContain('failing the build');
  });

  it('a network error writes failed:true with the real error as reason, not a generic fallback', async () => {
    mockedHttpClient.postImport.mockRejectedValue(new Error('connection refused'));
    const reporter = makeReporter();
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    const outcome = readResultMarker();
    expect(outcome).toEqual({ present: true, marker: { failed: true, reason: expect.stringContaining('connection refused') } });
    // check's own generic fallback message must never be needed here --
    // the real cause is always available and must be threaded through.
    expect((outcome as { marker: { reason: string } }).marker.reason).not.toContain('failOnUnmatched');
  });

  it('a 5xx response writes failed:true with the status in the reason, not a generic fallback', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 500, body: { error: 'boom' } });
    const reporter = makeReporter();
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    expect(readResultMarker()).toEqual({
      present: true,
      marker: { failed: true, reason: expect.stringContaining('500') },
    });
  });

  it('a genuinely failing test still produces a failure element and still submits', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 201, body: { key: 'LOGIN-R1' } });
    const reporter = makeReporter();
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({
          annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }],
          result: () => ({ state: 'failed', errors: [{ message: 'expected true to be false' }] }),
        }),
      ]) as never,
    );
    await runEnd(reporter);
    expect(mockedHttpClient.postImport).toHaveBeenCalledTimes(1);
    const report = mockedHttpClient.postImport.mock.calls[0][3];
    expect(report).toContain('<failure message="expected true to be false">');
  });

  it('a skipped test produces no submission-blocking error and is tracked as skipped', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 201, body: { key: 'LOGIN-R1' } });
    const reporter = makeReporter();
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ result: () => ({ state: 'skipped', errors: undefined }) }),
      ]) as never,
    );
    await runEnd(reporter);
    const report = mockedHttpClient.postImport.mock.calls[0][3];
    expect(report).toContain('<skipped/>');
  });

  it('an untagged test carries no testpulse properties in the submitted report', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 201, body: { key: 'LOGIN-R1' } });
    const reporter = makeReporter();
    reporter.onTestModuleEnd?.(makeFakeTestModule('login.spec.ts', [makeFakeTestCase({ name: 'untagged' })]) as never);
    await runEnd(reporter);
    const report = mockedHttpClient.postImport.mock.calls[0][3];
    expect(report).not.toContain('testpulse_case_key');
  });

  it('case keys from multiple test modules are all included in one submission', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 201, body: { key: 'LOGIN-R1' } });
    const reporter = makeReporter();
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-1', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('signup.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'SIGNUP-1', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    const report = mockedHttpClient.postImport.mock.calls[0][3];
    expect(report).toContain('LOGIN-1');
    expect(report).toContain('SIGNUP-1');
    expect(report.match(/<testsuite /g)).toHaveLength(2);
  });

  it('groups multiple attachments under the same case key into the submitted attachments array', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 201, body: { key: 'LOGIN-R2' } });
    const reporter = makeReporter();
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({
          annotations: () => [
            { message: 'LOGIN-45', type: 'testpulse_case_key' },
            { message: 'a.png', type: 'testpulse_attachment', attachment: { body: 'YQ==', contentType: 'image/png' } },
            { message: 'b.png', type: 'testpulse_attachment', attachment: { body: 'Yg==', contentType: 'image/png' } },
          ],
        }),
      ]) as never,
    );
    await runEnd(reporter);
    const attachments = mockedHttpClient.postImport.mock.calls[0][4];
    expect(attachments).toHaveLength(2);
    expect(attachments.every((a) => a.caseKey === 'LOGIN-45')).toBe(true);
    expect(attachments.map((a) => a.filename)).toEqual(['a.png', 'b.png']);
  });

  it('dry run previews matches without submitting', async () => {
    mockedHttpClient.getCases.mockResolvedValue({ status: 200, body: [{ key: 'LOGIN-42' }] });
    const reporter = makeReporter({ dryRun: true });
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    expect(mockedHttpClient.postImport).not.toHaveBeenCalled();
    expect(readResultMarker()).toEqual({ present: true, marker: { failed: false } });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('would match: LOGIN-42'));
  });

  it('a dry-run fetch failure fails closed: writes failed:true and logs credential-safe error only', async () => {
    mockedHttpClient.getCases.mockRejectedValue(new Error('connection refused'));
    const reporter = makeReporter({ dryRun: true, url: 'https://user:s3cr3t@testpulse.example' });
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    expect(readResultMarker()).toEqual({
      present: true,
      marker: { failed: true, reason: expect.stringContaining('connection refused') },
    });
    const allCalls = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(allCalls).not.toContain('s3cr3t');
    expect(allCalls).toContain('connection refused');
    // The reason threaded through to the marker (and thus to `check`'s
    // output) must also never carry the credential.
    expect((readResultMarker() as { marker: { reason: string } }).marker.reason).not.toContain('s3cr3t');
  });

  it('a dry-run preview 5xx response also fails closed', async () => {
    mockedHttpClient.getCases.mockResolvedValue({ status: 500, body: { error: 'boom' } });
    const reporter = makeReporter({ dryRun: true });
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    expect(readResultMarker()).toEqual({
      present: true,
      marker: { failed: true, reason: expect.stringContaining('500') },
    });
    expect(mockedHttpClient.postImport).not.toHaveBeenCalled();
  });

  it('writes a failed marker naming only the missing configuration when required config is missing', async () => {
    const reporter = new TestPulseReporter({});
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    expect(readResultMarker()).toEqual({
      present: true,
      marker: { failed: true, reason: expect.stringContaining('TESTPULSE_TOKEN') },
    });
    expect(mockedHttpClient.postImport).not.toHaveBeenCalled();
  });

  it('names only the missing variables when some configuration is present, never a present value', async () => {
    const reporter = new TestPulseReporter({ url: 'https://distinguishing-value.example', project: 'LOGIN' });
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    const outcome = readResultMarker();
    expect(outcome.present).toBe(true);
    if (outcome.present) {
      expect(outcome.marker.reason).toContain('TESTPULSE_TOKEN');
      expect(outcome.marker.reason).not.toContain('distinguishing-value');
      expect(outcome.marker.reason).not.toContain('LOGIN');
    }
  });

  it('never logs the token', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 500, body: { error: 'boom' } });
    const reporter = makeReporter();
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    const allCalls = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(allCalls).not.toContain('t0k3n');
  });

  it('on a submission error, logs only status/message/redacted-URL, never a raw error/request object', async () => {
    const leakyError = Object.assign(new Error('socket hang up'), {
      request: { headers: { authorization: 'Bearer t0k3n' } },
      response: { headers: { authorization: 'Bearer t0k3n' } },
    });
    mockedHttpClient.postImport.mockRejectedValue(leakyError);
    const reporter = makeReporter();
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    const allCalls = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(allCalls).not.toContain('t0k3n');
    expect(allCalls).not.toContain('authorization');
    expect(allCalls).toContain('socket hang up');
  });

  it('redacts embedded URL credentials in submission-error logs', async () => {
    mockedHttpClient.postImport.mockRejectedValue(new Error('boom'));
    const reporter = makeReporter({ url: 'https://user:s3cr3t@testpulse.example' });
    reporter.onTestModuleEnd?.(
      makeFakeTestModule('login.spec.ts', [
        makeFakeTestCase({ annotations: () => [{ message: 'LOGIN-42', type: 'testpulse_case_key' }] }),
      ]) as never,
    );
    await runEnd(reporter);
    const allCalls = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(allCalls).not.toContain('s3cr3t');
  });
});
