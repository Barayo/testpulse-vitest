import * as path from 'path';
import type { Reporter, SerializedError, TestModule, TestRunEndReason } from 'vitest/node';
import { redacted, redactUrl, ReporterOptions, resolveConfig, ResolvedConfig } from './config';
import { getCases, ImportAttachment, postImport } from './httpClient';
import { buildJUnitXmlFromTestCases, ModuleTestCases, TestCaseLike } from './xmlBuilder';
import { writeResultMarker } from './resultMarker';

function extractError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Names only the specific TESTPULSE_* variables that are missing, never
 * the resolved value of a setting that IS present -- since some
 * settings (a resolved `url`) can carry embedded credentials in an
 * unusual configuration, and `check`'s own output only ever forwards
 * this string verbatim.
 */
function missingConfigReason(config: ResolvedConfig): string | null {
  const missing: string[] = [];
  if (!config.url) missing.push('TESTPULSE_URL');
  if (!config.token) missing.push('TESTPULSE_TOKEN');
  if (!config.project) missing.push('TESTPULSE_PROJECT');
  if (missing.length === 0) return null;
  return `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required (set directly, or via reporter options)`;
}

function declaredCaseKey(testCase: TestCaseLike): string | undefined {
  return testCase.annotations().find((a) => a.type === 'testpulse_case_key')?.message;
}

/** Vitest's own `annotate()` base64-encodes a `Uint8Array` body before storing it (confirmed by reading `@vitest/runner`'s `encodeUint8Array`); a plain string body is used as-is. */
function toBase64(body: string | Uint8Array | undefined): string {
  if (body === undefined) return '';
  if (typeof body === 'string') return body;
  return Buffer.from(body).toString('base64');
}

/**
 * A Vitest reporter that builds JUnit XML directly from each
 * `TestCase`'s own `annotations()` (set via `testpulse.Case()`/
 * `testpulseAttach.Attach()`, which call Vitest's native
 * `context.annotate()`) and auto-submits it. No dependency on the
 * built-in `junit` reporter's file output -- confirmed unsafe via a real
 * repro (design.md's Context #4): its file write races with other
 * configured reporters' own hooks, with no ordering guarantee.
 *
 * Registered via the `reporters` array in `vitest.config.ts`
 * (`reporters: ['default', 'testpulse-vitest']`, optionally
 * `['testpulse-vitest', { url: ..., project: ... }]` for options).
 * Vitest's own custom-reporter loader instantiates it as
 * `new CustomReporter(reporterOptions)` -- a single options argument,
 * unlike Mocha's `(runner, options)` -- confirmed by reading
 * `createReporters`/`loadCustomReporterModule` in Vitest's own bundled
 * `cli-api.js`.
 *
 * Follows the modern two-phase Reporter lifecycle: `onTestModuleEnd`
 * (fired once per test file, after that file's tests complete)
 * accumulates each file's own `TestCase`s; `onTestRunEnd` (fired once,
 * after every module has finished) assembles the final `<testsuites>`
 * document from the accumulated per-module data, resolves config,
 * submits (or dry-run previews), and writes the result marker. The
 * separate `check` CLI (not a bare `process.exitCode` assignment here)
 * remains the documented, supported mechanism for failing the build --
 * the same hybrid reporter-plus-check-CLI architecture already proven
 * for Jasmine/Mocha -- for consistency across this plugin family, even
 * though `test/e2e/exitCode.e2e.test.ts` verified during implementation
 * that `process.exitCode` set here actually does survive on the Vitest
 * versions tested (contrary to this project's own design.md); that
 * survival isn't part of Vitest's documented reporter contract.
 */
export class TestPulseReporter implements Reporter {
  /** Exposed so tests can await onTestRunEnd's async handling deterministically. */
  public donePromise: Promise<void> = Promise.resolve();

  private modules: ModuleTestCases[] = [];
  private reporterOptions: ReporterOptions;

  constructor(options: ReporterOptions = {}) {
    this.reporterOptions = options;
  }

  onTestModuleEnd(testModule: TestModule): void {
    const suiteName = path.relative(process.cwd(), testModule.moduleId) || testModule.moduleId;
    const testCases = Array.from(testModule.children.allTests()) as unknown as TestCaseLike[];
    this.modules.push({ suiteName, testCases });
  }

  onTestRunEnd(
    _testModules?: ReadonlyArray<TestModule>,
    _unhandledErrors?: ReadonlyArray<SerializedError>,
    _reason?: TestRunEndReason,
  ): Promise<void> {
    this.donePromise = this.handleRunEnd();
    return this.donePromise;
  }

