import type { TestContext } from 'vitest';

export interface CaseOptions {
  platform?: string;
  version?: string;
  tags?: string[];
}

/**
 * Tags the currently-running Vitest test with a TestPulse case key, via
 * Vitest's own native, first-party test-annotation API
 * (`context.annotate(message, type)`). Confirmed by reading
 * `@vitest/runner`'s actual source (`createTestContext` in
 * `chunk-hooks.js`): the call round-trips through
 * `runner.onTestAnnotate(test, annotation)` and pushes the *resolved*
 * annotation onto `test.annotations` -- the same array
 * `context.task.annotations` exposes for synchronous readback, and the
 * same array a custom reporter's `TestCase.annotations()` exposes.
 *
 * Since `annotate()` is genuinely async, `Case` returns a `Promise` --
 * callers must `await` it (`await Case(context, 'LOGIN-42')`) so the
 * annotation has actually landed on `context.task.annotations` before
 * the test body continues or returns. Unlike Jest/Jasmine, Vitest has no
 * implicit "current test" global reachable from arbitrary code --
 * `annotate` is only reachable via the test context parameter itself
 * (`test('...', async (context) => {...})`), so `Case` requires that
 * context as an explicit first argument, matching Mocha's `Case(this, ...)`
 * shape rather than Jest's/Jasmine's implicit-global one.
 *
 * No scratch-directory bookkeeping of any kind -- Vitest's own
 * annotation array is the single source of truth for what a test
 * declared.
 */
export async function Case(context: TestContext, caseKey: string, opts?: CaseOptions): Promise<void> {
  await context.annotate(caseKey, 'testpulse_case_key');
  if (opts?.platform !== undefined) {
    await context.annotate(opts.platform, 'testpulse_platform');
  }
  if (opts?.version !== undefined) {
    await context.annotate(opts.version, 'testpulse_version');
  }
  if (opts?.tags !== undefined) {
    await context.annotate(opts.tags.join(','), 'testpulse_tags');
  }
}
