import { promises as fileSystem } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const defaultInputDirectory = path.join(projectRoot, 'data', 'screenshots');

function parseArguments(argumentList) {
    const options = {
        inputDirectory: defaultInputDirectory,
        format: 'webp',
        quality: 0.82,
        maxWidth: 0,
        suffix: '.preview-q82'
    };

    for (const argument of argumentList) {
        if (argument.startsWith('--input-dir=')) {
            options.inputDirectory = path.resolve(projectRoot, argument.slice('--input-dir='.length));
            continue;
        }

        if (argument.startsWith('--format=')) {
            options.format = argument.slice('--format='.length).trim().toLowerCase();
            continue;
        }

        if (argument.startsWith('--quality=')) {
            options.quality = Number(argument.slice('--quality='.length));
            continue;
        }

        if (argument.startsWith('--max-width=')) {
            options.maxWidth = Number(argument.slice('--max-width='.length));
            continue;
        }

        if (argument.startsWith('--suffix=')) {
            options.suffix = argument.slice('--suffix='.length).trim();
            continue;
        }
    }

    return options;
}

function validateOptions(options) {
    const supportedFormats = new Set(['webp', 'jpeg', 'png']);
    if (!supportedFormats.has(options.format)) {
        throw new Error(`Unsupported format "${options.format}". Use webp, jpeg, or png.`);
    }

    if (!Number.isFinite(options.quality) || options.quality < 0 || options.quality > 1) {
        throw new Error('Quality must be a number between 0 and 1.');
    }

    if (!Number.isFinite(options.maxWidth) || options.maxWidth < 0) {
        throw new Error('Max width must be a non-negative number.');
    }

    if (typeof options.suffix !== 'string' || options.suffix.trim() === '') {
        throw new Error('Suffix must be a non-empty string.');
    }
}

function getTargetMimeType(format) {
    if (format === 'jpeg') {
        return 'image/jpeg';
    }

    if (format === 'png') {
        return 'image/png';
    }

    return 'image/webp';
}

function getTargetExtension(format) {
    if (format === 'jpeg') {
        return 'jpg';
    }

    return format;
}

function getSourceMimeType(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    if (extension === '.jpg' || extension === '.jpeg') {
        return 'image/jpeg';
    }

    if (extension === '.webp') {
        return 'image/webp';
    }

    return 'image/png';
}

function isSupportedImageFile(fileName, suffix) {
    const lowerCaseName = fileName.toLowerCase();
    if (lowerCaseName.includes(suffix.toLowerCase())) {
        return false;
    }

    return ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(lowerCaseName));
}

function formatBytes(byteCount) {
    if (byteCount < 1024) {
        return `${byteCount} B`;
    }

    if (byteCount < 1024 * 1024) {
        return `${(byteCount / 1024).toFixed(1)} KB`;
    }

    return `${(byteCount / (1024 * 1024)).toFixed(2)} MB`;
}

function formatPercent(value) {
    return `${value.toFixed(1)}%`;
}

async function collectSourceFiles(inputDirectory, suffix) {
    const directoryEntries = await fileSystem.readdir(inputDirectory, { withFileTypes: true });
    return directoryEntries
        .filter((directoryEntry) => directoryEntry.isFile())
        .map((directoryEntry) => directoryEntry.name)
        .filter((fileName) => isSupportedImageFile(fileName, suffix))
        .sort((leftName, rightName) => leftName.localeCompare(rightName))
        .map((fileName) => path.join(inputDirectory, fileName));
}

async function compressImageInBrowser(page, options) {
    return await page.evaluate(async ({ dataUrl, targetMimeType, quality, maxWidth }) => {
        const sourceImage = await new Promise((resolve, reject) => {
            const imageElement = new Image();
            imageElement.onload = () => resolve(imageElement);
            imageElement.onerror = () => reject(new Error('Failed to load image for compression preview.'));
            imageElement.src = dataUrl;
        });

        const resizeRatio = maxWidth > 0 && sourceImage.naturalWidth > maxWidth
            ? maxWidth / sourceImage.naturalWidth
            : 1;
        const targetWidth = Math.max(1, Math.round(sourceImage.naturalWidth * resizeRatio));
        const targetHeight = Math.max(1, Math.round(sourceImage.naturalHeight * resizeRatio));
        const canvasElement = document.createElement('canvas');
        canvasElement.width = targetWidth;
        canvasElement.height = targetHeight;

        const canvasContext = canvasElement.getContext('2d');
        if (!canvasContext) {
            throw new Error('Failed to create canvas context.');
        }

        canvasContext.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);

        return {
            width: targetWidth,
            height: targetHeight,
            dataUrl: canvasElement.toDataURL(targetMimeType, quality)
        };
    }, options);
}

