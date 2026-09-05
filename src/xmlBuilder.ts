/**
 * Escapes every value written into the report's element text or
 * attribute content, since this reporter builds JUnit XML directly
 * rather than delegating to a third-party writer -- including the
 * built-in `junit` reporter, whose FILE output composing unsafely races
 * with other configured reporters (see design.md's Context #4). Test
 * names, case keys, and failure messages routinely embed data from the
 * code under test, not just literal strings the test author wrote, so
 * none of it is trusted as already-safe. A `]]>` sequence needs no
 * special handling beyond the standard escapes below, since this
 * builder never emits a CDATA section for any value to begin with --
 * the `>` in `]]>` is escaped like any other `>`.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Mirrors the shape of Vitest's real `TestAnnotation` (`@vitest/runner`). */
export interface TestCaseAnnotationLike {
  message: string;
  type: string;
  attachment?: { body?: string | Uint8Array; contentType?: string; path?: string };
}

/** Mirrors the shape of Vitest's real `TestResult` (`state`/`errors`). */
export interface TestCaseResultLike {
  state: 'passed' | 'failed' | 'skipped' | 'pending';
  errors?: ReadonlyArray<{ message?: string; stack?: string }>;
}

/**
 * The minimal surface this builder needs from a Vitest `TestCase` --
 * deliberately duck-typed (not importing Vitest's own class) so it can
 * be exercised with plain synthetic fixtures in fast unit tests, while
 * a real `TestCase` from a genuine nested `vitest run` structurally
 * satisfies it too (proven by the reporter's own e2e tests).
 */
export interface TestCaseLike {
  name: string;
  annotations(): ReadonlyArray<TestCaseAnnotationLike>;
  result(): TestCaseResultLike;
  diagnostic(): { duration: number } | undefined;
}

export interface ModuleTestCases {
  suiteName: string;
  testCases: TestCaseLike[];
}

const PROPERTY_ANNOTATION_TYPES = new Set(['testpulse_case_key', 'testpulse_platform', 'testpulse_version', 'testpulse_tags']);

/**
 * Splits a TestCase's raw annotations into the subset that becomes
 * `<properties>` (the `testpulse_case_key`/`_platform`/`_version`/`_tags`
 * family) versus `testpulse_attachment` entries, which are never written
 * into the XML `<properties>` block at all -- they travel to the
 * submission's separate `attachments` array instead (see reporter.ts).
 */
function extractProperties(annotations: ReadonlyArray<TestCaseAnnotationLike>): Record<string, string> | null {
  const properties: Record<string, string> = {};
  for (const annotation of annotations) {
    if (PROPERTY_ANNOTATION_TYPES.has(annotation.type)) {
      properties[annotation.type] = annotation.message;
    }
  }
  return Object.keys(properties).length > 0 ? properties : null;
}

function buildTestCaseXml(classname: string, testCase: TestCaseLike): string {
  const result = testCase.result();
  const duration = testCase.diagnostic()?.duration ?? 0;
  const properties = extractProperties(testCase.annotations());

  let body = '';
  if (properties) {
    const props = Object.entries(properties)
      .map(([key, value]) => `<property name="${escapeXml(key)}" value="${escapeXml(value)}"/>`)
      .join('');
    body += `<properties>${props}</properties>`;
  }

  if (result.state === 'failed') {
    const firstError = result.errors?.[0];
    const message = firstError?.message ? escapeXml(firstError.message) : 'test failed';
    const stack = firstError?.stack ? escapeXml(firstError.stack) : '';
    body += `<failure message="${message}">${stack}</failure>`;
  } else if (result.state === 'skipped' || result.state === 'pending') {
    body += '<skipped/>';
  }

  return `<testcase classname="${escapeXml(classname)}" name="${escapeXml(testCase.name)}" time="${duration / 1000}">${body}</testcase>`;
}

function buildTestSuiteXml(suiteName: string, testCases: TestCaseLike[]): string {
  const failures = testCases.filter((t) => t.result().state === 'failed').length;
  const skipped = testCases.filter((t) => t.result().state === 'skipped' || t.result().state === 'pending').length;
  const testcasesXml = testCases.map((t) => buildTestCaseXml(suiteName, t)).join('');

  return (
    `<testsuite name="${escapeXml(suiteName)}" tests="${testCases.length}" failures="${failures}" errors="0" skipped="${skipped}">` +
    testcasesXml +
    '</testsuite>'
  );
}

/**
 * Builds a JUnit XML report directly from Vitest `TestCase`-like objects
 * -- specifically their own `annotations()` (populated via
 * `testpulse.Case()`/`testpulseAttach.Attach()`'s calls to Vitest's
 * native `context.annotate()`) and `result()`. No dependency on the
 * built-in `junit` reporter's file output (confirmed unsafe -- see
 * design.md's Context #4) or any other third-party JUnit XML writer.
 * One `<testsuite>` per Vitest test module (file), so multi-file runs
 * correctly attribute each tagged `<testcase>` to its own file.
 */
export function buildJUnitXmlFromTestCases(modules: ModuleTestCases[]): string {
  const suites = modules.map((m) => buildTestSuiteXml(m.suiteName, m.testCases)).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>' + `<testsuites>${suites}</testsuites>`;
}
