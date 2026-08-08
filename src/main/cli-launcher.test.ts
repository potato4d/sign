import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CliLauncherInstallError } from './cli-launcher';

import { installCliLauncher } from './cli-launcher';

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sign-cli-test-'));
  temporaryDirectories.push(directory);
  return directory;
};

const createLauncher = async (directory: string): Promise<string> => {
  const launcherPath = path.join(directory, 'launcher');
  await writeFile(launcherPath, '#!/bin/sh\nexit 0\n', 'utf8');
  await chmod(launcherPath, 0o755);
  return launcherPath;
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

describe('installCliLauncher', () => {
  it('installs an idempotent symbolic link to the packaged launcher', async () => {
    const directory = await createTemporaryDirectory();
    const launcherPath = await createLauncher(directory);
    const linkPath = path.join(directory, 'path', 'sign');

    await expect(installCliLauncher({ launcherPath, linkPath })).resolves.toBe('installed');
    await expect(readlink(linkPath)).resolves.toBe(launcherPath);
    await expect(installCliLauncher({ launcherPath, linkPath })).resolves.toBe('already-installed');
  });

  it('does not overwrite an existing command', async () => {
    const directory = await createTemporaryDirectory();
    const launcherPath = await createLauncher(directory);
    const linkPath = path.join(directory, 'sign');
    await writeFile(linkPath, 'existing command', 'utf8');

    await expect(installCliLauncher({ launcherPath, linkPath })).rejects.toMatchObject({
      kind: 'conflict',
    } satisfies Partial<CliLauncherInstallError>);
    await expect(readFile(linkPath, 'utf8')).resolves.toBe('existing command');
  });

  it('does not replace a symbolic link to another executable', async () => {
    const directory = await createTemporaryDirectory();
    const launcherPath = await createLauncher(directory);
    const otherLauncherPath = path.join(directory, 'other-launcher');
    const linkPath = path.join(directory, 'sign');
    await writeFile(otherLauncherPath, '#!/bin/sh\nexit 0\n', 'utf8');
    await symlink(otherLauncherPath, linkPath);

    await expect(installCliLauncher({ launcherPath, linkPath })).rejects.toMatchObject({
      kind: 'conflict',
    } satisfies Partial<CliLauncherInstallError>);
    await expect(readlink(linkPath)).resolves.toBe(otherLauncherPath);
  });

  it('rejects a missing packaged launcher', async () => {
    const directory = await createTemporaryDirectory();

    await expect(
      installCliLauncher({
        launcherPath: path.join(directory, 'missing-launcher'),
        linkPath: path.join(directory, 'sign'),
      }),
    ).rejects.toMatchObject({
      kind: 'launcher-unavailable',
    } satisfies Partial<CliLauncherInstallError>);
  });

  it('rejects a launcher inside an App Translocation path', async () => {
    const directory = await createTemporaryDirectory();
    const translocatedDirectory = path.join(directory, 'AppTranslocation', 'sign.app');
    await mkdir(translocatedDirectory, { recursive: true });
    const launcherPath = await createLauncher(translocatedDirectory);

    await expect(
      installCliLauncher({
        launcherPath,
        linkPath: path.join(directory, 'sign'),
      }),
    ).rejects.toMatchObject({
      kind: 'launcher-unavailable',
    } satisfies Partial<CliLauncherInstallError>);
  });

  it('uses administrator privileges only after a permission failure', async () => {
    const directory = await createTemporaryDirectory();
    const launcherPath = await createLauncher(directory);
    const linkPath = path.join(directory, 'path', 'sign');
    const installWithoutAdministratorPrivileges = vi.fn(() =>
      Promise.reject(Object.assign(new Error('permission denied'), { code: 'EACCES' })),
    );
    const installWithAdministratorPrivileges = vi.fn(async (source: string, target: string) => {
      await mkdir(path.dirname(target), { recursive: true });
      await symlink(source, target);
    });

    await expect(
      installCliLauncher({
        installWithAdministratorPrivileges,
        installWithoutAdministratorPrivileges,
        launcherPath,
        linkPath,
      }),
    ).resolves.toBe('installed');
    expect(installWithoutAdministratorPrivileges).toHaveBeenCalledOnce();
    expect(installWithAdministratorPrivileges).toHaveBeenCalledOnce();
    await expect(readlink(linkPath)).resolves.toBe(launcherPath);
  });

  it('reports a cancelled administrator installation without creating a command', async () => {
    const directory = await createTemporaryDirectory();
    const launcherPath = await createLauncher(directory);
    const linkPath = path.join(directory, 'path', 'sign');

    await expect(
      installCliLauncher({
        installWithAdministratorPrivileges: () => Promise.reject(new Error('cancelled')),
        installWithoutAdministratorPrivileges: () =>
          Promise.reject(Object.assign(new Error('permission denied'), { code: 'EPERM' })),
        launcherPath,
        linkPath,
      }),
    ).rejects.toMatchObject({
      kind: 'install-failed',
    } satisfies Partial<CliLauncherInstallError>);
  });

  it('does not report success when an EEXIST race disappears before inspection', async () => {
    const directory = await createTemporaryDirectory();
    const launcherPath = await createLauncher(directory);

    await expect(
      installCliLauncher({
        installWithoutAdministratorPrivileges: () =>
          Promise.reject(Object.assign(new Error('already exists'), { code: 'EEXIST' })),
        launcherPath,
        linkPath: path.join(directory, 'sign'),
      }),
    ).rejects.toMatchObject({
      kind: 'install-failed',
    } satisfies Partial<CliLauncherInstallError>);
  });

  it('does not install through a symbolic command directory', async () => {
    const directory = await createTemporaryDirectory();
    const launcherPath = await createLauncher(directory);
    const actualDirectory = path.join(directory, 'actual-path');
    const linkedDirectory = path.join(directory, 'linked-path');
    await mkdir(actualDirectory);
    await symlink(actualDirectory, linkedDirectory);

    await expect(
      installCliLauncher({
        launcherPath,
        linkPath: path.join(linkedDirectory, 'sign'),
      }),
    ).rejects.toMatchObject({
      kind: 'install-failed',
    } satisfies Partial<CliLauncherInstallError>);
    await expect(readFile(path.join(actualDirectory, 'sign'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
