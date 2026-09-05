import { runNestedVitest, fixturePath } from './helpers/runVitest';

/**
 * IMPORTANT CORRECTION to this project's own design.md (Context #5):
 * design.md claimed, based on an earlier repro this session, that a
 * custom Vitest reporter's `process.exitCode = 1` set in `onTestRunEnd`
 * does NOT survive to the final process exit code. Re-verified during
 * implementation with a real nested `vitest run` subprocess (both via
 * the resolved binary directly and via `npx vitest`), against BOTH
 * Vitest 3.2.7 and 5.0.0, with a controlled comparison (the same
 * fixture with and without the probe reporter): **the assignment DOES
 * survive**. Reading Vitest's own source confirms why:
 * `index.B89dZ0-N.js` only forces `process.exitCode = 1` when the run's
 * own `state !== "passed"` -- for a genuinely passing run, Vitest never
 * touches `process.exitCode` at all, so nothing overwrites whatever a
 * reporter already set.
 *
 * This test formalizes the VERIFIED (not the originally assumed)
 * behavior, so a future Vitest release that changes it is caught. It
 * does not change `testpulse-vitest`'s own architecture: the separate
 * `check` CLI reading `.testpulse/result.json` remains the documented,
 * supported way to fail a build here (matching Jasmine's/Mocha's own
 * plugins for consistency, and because relying on `process.exitCode`
 * surviving is relying on behavior that isn't part of Vitest's own
 * documented reporter contract, only on what this repro happens to
 * observe on the versions tested) -- but the ORIGINAL justification
 * ("a reporter cannot influence the exit code at all") does not hold on
 * the versions tested, and this test says so plainly rather than
 * asserting the disproven claim.
 */
describe('a custom reporter\'s process.exitCode DOES survive to the final exit code (real nested vitest run, contra design.md\'s original assumption)', () => {
  it('process.exitCode set in onTestRunEnd against a fully-passing run determines the final exit code', async () => {
    const fixtureDir = fixturePath('exit-code-probe');
    const result = await runNestedVitest(fixtureDir, `${fixtureDir}/vitest.config.js`);

    // Verified truth (not the originally assumed limitation): the
    // reporter's own process.exitCode = 1 sticks, and the run's
    // underlying test still shows as fully passed.
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('1 passed');
  });
});
