import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, lstat, mkdir, readlink, symlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

export const CLI_COMMAND_NAME = 'sign';
export const CLI_LINK_PATH = `/usr/local/bin/${CLI_COMMAND_NAME}`;

type CliLauncherInstallErrorKind = 'conflict' | 'install-failed' | 'launcher-unavailable';
type CliLauncherInstallResult = 'already-installed' | 'installed';

interface InstallCliLauncherOptions {
  readonly installWithAdministratorPrivileges?: LinkInstaller;
  readonly installWithoutAdministratorPrivileges?: LinkInstaller;
  readonly launcherPath?: string;
  readonly linkPath?: string;
}

type ExistingLinkStatus = 'absent' | 'conflict' | 'installed';
type LinkInstaller = (launcherPath: string, linkPath: string) => Promise<void>;

const execFileAsync = promisify(execFile);

const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;

const isPermissionError = (error: unknown): boolean => {
  const code = errorCode(error);
  return code === 'EACCES' || code === 'EPERM';
};

const inspectExistingLink = async (
  launcherPath: string,
  linkPath: string,
): Promise<ExistingLinkStatus> => {
  let metadata;

  try {
    metadata = await lstat(linkPath);
  } catch (error: unknown) {
    if (errorCode(error) === 'ENOENT') {
      return 'absent';
    }

    throw error;
  }

  if (!metadata.isSymbolicLink()) {
    return 'conflict';
  }

  const currentTarget = await readlink(linkPath);
  const resolvedTarget = path.resolve(path.dirname(linkPath), currentTarget);

  return resolvedTarget === path.resolve(launcherPath) ? 'installed' : 'conflict';
};

const installWithAdministratorPrivileges = async (
  launcherPath: string,
  linkPath: string,
): Promise<void> => {
  const destinationDirectory = path.dirname(linkPath);

  await execFileAsync('/usr/bin/osascript', [
    '-e',
    'on run argv',
    '-e',
    'set destinationDirectory to item 1 of argv',
    '-e',
    'set launcherPath to item 2 of argv',
    '-e',
    'set linkPath to item 3 of argv',
    '-e',
    'set commandText to "/bin/mkdir -p " & quoted form of destinationDirectory & " && /bin/test ! -L " & quoted form of destinationDirectory & " && /bin/test -d " & quoted form of destinationDirectory & " && /bin/ln -s -h " & quoted form of launcherPath & " " & quoted form of linkPath',
    '-e',
    'do shell script commandText with administrator privileges',
    '-e',
    'end run',
    '--',
    destinationDirectory,
    launcherPath,
    linkPath,
  ]);
};

const conflictError = (linkPath: string): CliLauncherInstallError =>
  new CliLauncherInstallError(
    'conflict',
    `Another file already exists at ${linkPath}. Remove or rename it, then try again.`,
  );

const resolveExistingLink = async (
  launcherPath: string,
  linkPath: string,
): Promise<CliLauncherInstallResult | null> => {
  const status = await inspectExistingLink(launcherPath, linkPath);

  if (status === 'installed') {
    return 'already-installed';
  }

  if (status === 'conflict') {
    throw conflictError(linkPath);
  }

  return null;
};

const ensureDestinationDirectoryIsSafe = async (linkPath: string): Promise<void> => {
  const destinationDirectory = path.dirname(linkPath);
  let metadata;

  try {
    metadata = await lstat(destinationDirectory);
  } catch (error: unknown) {
    if (errorCode(error) === 'ENOENT') {
      return;
    }

    throw new CliLauncherInstallError(
      'install-failed',
      `The command directory at ${destinationDirectory} could not be inspected.`,
    );
  }

  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new CliLauncherInstallError(
      'install-failed',
      `The command directory at ${destinationDirectory} must be a regular directory.`,
    );
  }
};

const installWithoutAdministratorPrivileges = async (
  launcherPath: string,
  linkPath: string,
): Promise<void> => {
  await mkdir(path.dirname(linkPath), { recursive: true });
  await ensureDestinationDirectoryIsSafe(linkPath);
  await symlink(launcherPath, linkPath);
};

export class CliLauncherInstallError extends Error {
  readonly kind: CliLauncherInstallErrorKind;

  constructor(kind: CliLauncherInstallErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'CliLauncherInstallError';
  }
}

export const installCliLauncher = async ({
  installWithAdministratorPrivileges: privilegedInstaller = installWithAdministratorPrivileges,
  installWithoutAdministratorPrivileges:
    unprivilegedInstaller = installWithoutAdministratorPrivileges,
  launcherPath = path.join(process.resourcesPath, 'bin', CLI_COMMAND_NAME),
  linkPath = CLI_LINK_PATH,
}: InstallCliLauncherOptions = {}): Promise<CliLauncherInstallResult> => {
  if (launcherPath.split(path.sep).includes('AppTranslocation')) {
    throw new CliLauncherInstallError(
      'launcher-unavailable',
      'Move sign to the Applications folder, reopen it, and try installing the command again.',
    );
  }

  try {
    await access(launcherPath, fsConstants.X_OK);
  } catch {
    throw new CliLauncherInstallError(
      'launcher-unavailable',
      'The packaged sign launcher is missing. Reinstall sign and try again.',
    );
  }

  const existingResult = await resolveExistingLink(launcherPath, linkPath);

  if (existingResult) {
    return existingResult;
  }

  await ensureDestinationDirectoryIsSafe(linkPath);

  try {
    await unprivilegedInstaller(launcherPath, linkPath);
    return 'installed';
  } catch (error: unknown) {
    if (errorCode(error) === 'EEXIST') {
      const raceResult = await resolveExistingLink(launcherPath, linkPath);

      if (raceResult) {
        return raceResult;
      }

      throw new CliLauncherInstallError(
        'install-failed',
        'The sign command path changed during installation. Try again.',
      );
    }

    if (!isPermissionError(error)) {
      throw new CliLauncherInstallError(
        'install-failed',
        'The sign command could not be installed. No existing command was changed.',
      );
    }
  }

  try {
    await privilegedInstaller(launcherPath, linkPath);
  } catch {
    const status = await inspectExistingLink(launcherPath, linkPath).catch(() => 'absent' as const);

    if (status === 'installed') {
      return 'installed';
    }

    if (status === 'conflict') {
      throw conflictError(linkPath);
    }

    throw new CliLauncherInstallError(
      'install-failed',
      'The sign command was not installed. No existing command was changed.',
    );
  }

  const installedStatus = await inspectExistingLink(launcherPath, linkPath);

  if (installedStatus !== 'installed') {
    throw new CliLauncherInstallError(
      'install-failed',
      'The sign command could not be verified after installation.',
    );
  }

  return 'installed';
};
