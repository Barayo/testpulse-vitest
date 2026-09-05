// Fixture for test/e2e/junitRace.e2e.test.ts -- formalizes this
// project's own repro (design.md's Context #4) that the built-in
// `junit` reporter's FILE output write is asynchronous relative to
// other configured reporters' own hooks, with no ordering guarantee.
// A minimal probe reporter (NOT TestPulseReporter itself, which never
// reads this file at all) reads the junit output file synchronously,
// with no artificial delay, inside its own onTestRunEnd -- exactly
// mirroring this session's original manual repro -- and separately
// polls for the complete file (rather than sleeping a fixed delay,
// which a real CI run showed can itself be too short on a slower
// runner than local dev -- polling makes the "control" read
// deterministic regardless of environment speed, while the immediate,
// zero-wait read still genuinely demonstrates the race).
const fs = require('fs');
const path = require('path');

const junitOutputPath = path.join(__dirname, 'junit-output.xml');
const probeResultPath = path.join(__dirname, 'probe-result.json');

class JunitRaceProbeReporter {
  onTestRunEnd() {
    return new Promise((resolve) => {
      const readSafely = () => {
        try {
          return fs.readFileSync(junitOutputPath, 'utf8');
        } catch {
          return '';
        }
      };
      const isComplete = (content) => content.includes('</testsuites>');
      const immediate = readSafely();

      const deadline = Date.now() + 5000;
      const pollUntilComplete = () => {
        const delayed = readSafely();
        if (isComplete(delayed) || Date.now() >= deadline) {
          fs.writeFileSync(probeResultPath, JSON.stringify({ immediate, delayed }));
          resolve();
        } else {
          setTimeout(pollUntilComplete, 20);
        }
      };
      pollUntilComplete();
    });
  }
}

module.exports = {
  test: {
    include: ['spec/**/*.spec.js'],
    reporters: [['junit', { outputFile: junitOutputPath }], new JunitRaceProbeReporter()],
  },
};
