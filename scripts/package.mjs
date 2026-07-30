import { execFile } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';
import { packager } from '@electron/packager';

const projectDirectory = process.cwd();
const manifestPath = path.join(projectDirectory, 'package.json');
const outputDirectory = path.join(projectDirectory, 'release');
const stagingDirectory = await mkdtemp(path.join(tmpdir(), 'winzig-package-'));
const thirdPartyLicenseDirectory = path.join(stagingDirectory, 'third-party-licenses');
const execFileAsync = promisify(execFile);

const extractedExecutablePathFor = (buildPath, platform) => {
  if (platform === 'darwin') {
    return path.resolve(buildPath, '../..', 'MacOS', 'Electron');
  }

  if (platform === 'win32') {
    return path.resolve(buildPath, '../..', 'electron.exe');
  }

  return path.resolve(buildPath, '../..', 'electron');
};

const applySecurityFuses = async ({ buildPath, platform }) => {
  await flipFuses(extractedExecutablePathFor(buildPath, platform), {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
};

try {
  const sourceManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const electronVersion = sourceManifest.devDependencies?.electron;

  if (typeof electronVersion !== 'string') {
    throw new TypeError('The Electron version must be pinned in devDependencies.');
  }

  const runtimeManifest = {
    name: sourceManifest.name,
    productName: sourceManifest.productName,
    version: sourceManifest.version,
    description: sourceManifest.description,
    main: sourceManifest.main,
    private: true,
  };

  await mkdir(path.join(stagingDirectory, 'out'), { recursive: true });
  await cp(path.join(projectDirectory, 'out'), path.join(stagingDirectory, 'out'), {
    recursive: true,
  });
  await writeFile(
    path.join(stagingDirectory, 'package.json'),
    `${JSON.stringify(runtimeManifest, null, 2)}\n`,
    'utf8',
  );
  await mkdir(thirdPartyLicenseDirectory, { recursive: true });
  await Promise.all([
    cp(
      path.join(projectDirectory, 'node_modules/monaco-editor/LICENSE'),
      path.join(thirdPartyLicenseDirectory, 'monaco-editor-LICENSE.txt'),
    ),
    cp(
      path.join(projectDirectory, 'node_modules/monaco-editor/ThirdPartyNotices.txt'),
      path.join(thirdPartyLicenseDirectory, 'monaco-editor-ThirdPartyNotices.txt'),
    ),
    cp(
      path.join(projectDirectory, 'node_modules/dompurify/LICENSE'),
      path.join(thirdPartyLicenseDirectory, 'dompurify-LICENSE.txt'),
    ),
    cp(
      path.join(projectDirectory, 'node_modules/marked/LICENSE.md'),
      path.join(thirdPartyLicenseDirectory, 'marked-LICENSE.md'),
    ),
  ]);

  const applicationPaths = await packager({
    afterInitialize: [applySecurityFuses],
    appBundleId: 'app.winzig.desktop',
    asar: true,
    dir: stagingDirectory,
    electronVersion,
    executableName: 'winzig',
    name: 'Winzig',
    out: outputDirectory,
    overwrite: true,
    prune: false,
  });

  if (process.platform === 'darwin') {
    for (const applicationPath of applicationPaths) {
      await execFileAsync('codesign', [
        '--force',
        '--deep',
        '--sign',
        '-',
        path.join(applicationPath, 'Winzig.app'),
      ]);
    }
  }
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}
