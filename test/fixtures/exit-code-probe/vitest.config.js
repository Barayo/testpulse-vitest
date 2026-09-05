// Fixture for test/e2e/exitCode.e2e.test.ts -- formalizes this project's
// own repro (design.md's Context #5) that a custom Vitest reporter
// cannot reliably influence the final process exit code via
// process.exitCode, even against an otherwise fully-passing run. A
// minimal probe reporter (NOT TestPulseReporter itself) sets
// process.exitCode = 1 in onTestRunEnd; the assertion is that the real
// nested vitest process still exits 0.
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
