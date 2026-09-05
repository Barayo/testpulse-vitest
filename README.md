# testpulse-vitest

A Vitest reporter + `check` CLI for reporting test results into
[TestPulse](https://github.com/Barayo/TestPulse) — tags a test with a
TestPulse case key, and auto-submits a JUnit XML report the reporter
builds directly from the run (matching each tagged test to an existing
case).

> Requires `vitest` 1.0 or later.

Unlike every prior JS testing-framework plugin in this family
(Jest/Jasmine/Mocha), Vitest has a genuine, native, first-party
test-annotation API: `context.annotate(message, type, attachment?)`.
Its data — including attachment payloads — is fully readable from a
custom reporter via `TestCase.annotations()`. **This means no
scratch-directory side-channel is needed at all**, for either case-key
tagging or attachments: `Case`/`Attach` are thin wrappers over Vitest's
own mechanism.

The built-in `junit` reporter already writes annotations in exactly the
`<property name="{type}" value="{message}"/>` shape TestPulse's importer
expects — but composing with its *file* output is unsafe (a confirmed
real race: its write is asynchronous relative to other configured
reporters' own hooks, with no ordering guarantee). `testpulse-vitest`
therefore builds JUnit XML directly from each test's own annotations,
with no dependency on that file at all.

## Install

```sh
npm install --save-dev testpulse-vitest
```

## Set up the reporter

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', 'testpulse-vitest'],
  },
});
```

To pass reporter options, use the `[name, options]` tuple form:

```ts
export default defineConfig({
  test: {
    reporters: ['default', ['testpulse-vitest', { url: 'http://localhost:8080', project: 'LOGIN' }]],
  },
});
```

No `outputFile` entry is needed for `testpulse-vitest` itself — it
writes no file you need to point elsewhere, unlike the built-in `junit`
reporter.

## Tag your tests

`annotate()` is only reachable via the test's own context parameter —
Vitest has no implicit "current test" global, so `Case`/`Attach` take
that context as an explicit first argument (the same constraint Mocha's
plugin has, via `this`, for the same underlying reason: no ambient
handle to the running test exists outside it).

```ts
import { test } from 'vitest';
import { Case } from 'testpulse-vitest';

test('login succeeds', async (context) => {
  // Case() is async -- annotate() genuinely round-trips through
  // Vitest's own runner before the annotation lands, so it must be
  // awaited.
  await Case(context, 'LOGIN-42', { platform: 'linux', tags: ['smoke'] });
  // ...
});
```

Run your suite and check the result. A custom Vitest reporter has no
*documented* way to reliably determine the final process exit code (see
"Exit code" below for what this project actually found when it looked),
so `testpulse-vitest check` is the supported, version-independent way to
fail the build for a submission error or an unmatched case:

```sh
vitest run; vitest_status=$?
testpulse-vitest check; check_status=$?
[ "$vitest_status" -eq 0 ] && [ "$check_status" -eq 0 ]
```

**Don't chain these with `&&`** (`vitest run && testpulse-vitest check`)
— when a test fails, `vitest` exits non-zero and `&&` short-circuits, so
`check` never runs and its own diagnostic (e.g. "submission failed:
status 401") never prints, even though the overall exit code happens to
still be non-zero from the test failure alone. In CI, running each as
its own step (rather than one shell line) sidesteps this automatically,
since most CI systems already fail the job on any non-zero step.

## Attach screenshots/files

```ts
import { test } from 'vitest';
import { Case, Attach } from 'testpulse-vitest';

