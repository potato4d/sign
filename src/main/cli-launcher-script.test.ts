import { execFile } from 'node:child_process';
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];
const sourceLauncherPath = path.resolve(import.meta.dirname, '../../resources/bin/sign');

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sign-cli-script-test-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe('packaged CLI launcher', () => {
  it('launches the app without holding the terminal and preserves arguments and cwd', async () => {
    const directory = await createTemporaryDirectory();
    const contentsDirectory = path.join(directory, 'sign.app', 'Contents');
    const launcherPath = path.join(contentsDirectory, 'Resources', 'bin', 'sign');
    const executablePath = path.join(contentsDirectory, 'MacOS', 'sign');
    const installedPath = path.join(directory, 'path', 'sign');
    const workingDirectory = path.join(directory, 'workspace');
    const outputPath = path.join(directory, 'invocation.txt');
    await Promise.all([
      mkdir(path.dirname(launcherPath), { recursive: true }),
      mkdir(path.dirname(executablePath), { recursive: true }),
      mkdir(path.dirname(installedPath), { recursive: true }),
      mkdir(workingDirectory, { recursive: true }),
    ]);
    await cp(sourceLauncherPath, launcherPath);
    await writeFile(
      executablePath,
      '#!/bin/sh\nprintf "%s\\n" "$PWD" "$@" > "$SIGN_CLI_TEST_OUTPUT"\n',
      'utf8',
    );
    await Promise.all([chmod(launcherPath, 0o755), chmod(executablePath, 0o755)]);
    await symlink(launcherPath, installedPath);

    await execFileAsync(installedPath, ['notes one.txt', '*.json', '', '-draft'], {
      cwd: workingDirectory,
      env: {
        ...process.env,
        SIGN_CLI_TEST_OUTPUT: outputPath,
      },
    });

    await expect
      .poll(() => readFile(outputPath, 'utf8').catch(() => ''), { timeout: 2_000 })
      .toBe(`${await realpath(workingDirectory)}\n--\nnotes one.txt\n*.json\n\n-draft\n`);
  });

  it('reports a missing application executable', async () => {
    const directory = await createTemporaryDirectory();
    const launcherPath = path.join(directory, 'sign.app', 'Contents', 'Resources', 'bin', 'sign');
    await mkdir(path.dirname(launcherPath), { recursive: true });
    await cp(sourceLauncherPath, launcherPath);
    await chmod(launcherPath, 0o755);

    let launchError: unknown;

    try {
      await execFileAsync(launcherPath);
    } catch (error: unknown) {
      launchError = error;
    }

    expect(launchError).toMatchObject({ code: 1 });
    expect(String((launchError as { stderr?: unknown }).stderr)).toContain(
      'could not find the application executable',
    );
  });
});
