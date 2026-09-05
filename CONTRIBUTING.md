# Contributing

## Setup

```bash
npm install
npm run build
```

## Testing

Tests are layered:

- **Unit tests** (`test/unit/`, `npm test`) — `Case`/`Attach`, the XML
  builder, `config`, `check`, and the reporter each tested in isolation.
  `Case`/`Attach` tests run against a realistic fixture Vitest
  `TestContext` (`test/unit/helpers/vitestContext.ts`) that reproduces
  Vitest's own real `annotate()` contract (confirmed by reading
  `@vitest/runner`'s `createTestContext`: it awaits a round trip through
  `runner.onTestAnnotate`, then pushes the *resolved* annotation onto
  `test.annotations`) — a genuinely real Vitest runner isn't practically
  constructible at unit-test speed, so this fixture reproduces that
  exact contract rather than a bare synchronous stub. Reporter tests
  mock `../../src/httpClient` via `jest.mock()` and use realistic
  `TestModule`/`TestCase`-like fixtures
  (`test/unit/helpers/vitestReporterObjects.ts`).
- **End-to-end tests** (`test/e2e/`, `npm run test:e2e`) — spawn a real
  nested `vitest run` process against a fixture project under
  `test/fixtures/`, proving the pieces actually integrate (`Case`/
  `Attach` → the reporter → the submitted request → the result marker →
  `check`'s exit code). These run against the built `dist/` output, so
  `npm run test:e2e` rebuilds first. A real stub HTTP server
  (`test/e2e/helpers/stubImportServer.ts`) stands in for the TestPulse
  import API.

  Two of these formalize real findings from this project's own research
  as permanent regression tests, so a future Vitest upgrade that
  changes either behavior is caught by CI rather than silently assumed
  still true:
  - `test/e2e/exitCode.e2e.test.ts` — a minimal probe reporter (not
    `TestPulseReporter`) sets `process.exitCode = 1` in `onTestRunEnd`
    against a fully-passing run. **This asserts the behavior actually
    verified during implementation** (the assignment survives, on
    Vitest 3.x/5.x) rather than this project's own original design
    assumption (that it wouldn't) — see the README's "Exit code"
    section and `src/check.ts`'s doc comment for why `check` remains
    the supported mechanism regardless.
  - `test/e2e/junitRace.e2e.test.ts` — configures both the built-in
    `junit` reporter and a probe reporter in the same config, and
    confirms a synchronous, no-delay read of the junit reporter's output
    file from another reporter's own `onTestRunEnd` is unreliable
    relative to a delayed read — justifying why `TestPulseReporter`
    builds JUnit XML directly rather than depending on that file.

  `test/e2e/submission.e2e.test.ts` also covers the two-phase
  `onTestModuleEnd`/`onTestRunEnd` reporter lifecycle across a real
  multi-file run, confirming case keys from different test files are
  correctly attributed to their own file's `<testsuite>` in the single
  submitted report.

Run everything: `npm run test:all`.

TDD is the standing practice: write the failing test first, then the
minimal implementation to make it pass.

### Testing against multiple Vitest majors locally

The CI matrix (`.github/workflows/ci.yml`) tests across Node LTS
versions × Vitest majors — this is what caught a real cross-major bug
in `testpulse-mocha`'s own CI (mocha 9's CLI bin path had no `.js`
extension, unlike mocha 10+) that local development alone never caught,
since the locally-installed version masked it. To reproduce that
diligence locally before relying on CI:

```bash
npm install --no-save vitest@^4
npm run test:all
npm install --no-save vitest@^5
npm run test:all
npm install  # restore the version pinned in package.json
```

## Release process

Releases are automated via [`semantic-release`](https://semantic-release.gitbook.io/)
on merge to `main`, following [Angular/Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, etc.) — see `.releaserc.json`. Publishing to npm uses
[trusted publishing (OIDC)](https://docs.npmjs.com/trusted-publishers/), so
there's no `NPM_TOKEN` secret to manage day-to-day.

**The very first publish is a one-time exception**: npm's OIDC trusted
publishing can only be configured for a package that already exists on
the registry, so it can't create a brand-new package on its own first
publish. Before the first release, publish `0.1.0` (or whatever version
`package.json` currently holds) manually with a real npm login/token
from a maintainer's machine, then configure a Trusted Publisher for
`testpulse-vitest` on npmjs.com pointing at this repo's `release.yml`
workflow. Every release after that goes through OIDC automatically.

If a release's publish step fails after its version-bump commit/tag has
already been pushed (a real risk with `semantic-release`'s prepare-before-publish
ordering), trigger `.github/workflows/release.yml` manually
(`workflow_dispatch`) to publish the already-tagged version directly,
rather than re-running the push-triggered flow.
