import type { TestContext } from 'vitest';

export const SUPPORTED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function isSupportedContentType(contentType: string): boolean {
  return SUPPORTED_CONTENT_TYPES.includes(contentType);
}

/**
 * Records a screenshot/artifact attachment for `caseKey`, which must
 * equal the currently-executing test's own `Case()`-declared case key.
 * `context` is the same Vitest `TestContext` handle `Case()` requires.
 *
 * Verified against `context.task.annotations` for an existing
 * `testpulse_case_key` entry matching `caseKey` -- the same "verified
 * via readback" pattern Jasmine/Mocha use, here backed by Vitest's own
 * genuinely native annotation array rather than a custom property.
 * Content type is validated FIRST, before the case-key check.
 *
 * On success, calls `context.annotate(filename, 'testpulse_attachment',
 * { body: data, contentType })` -- the attachment's bytes travel
 * entirely through Vitest's own annotation mechanism, never touching
 * disk or a scratch directory (unlike every prior JS plugin's
 * attachmentStore). `Attach` is async for the same reason `Case` is:
 * `annotate()` genuinely round-trips through the runner before the
 * annotation lands.
 */
export async function Attach(
  context: TestContext,
  caseKey: string,
  data: Buffer,
  filename: string,
  contentType: string,
): Promise<void> {
  if (!isSupportedContentType(contentType)) {
    throw new Error(
      `testpulse-vitest: unsupported content type '${contentType}' (allowed: ${SUPPORTED_CONTENT_TYPES.join(', ')})`,
    );
  }

  const declared = context.task.annotations.some(
    (a) => a.type === 'testpulse_case_key' && a.message === caseKey,
  );
  if (!declared) {
    throw new Error(
      `testpulse-vitest: case key '${caseKey}' has not been declared via Case() by the currently-executing test`,
    );
  }

  await context.annotate(filename, 'testpulse_attachment', { body: data, contentType });
}
