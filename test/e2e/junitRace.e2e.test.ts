import * as fs from 'fs';
import * as path from 'path';
import { runNestedVitest, fixturePath } from './helpers/runVitest';

/**
 * Formalizes this project's own repro (design.md's Context #4) as a
 * permanent regression test: the built-in `junit` reporter's FILE
 * output write is asynchronous relative to other configured reporters'
 * own hooks. A probe reporter (not TestPulseReporter, which never reads
 * this file at all) reads the junit output file synchronously with no
 * artificial delay inside its own `onTestRunEnd`, and separately after
 * a 50ms delay. If a future Vitest upgrade makes the junit reporter's
 * write synchronous/ordered relative to other reporters, this test
 * starts failing -- which is exactly the point: it justifies why
 * TestPulseReporter builds JUnit XML directly rather than depending on
 * that file, and catches it if the underlying assumption ever changes.
 */
describe('the built-in junit reporter\'s file output races with other reporters (real nested vitest run)', () => {
  it('an immediate synchronous read of the junit output file is incomplete relative to a delayed read', async () => {
    const fixtureDir = fixturePath('junit-race-probe');
    const probeResultPath = path.join(fixtureDir, 'probe-result.json');
    const junitOutputPath = path.join(fixtureDir, 'junit-output.xml');
    fs.rmSync(probeResultPath, { force: true });
    fs.rmSync(junitOutputPath, { force: true });

    const result = await runNestedVitest(fixtureDir, path.join(fixtureDir, 'vitest.config.js'));
    expect(result.exitCode).toBe(0);

    expect(fs.existsSync(probeResultPath)).toBe(true);
    const probeResult = JSON.parse(fs.readFileSync(probeResultPath, 'utf8')) as {
      immediate: string;
      delayed: string;
    };

    // The delayed read (after the junit reporter's own async write has
    // had time to complete) is the real, complete report.
    expect(probeResult.delayed).toContain('junit race probe');
    expect(probeResult.delayed).toContain('</testsuites>');

    // The immediate, no-delay read is NOT reliably complete -- it is
    // either empty, just the XML declaration, or otherwise missing the
    // real content the delayed read has. This is the race itself: no
    // ordering guarantee between the junit reporter's own file write
    // and another configured reporter's onTestRunEnd hook.
    expect(probeResult.immediate).not.toEqual(probeResult.delayed);
    expect(probeResult.immediate.includes('junit race probe') && probeResult.immediate.includes('</testsuites>')).toBe(
      false,
    );

    fs.rmSync(probeResultPath, { force: true });
    fs.rmSync(junitOutputPath, { force: true });
  });
});
