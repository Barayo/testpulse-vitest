import * as fs from 'fs';
import * as path from 'path';

export interface ResultMarker {
  failed: boolean;
  reason?: string;
}

function markerPath(): string {
  return path.join(process.cwd(), '.testpulse', 'result.json');
}

/**
 * Records whether the run's outcome should fail the build. `check`
 * (rather than a bare `process.exitCode` assignment inside the
 * reporter) is the documented, supported mechanism for failing a build
 * here, matching Jasmine's/Mocha's own plugins for consistency across
 * this project's whole plugin family. Note: `test/e2e/exitCode.e2e.test.ts`
 * verified during implementation, contrary to this project's own
 * design.md, that `process.exitCode` set in a reporter's `onTestRunEnd`
 * actually DOES survive to the final exit code on Vitest 3.x/5.x for a
 * fully-passing run (Vitest's own source only forces `process.exitCode`
 * when the run itself failed) -- but relying on that isn't part of
 * Vitest's documented reporter contract, so this marker-plus-`check`
 * mechanism remains the supported path regardless.
 * how a submission error or an unmatched-case-with-failOnUnmatched
 * outcome actually fails the build.
 */
export function writeResultMarker(marker: ResultMarker): void {
  const dir = path.dirname(markerPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(markerPath(), JSON.stringify(marker));
}

export type ReadResultMarkerOutcome =
  | { present: true; marker: ResultMarker }
  | { present: false };

export function readResultMarker(): ReadResultMarkerOutcome {
  if (!fs.existsSync(markerPath())) {
    return { present: false };
  }
  const marker: ResultMarker = JSON.parse(fs.readFileSync(markerPath(), 'utf8'));
  return { present: true, marker };
}