test('fails with a bad password', async (context) => {
  await Case(context, 'LOGIN-43');
  const screenshot = takeScreenshot();
  await Attach(context, 'LOGIN-43', screenshot, 'failure.png', 'image/png');
});
```

`Attach` only accepts a case key the *currently-executing* test has
itself declared via `Case` (verified against `context.task.annotations`)
— a mismatch, or a test that never called `Case`, throws. Content type
is validated before the case-key check. Only `image/png`, `image/jpeg`,
and `image/webp` are accepted. Multiple `Attach` calls under the same
case key within one test are all preserved.

**Attachments never touch disk.** Unlike every prior plugin in this
family (Jest/Jasmine/Mocha each needed a `.testpulse/` scratch
directory for attachment bytes), `Attach`'s data travels entirely
through Vitest's own `annotate()` mechanism — in memory / over Vitest's
own RPC to the reporter — with no filesystem write and no path-traversal
surface, because there is no filesystem path involved at all.

> **Combining `testpulse-vitest` with Vitest's built-in `html` reporter
> embeds your attachment bytes into that reporter's own output
> bundle.** This was verified empirically (a `testpulse_attachment`
> annotation's base64 body was found intact inside
> `.vitest/ui/html.meta.json.gz`, the metadata bundle behind the `html`
> reporter's report). If you publish that bundle as a CI artifact or a
> preview page (a common pattern — Vitest's own CLI output suggests
> `npx vite preview` on it), any screenshot you attached via `Attach()`
> for TestPulse's own private import rides along into that much more
> widely-visible artifact. `testpulse-vitest` has no code-level
> mitigation available for this — it's a property of the shared
> annotation mechanism, not a bug in this plugin — so avoid registering
> `html` alongside `testpulse-vitest` in any config that attaches
> sensitive screenshots, or scrub the resulting bundle before publishing
> it. (Separately confirmed: the built-in `json` reporter's output does
> **not** include annotation data at all, so this risk is specific to
> `html`.)

## Configuration

**The environment variable always wins over the reporter option**, for
every setting below — not just `token`. There is no third,
config-file-backed tier.

| Setting | Reporter option | Env var |
|---|---|---|
| API base URL | `url` | `TESTPULSE_URL` |
| API token | `token` | `TESTPULSE_TOKEN` |
| Project key | `project` | `TESTPULSE_PROJECT` |
| Fail on unmatched | `failOnUnmatched` | `TESTPULSE_FAIL_ON_UNMATCHED` |
| Dry run | `dryRun` | `TESTPULSE_DRY_RUN` |

**`TESTPULSE_FAIL_ON_UNMATCHED` and `TESTPULSE_DRY_RUN` parse via a
fixed rule, applied identically regardless of source**: the
case-insensitive string `"true"` or `"1"` is `true`; every other value
(including the literal string `"false"`) is `false`. This is
deliberately not a bare JavaScript truthiness check, which would treat
`"false"` as truthy. The `failOnUnmatched`/`dryRun` reporter options are
typed as `boolean` only (not `boolean | string`) — a TypeScript config
author's own type-checker catches an accidental string value
(`{ dryRun: 'false' }`) at the call site, rather than relying on runtime
parsing alone.

**Use `TESTPULSE_TOKEN` in CI**, not the `token` reporter option — a
value committed in your `vitest.config.ts` is a real secret leak; an
environment variable set from a CI secret is not. Because the env var
wins for every setting, not just `token`, an unrelated `TESTPULSE_URL`/
`TESTPULSE_PROJECT` left set in your shell can also silently override a
value you set in the config file — if a run targets the wrong project,
check your environment before your config.

## Build outcome policy

| Response | Behavior |
|---|---|
| `201` all matched | `check` exits `0`; summary logged |
| `207` some unmatched | `check` exits `0` by default (unmatched keys logged, points at `failOnUnmatched`); exits non-zero if `failOnUnmatched` is set |
| network/auth/4xx/5xx error | `check` always exits non-zero, unconditionally |

Submission-error logging is restricted to the response status, an
extracted error message, and the target URL with any embedded
credentials stripped — never a raw caught error or request/response
object, since most JS HTTP clients' error objects carry the outgoing
request's headers (including `Authorization`).

## Dry run

```ts
['testpulse-vitest', { dryRun: true }]
```

Fetches existing case keys via a read-only
`GET /api/v1/projects/{project}/cases` and previews which tagged tests
would match, without submitting anything. `check` exits `0` if the
preview succeeds, regardless of its content. **If the preview fetch
itself fails** (network error, `401`, `5xx`), the result fails closed —
`check` exits non-zero — since dry run is often used specifically to
smoke-test that configuration/auth is correct in CI, and silently
reporting success on a broken token would defeat that purpose entirely.

## Exit code

Vitest's own documented Reporter API gives no guarantee that a
reporter's own `process.exitCode` assignment determines the final
process exit code. This project verified, empirically, via a real
nested `vitest run` subprocess against Vitest 3.x and 5.x, that a
reporter's `process.exitCode = 1` set in `onTestRunEnd` **does**
currently survive to the final exit code for an otherwise fully-passing
run (Vitest's own source only forces `process.exitCode` when the run
itself failed) — but since this isn't part of Vitest's *documented*
reporter contract, and could change on a future Vitest release without
notice, `testpulse-vitest` does not rely on it. `check`, reading the
`.testpulse/result.json` marker `TestPulseReporter` writes, is the
supported, version-independent mechanism for failing the build here —
matching how `testpulse-jasmine`/`testpulse-mocha` work, for consistency
across this whole plugin family, even where Vitest's own behavior turns
out less restrictive than theirs.

## License

MIT