  private async handleRunEnd(): Promise<void> {
    const config = resolveConfig(this.reporterOptions);
    const report = buildJUnitXmlFromTestCases(this.modules);

    const declaredCaseKeys = new Set<string>();
    for (const m of this.modules) {
      for (const testCase of m.testCases) {
        const key = declaredCaseKey(testCase);
        if (key !== undefined) declaredCaseKeys.add(key);
      }
    }

    const reason = missingConfigReason(config);
    if (reason) {
      // eslint-disable-next-line no-console
      console.error(`testpulse-vitest: ${reason}. Skipping submission.`);
      // Writing a failed marker here (rather than leaving none at all)
      // is what lets `check` name the real cause -- otherwise "no
      // marker found" reads as "the reporter never ran," which is
      // wrong: it did run, and correctly declined to submit.
      writeResultMarker({ failed: true, reason });
      return;
    }

    // TypeScript narrowing: reason === null above guarantees these three.
    const url = config.url as string;
    const token = config.token as string;
    const project = config.project as string;

    if (config.dryRun) {
      await this.runDryRun(url, project, token, declaredCaseKeys);
      return;
    }

    await this.runSubmit(url, project, token, report, declaredCaseKeys, config.failOnUnmatched);
  }

  private async runDryRun(
    url: string,
    project: string,
    token: string,
    declaredCaseKeys: Set<string>,
  ): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('testpulse-vitest: dry run -- no import will be submitted');
    try {
      const result = await getCases(url, project, token);
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`fetch failed: status ${result.status}`);
      }
      const existing = new Set((result.body as Array<{ key: string }>).map((c) => c.key));
      for (const key of declaredCaseKeys) {
        // eslint-disable-next-line no-console
        console.log(existing.has(key) ? `  would match: ${key}` : `  would NOT match (no such case): ${key}`);
      }
      writeResultMarker({ failed: false });
    } catch (e) {
      // Dry run is often used specifically to smoke-test that
      // configuration/auth is correct in CI -- failing closed here (per
      // this change's own gating review) means a broken
      // TESTPULSE_TOKEN/TESTPULSE_URL never silently reports a green
      // build in exactly the mode someone reaches for to check that.
      // eslint-disable-next-line no-console
      console.error(`testpulse-vitest: dry-run fetch failed: ${extractError(e)} (url: ${redactUrl(url)})`);
      writeResultMarker({ failed: true });
    }
  }

  private async runSubmit(
    url: string,
    project: string,
    token: string,
    report: string,
    declaredCaseKeys: Set<string>,
    failOnUnmatched: boolean,
  ): Promise<void> {
    const attachments: ImportAttachment[] = [];
    for (const m of this.modules) {
      for (const testCase of m.testCases) {
        const caseKey = declaredCaseKey(testCase);
        if (caseKey === undefined) continue;
        for (const annotation of testCase.annotations()) {
          if (annotation.type === 'testpulse_attachment' && annotation.attachment) {
            attachments.push({
              caseKey,
              filename: annotation.message,
              contentType: annotation.attachment.contentType ?? 'application/octet-stream',
              data: toBase64(annotation.attachment.body),
            });
          }
        }
      }
    }

    try {
      const result = await postImport(url, project, token, report, attachments);
      if (result.status === 201) {
        const body = result.body as { key?: string };
        // eslint-disable-next-line no-console
        console.log(`testpulse-vitest: all tests matched, created run ${body.key}`);
        writeResultMarker({ failed: false });
      } else if (result.status === 207) {
        const body = result.body as { matched?: number; unmatched?: Array<{ caseKey: string }> };
        const unmatched = body.unmatched ?? [];
        // eslint-disable-next-line no-console
        console.log(`testpulse-vitest: ${body.matched} matched, ${unmatched.length} unmatched`);
        for (const u of unmatched) {
          // eslint-disable-next-line no-console
          console.log(`  unmatched: ${u.caseKey}`);
        }
        if (unmatched.length > 0) {
          // eslint-disable-next-line no-console
          console.log(
            failOnUnmatched
              ? 'testpulse-vitest: failing the build (failOnUnmatched is enabled)'
              : 'testpulse-vitest: enable failOnUnmatched to make this a hard failure',
          );
          writeResultMarker({ failed: failOnUnmatched });
        } else {
          writeResultMarker({ failed: false });
        }
      } else {
        // eslint-disable-next-line no-console
        console.error(`testpulse-vitest: submission failed: status ${result.status} (url: ${redactUrl(url)})`);
        writeResultMarker({ failed: true });
      }
    } catch (e) {
      // Only the extracted message and a credential-stripped URL are
      // logged -- never the raw caught error object, since most JS HTTP
      // clients' error objects carry the outgoing request's headers,
      // including Authorization.
      // eslint-disable-next-line no-console
      console.error(`testpulse-vitest: submission failed: ${extractError(e)} (url: ${redactUrl(url)})`);
      writeResultMarker({ failed: true });
    }
  }
}

// Re-exported for callers that want to log a config without the token.
export { redacted };
