import { readResultMarker } from './resultMarker';

/**
 * The documented, supported mechanism for failing the build for a
 * submission error or an unmatched-case outcome. `test/e2e/exitCode.e2e.test.ts`
 * verified during implementation that a reporter's own `process.exitCode`
 * assignment actually does survive on the Vitest versions tested here
 * (contrary to this project's own design.md, which assumed otherwise) --
 * but that isn't part of Vitest's documented reporter contract, so
 * `check` (reading the `.testpulse/result.json` marker `TestPulseReporter`
 * writes) remains the supported path, matching Jasmine's/Mocha's own
 * plugins for consistency.
 *
 * Prints only what the marker itself carries (or a generic,
 * non-file-system-error message when the marker is absent entirely) --
 * never reconstructs a message using any other resolved configuration
 * value, so a `reason` naming a missing `TESTPULSE_TOKEN` never ends up
 * alongside an echoed `url` or other setting.
 */
export function checkExitCode(): number {
  const outcome = readResultMarker();
  if (!outcome.present) {
    // eslint-disable-next-line no-console
    console.error(
      'testpulse-vitest: no .testpulse/result.json found -- likely cause: the ' +
        "TestPulseReporter is not registered in your vitest.config.ts's " +
        '`test.reporters` array, or the config file was not actually loaded',
    );
    return 1;
  }
  if (outcome.marker.failed) {
    // eslint-disable-next-line no-console
    console.error(
      outcome.marker.reason
        ? `testpulse-vitest: ${outcome.marker.reason}`
        : 'testpulse-vitest: submission failed or was unmatched with failOnUnmatched set',
    );
    return 1;
  }
  return 0;
}