async function compressSingleFile(page, sourcePath, options) {
    const sourceBuffer = await fileSystem.readFile(sourcePath);
    const sourceMimeType = getSourceMimeType(sourcePath);
    const sourceDataUrl = `data:${sourceMimeType};base64,${sourceBuffer.toString('base64')}`;
    const targetMimeType = getTargetMimeType(options.format);
    const targetExtension = getTargetExtension(options.format);
    const sourceBaseName = path.basename(sourcePath, path.extname(sourcePath));
    const targetPath = path.join(
        path.dirname(sourcePath),
        `${sourceBaseName}${options.suffix}.${targetExtension}`
    );

    const compressedResult = await compressImageInBrowser(page, {
        dataUrl: sourceDataUrl,
        targetMimeType,
        quality: options.quality,
        maxWidth: options.maxWidth
    });

    const base64Payload = compressedResult.dataUrl.split(',')[1] || '';
    const targetBuffer = Buffer.from(base64Payload, 'base64');
    await fileSystem.writeFile(targetPath, targetBuffer);

    return {
        sourcePath,
        targetPath,
        width: compressedResult.width,
        height: compressedResult.height,
        originalBytes: sourceBuffer.byteLength,
        compressedBytes: targetBuffer.byteLength
    };
}

function printSummary(results) {
    let totalOriginalBytes = 0;
    let totalCompressedBytes = 0;

    for (const result of results) {
        totalOriginalBytes += result.originalBytes;
        totalCompressedBytes += result.compressedBytes;

        const savedBytes = result.originalBytes - result.compressedBytes;
        const savedPercent = result.originalBytes > 0
            ? (savedBytes / result.originalBytes) * 100
            : 0;
        const directionLabel = savedBytes >= 0 ? 'saved' : 'grew';
        const absoluteSavedBytes = Math.abs(savedBytes);

        console.log(
            [
                path.basename(result.sourcePath),
                `-> ${path.basename(result.targetPath)}`,
                `${result.width}x${result.height}`,
                `${formatBytes(result.originalBytes)} -> ${formatBytes(result.compressedBytes)}`,
                `${directionLabel} ${formatBytes(absoluteSavedBytes)} (${formatPercent(Math.abs(savedPercent))})`
            ].join(' | ')
        );
    }

    const totalSavedBytes = totalOriginalBytes - totalCompressedBytes;
    const totalSavedPercent = totalOriginalBytes > 0
        ? (totalSavedBytes / totalOriginalBytes) * 100
        : 0;
    const totalDirectionLabel = totalSavedBytes >= 0 ? 'saved' : 'grew';

    console.log('');
    console.log(`Processed files: ${results.length}`);
    console.log(`Original total: ${formatBytes(totalOriginalBytes)}`);
    console.log(`Compressed total: ${formatBytes(totalCompressedBytes)}`);
    console.log(
        `Total ${totalDirectionLabel}: ${formatBytes(Math.abs(totalSavedBytes))} (${formatPercent(Math.abs(totalSavedPercent))})`
    );
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    validateOptions(options);

    const sourceFiles = await collectSourceFiles(options.inputDirectory, options.suffix);
    if (sourceFiles.length === 0) {
        console.log(`No source screenshots found in ${path.relative(projectRoot, options.inputDirectory)}.`);
        return;
    }

    const browser = await chromium.launch({ headless: true });

    try {
        const browserPage = await browser.newPage();
        await browserPage.setContent('<!doctype html><html><body></body></html>');

        const results = [];
        for (const sourcePath of sourceFiles) {
            results.push(await compressSingleFile(browserPage, sourcePath, options));
        }

        printSummary(results);
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
