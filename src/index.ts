import { Case } from './testpulse';
import { Attach } from './testpulseAttach';
import { TestPulseReporter } from './reporter';

/**
 * Vitest's own custom-reporter loader (`loadCustomReporterModule` /
 * `createReporters` in Vitest's bundled `cli-api.js`, confirmed by
 * reading it directly) resolves a string entry in `vitest.config.ts`'s
 * `reporters` array (e.g. `reporters: ['default', 'testpulse-vitest']`)
 * via `runner.executeId(path)`, then requires the loaded module's own
 * `.default` export to BE the reporter class, and instantiates it as
 * `new CustomReporter(reporterOptions)` -- a single options argument,
 * unlike Mocha's `(runner, options)`. This package's default export is
 * therefore `TestPulseReporter` itself. `Case`/`Attach`/`TestPulseReporter`
 * remain available as ordinary named exports for
 * `import { Case, Attach, TestPulseReporter } from 'testpulse-vitest'`.
 */
export { Case, Attach, TestPulseReporter };
export default TestPulseReporter;
