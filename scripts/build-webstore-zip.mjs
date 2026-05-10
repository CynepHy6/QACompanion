import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const distDirectory = path.join(projectRoot, 'dist');
const stagingDirectory = path.join(distDirectory, 'webstore-staging');

const includePaths = [
    '_locales',
    'background.js',
    'css',
    'HTMLReport',
    'icons',
    'images',
    'import-session.html',
    'js',
    'lib',
    'manifest.json',
    'popup.html',
    'src'
];

async function readPackageVersion() {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJsonContent = await fsPromises.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);
    if (typeof packageJson.version !== 'string' || packageJson.version.trim() === '') {
        throw new Error('package.json must contain a non-empty version.');
    }

    return packageJson.version.trim();
}

async function readManifest() {
    const manifestPath = path.join(projectRoot, 'manifest.json');
    const manifestContent = await fsPromises.readFile(manifestPath, 'utf8');
    return JSON.parse(manifestContent);
}

async function ensurePathExists(relativePath) {
    const absolutePath = path.join(projectRoot, relativePath);
    try {
        await fsPromises.access(absolutePath, fs.constants.F_OK);
    } catch {
        throw new Error(`Required path is missing: ${relativePath}`);
    }
}

async function copyRecursive(sourcePath, destinationPath) {
    const sourceStats = await fsPromises.stat(sourcePath);

    if (sourceStats.isDirectory()) {
        await fsPromises.mkdir(destinationPath, { recursive: true });
        const directoryEntries = await fsPromises.readdir(sourcePath, { withFileTypes: true });
        for (const directoryEntry of directoryEntries) {
            const entrySourcePath = path.join(sourcePath, directoryEntry.name);
            const entryDestinationPath = path.join(destinationPath, directoryEntry.name);
            await copyRecursive(entrySourcePath, entryDestinationPath);
        }
        return;
    }

    if (!sourceStats.isFile()) {
        throw new Error(`Unsupported filesystem entry in build input: ${sourcePath}`);
    }

    await fsPromises.mkdir(path.dirname(destinationPath), { recursive: true });
    await fsPromises.copyFile(sourcePath, destinationPath);
}

async function prepareStagingDirectory() {
    await fsPromises.rm(stagingDirectory, { recursive: true, force: true });
    await fsPromises.mkdir(stagingDirectory, { recursive: true });

    for (const relativePath of includePaths) {
        const sourcePath = path.join(projectRoot, relativePath);
        const destinationPath = path.join(stagingDirectory, relativePath);
        await copyRecursive(sourcePath, destinationPath);
    }
}

function createZipArchive(outputZipPath) {
    if (process.platform === 'win32') {
        const powershellScript = [
            `$destination = "${outputZipPath.replaceAll('\\', '\\\\')}"`,
            `if (Test-Path $destination) { Remove-Item $destination -Force }`,
            `Compress-Archive -Path * -DestinationPath $destination -Force`
        ].join('; ');

        execFileSync(
            'powershell',
            ['-NoProfile', '-Command', powershellScript],
            {
                cwd: stagingDirectory,
                stdio: 'inherit'
            }
        );
        return;
    }

    try {
        execFileSync(
            'zip',
            ['-qr', outputZipPath, '.'],
            {
                cwd: stagingDirectory,
                stdio: 'inherit'
            }
        );
    } catch (error) {
        if (error?.code === 'ENOENT') {
            throw new Error('The `zip` command is not available. Install it or run the build on Windows with PowerShell available.');
        }

        throw error;
    }
}

async function validateManifestReferences(manifest) {
    await ensurePathExists('manifest.json');

    if (manifest.action?.default_popup) {
        await ensurePathExists(manifest.action.default_popup);
    }

    if (manifest.background?.service_worker) {
        await ensurePathExists(manifest.background.service_worker);
    }

    if (Array.isArray(manifest.content_scripts)) {
        for (const contentScriptEntry of manifest.content_scripts) {
            const scriptList = Array.isArray(contentScriptEntry.js) ? contentScriptEntry.js : [];
            for (const scriptPath of scriptList) {
                await ensurePathExists(scriptPath);
            }
        }
    }

    if (manifest.default_locale) {
        await ensurePathExists(`_locales/${manifest.default_locale}/messages.json`);
    }

    const iconGroups = [manifest.icons, manifest.action?.default_icon];
    for (const iconGroup of iconGroups) {
        if (!iconGroup) {
            continue;
        }

        for (const iconPath of Object.values(iconGroup)) {
            await ensurePathExists(iconPath.replace(/^\//, ''));
        }
    }
}

async function main() {
    try {
        const packageVersion = await readPackageVersion();
        const manifest = await readManifest();

        await validateManifestReferences(manifest);

        for (const relativePath of includePaths) {
            await ensurePathExists(relativePath);
        }

        await fsPromises.mkdir(distDirectory, { recursive: true });
        await prepareStagingDirectory();

        const outputZipPath = path.join(distDirectory, `qa-companion-webstore-v${packageVersion}.zip`);
        await fsPromises.rm(outputZipPath, { force: true });
        createZipArchive(outputZipPath);

        const outputStats = await fsPromises.stat(outputZipPath);
        console.log(`Built Chrome Web Store archive: ${path.relative(projectRoot, outputZipPath)}`);
        console.log(`Archive size: ${Math.round(outputStats.size / 1024)} KB`);
    } finally {
        await fsPromises.rm(stagingDirectory, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
