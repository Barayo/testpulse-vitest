import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Resolves the installed vitest package's own CLI entry point via its
 * declared `bin` field, rather than a hardcoded path -- the same
 * diligence that caught a real cross-major bin-path bug for the Mocha
 * plugin (mocha 9's bin had no `.js` extension, unlike mocha 10+). The
 * CI matrix installs multiple Vitest majors and re-runs this suite
 * against each; this resolver is what lets that matrix actually catch a
 * bin-path regression rather than being masked by whatever version is
 * locally installed.
 */
function resolveVitestBin(): string {
  const pkgPath = require.resolve('vitest/package.json');
  const pkg = require(pkgPath) as { bin?: Record<string, string> | string };
  const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.vitest;
  if (!binRel) {
    throw new Error('Could not determine vitest CLI bin path from vitest/package.json');
  }
  return path.join(path.dirname(pkgPath), binRel);
}

export interface VitestRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Spawns a real nested `vitest run` process against a fixture project's own vitest.config. */
export async function runNestedVitest(
  cwd: string,
  configPath: string,
  extraEnv: Record<string, string> = {},
  extraArgs: string[] = [],
): Promise<VitestRunResult> {
  const vitestBin = resolveVitestBin();
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [vitestBin, 'run', `--config=${configPath}`, ...extraArgs],
      { cwd, env: { ...process.env, ...extraEnv, CI: 'true' } },
    );
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

export function fixturePath(...segments: string[]): string {
  return path.join(__dirname, '..', '..', 'fixtures', ...segments);
}
