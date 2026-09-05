import type { TestCaseAnnotationLike, TestCaseResultLike } from '../../../src/xmlBuilder';

/**
 * Realistic fixtures standing in for Vitest's real `TestModule`/`TestCase`
 * reporter-facing classes -- duck-typed to the exact surface
 * `TestPulseReporter` and `xmlBuilder` actually read (`.moduleId`,
 * `.children.allTests()`, `.name`, `.annotations()`, `.result()`,
 * `.diagnostic()`), confirmed by reading Vitest's own bundled
 * `reporters.d.BuRON0I0.d.ts`. The real end-to-end shape (a genuine
 * `TestModule`/`TestCase` from a real nested `vitest run`) is separately
 * proven by test/e2e/*.
 */
export interface FakeTestCase {
  name: string;
  annotations: () => TestCaseAnnotationLike[];
  result: () => TestCaseResultLike;
  diagnostic: () => { duration: number } | undefined;
}

export function makeFakeTestCase(overrides: Partial<FakeTestCase> = {}): FakeTestCase {
  return {
    name: 'a test',
    annotations: () => [],
    result: () => ({ state: 'passed', errors: undefined }),
    diagnostic: () => ({ duration: 5 }),
    ...overrides,
  };
}

export interface FakeTestModule {
  moduleId: string;
  children: { allTests: () => Generator<FakeTestCase, undefined, void> };
}

export function makeFakeTestModule(moduleId: string, testCases: FakeTestCase[]): FakeTestModule {
  return {
    moduleId,
    children: {
      allTests(): Generator<FakeTestCase, undefined, void> {
        return (function* () {
          yield* testCases;
          return undefined;
        })();
      },
    },
  };
}
