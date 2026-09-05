// Fixture for test/e2e/junitRace.e2e.test.ts -- formalizes this
// project's own repro (design.md's Context #4) that the built-in
// `junit` reporter's FILE output write is asynchronous relative to
// other configured reporters' own hooks, with no ordering guarantee.
// A minimal probe reporter (NOT TestPulseReporter itself, which never
// reads this file at all) reads the junit output file synchronously,
// with no artificial delay, inside its own onTestRunEnd -- exactly
// mirroring this session's original manual repro -- and separately
// reads it again after an artificial 50ms delay, recording both so the
// e2e test can assert the immediate read is incomplete while the
// delayed read is complete.
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
      const immediate = readSafely();
      setTimeout(() => {
        const delayed = readSafely();
        fs.writeFileSync(probeResultPath, JSON.stringify({ immediate, delayed }));
        resolve();
      }, 50);
    });
  }
}

module.exports = {
  test: {
    include: ['spec/**/*.spec.js'],
    reporters: [['junit', { outputFile: junitOutputPath }], new JunitRaceProbeReporter()],
  },
};
