// Fixture for the case-tagging end-to-end test (test/e2e/case.e2e.test.ts).
//
// The reporter is instantiated directly from the built dist output
// (rather than referenced by the package-name string
// 'testpulse-vitest') for fixture-only determinism -- this directory
// has no node_modules of its own for Vitest's own module resolution to
// walk into, so `require(...)` here (evaluated in THIS file's own
// CommonJS module context, not Vite's) is the reliable path. A real npm
// consumer just uses `reporters: ['default', 'testpulse-vitest']` (see
// README) -- this direct-instantiation form is fixture-only plumbing,
// matching testpulse-mocha's/testpulse-jasmine's own fixture-config
// pattern of sidestepping their own package-resolution quirks.
//
// No reporter options are passed here -- TESTPULSE_* env vars, set by
// the e2e test harness itself, flow through `resolveConfig`'s
// env-wins-over-option resolution regardless.
const { TestPulseReporter } = require('../../../dist');

module.exports = {
  test: {
    include: ['spec/**/*.spec.js'],
    reporters: ['default', new TestPulseReporter()],
  },
};
