// Fixture for test/e2e/exitCode.e2e.test.ts -- formalizes the verified
// (not the originally assumed) finding: a custom reporter's
// process.exitCode assignment in onTestRunEnd DOES survive to the final
// exit code for an otherwise fully-passing run (design.md's Context
// #5). A minimal probe reporter (NOT TestPulseReporter itself) sets
// process.exitCode = 1 in onTestRunEnd; the assertion is that the real
// nested vitest process exits 1.
class ExitCodeProbeReporter {
  onTestRunEnd() {
    process.exitCode = 1;
  }
}

module.exports = {
  test: {
    include: ['spec/**/*.spec.js'],
    reporters: ['default', new ExitCodeProbeReporter()],
  },
};
