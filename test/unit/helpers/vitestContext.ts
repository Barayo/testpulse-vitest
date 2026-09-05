import type { TestAnnotation, TestContext } from 'vitest';
import type { TestAttachment } from '@vitest/runner';

/**
 * A realistic fixture standing in for Vitest's real `TestContext`.
 *
 * Vitest's own `annotate()` (read via `@vitest/runner`'s
 * `chunk-hooks.js`'s `createTestContext`) is genuinely async: it awaits
 * a round trip through `runner.onTestAnnotate(test, annotation)` and
 * only then pushes the *resolved* annotation onto `test.annotations`
 * (the very array `context.task.annotations` exposes). A real Vitest
 * runner isn't practically constructible at unit-test speed, so this
 * fixture reproduces that same push-after-resolve contract faithfully
 * (including the default `type: 'notice'` when omitted) rather than a
 * bare synchronous stub -- the real end-to-end behavior across a genuine
 * nested `vitest run` is separately proven by test/e2e/*.
 */
export function buildTestContext(name = 'a test'): { context: TestContext; annotations: TestAnnotation[] } {
  const annotations: TestAnnotation[] = [];

  const annotate = jest.fn(
    async (message: string, typeOrAttachment?: string | TestAttachment, attachment?: TestAttachment) => {
      const type = typeof typeOrAttachment === 'string' ? typeOrAttachment : 'notice';
      const resolvedAttachment = typeof typeOrAttachment === 'string' ? attachment : typeOrAttachment;
      const resolved: TestAnnotation = { message, type };
      if (resolvedAttachment) {
        resolved.attachment = resolvedAttachment;
      }
      annotations.push(resolved);
      return resolved;
    },
  ) as unknown as TestContext['annotate'];

  const context = {
    task: { name, annotations },
    annotate,
  } as unknown as TestContext;

  return { context, annotations };
}
