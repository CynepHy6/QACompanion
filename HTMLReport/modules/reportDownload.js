import { serializeReportState } from './reportData.js';
import { updateReportHeaderSubtitle } from './reportUI.js';
import { formatDateTimeLocalized, getMessage, getUiLocale } from '../../src/i18n.js';

function getImageExtensionFromDataUrl(imageUrl) {
    if (typeof imageUrl !== 'string') {
        return 'png';
    }

    if (imageUrl.startsWith('data:image/jpeg;')) {
        return 'jpg';
    }

    if (imageUrl.startsWith('data:image/webp;')) {
        return 'webp';
    }

    return 'png';
}

/**
 * Downloads all screenshots as a ZIP file.
 */
export async function downloadAllImages(reportState) {
    const annotationScreenshots = reportState.session.getAnnotations().flatMap((annotation) => {
        return annotation.getImageEntries().map((imageEntry, imageIndex) => ({
            sourceType: 'annotation',
            annotationType: annotation.getType(),
            annotationName: annotation.getName(),
            imageURL: imageEntry.imageURL,
            createdAt: imageEntry.createdAt,
            imageIndex
        }));
    });

    const recordingScreenshots = reportState.session.getAnnotations().flatMap((annotation) => {
        const recordingState = reportState.annotationRecordingsById?.[annotation.getId()];
        if (!recordingState || !Array.isArray(recordingState.screenshots)) {
            return [];
        }

        return recordingState.screenshots.map((screenshotItem, imageIndex) => ({
            sourceType: 'recording',
            annotationType: annotation.getType(),
            annotationName: annotation.getName() || screenshotItem.triggerStepId || `step-${imageIndex + 1}`,
            imageURL: screenshotItem.imageURL,
            createdAt: screenshotItem.createdAt,
            imageIndex
        }));
    });

    const screenshots = [
        ...annotationScreenshots,
        ...recordingScreenshots
    ];

    if (screenshots.length === 0) {
        alert(getMessage('reportDownloadNoScreenshots', undefined, 'No screenshots available to download.'));
        return;
    }

    if (typeof JSZip === 'undefined') {
        alert(getMessage('reportDownloadJsZipMissing', undefined, 'JSZip is not loaded. Can\'t create the ZIP archive.'));
        return;
    }

    const zip = new JSZip();
    const imgFolder = zip.folder('screenshots');

    // Add README file
    const readmeContent = `${getMessage('reportDownloadReadmeTitle', undefined, 'Exploratory Testing Screenshots')}
${getMessage('reportDownloadReadmeGenerated', undefined, 'Generated')}: ${formatDateTimeLocalized(Date.now())}
${getMessage('reportDownloadReadmeSource', undefined, 'Source')}: ${getMessage('reportDownloadSourceName', undefined, 'QA Companion Chrome Extension')}
${getMessage('reportDownloadReadmeTotal', undefined, 'Total screenshots')}: ${screenshots.length}

${getMessage('reportDownloadReadmeBody', undefined, 'This ZIP file contains screenshots captured during your testing session.')}`;
    zip.file('README.txt', readmeContent);

    // Add all images to the ZIP
    for (let screenshotIndex = 0; screenshotIndex < screenshots.length; screenshotIndex++) {
        const screenshot = screenshots[screenshotIndex];
        const type = screenshot.annotationType;
        const timestamp = screenshot.createdAt
            ? new Date(screenshot.createdAt).toISOString().replace(/[:.]/g, '-')
            : `annotation-${screenshotIndex}`;
        const fileExtension = getImageExtensionFromDataUrl(screenshot.imageURL);
        const fileName = `${screenshotIndex + 1}_${screenshot.sourceType}_${type}_${timestamp}_${screenshot.imageIndex + 1}.${fileExtension}`;

        // Convert base64 to binary
        const base64Data = screenshot.imageURL.split(',')[1];
        imgFolder.file(fileName, base64Data, { base64: true });
    }

    // Generate and download the ZIP
    try {
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ExploratoryTesting_Screenshots_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error creating ZIP:', error);
        alert(getMessage('reportDownloadZipFailed', undefined, 'Couldn\'t create the ZIP archive. Please try again.'));
    }
}

const SVG_PATHS = {
    Bug: '../images/bug.svg',
    Note: '../images/note.svg'
};

/**
 * Downloads a standalone HTML report with all resources embedded.
 */
export async function downloadCompleteReport(reportState) {
    const reportContent = document.getElementById('report').cloneNode(true);
    updateReportHeaderSubtitle(reportState, Date.now(), reportContent);

    // Remove interactive-only elements from download
    removeInteractiveElements(reportContent);
    prepareStandalonePreviewImages(reportContent);

    // Inline any remaining non-preview image URLs.
    await embedImages(reportContent);
    const icons = await loadSvgIconsAsBase64();
    replaceSvgIcons(reportContent, icons);

    const styles = extractStyles();
    const sessionJSON = JSON.stringify(serializeReportState(reportState));

    const html = buildStandaloneHtml(reportContent.outerHTML, styles, sessionJSON);

    triggerDownload(html);
}

function removeInteractiveElements(container) {
    // Convert chart canvas to static image
    const chartCanvas = document.getElementById('annotationsChart');
    const standaloneChartCanvas = container.querySelector('#annotationsChart');
    if (chartCanvas && standaloneChartCanvas) {
        try {
            // Get the canvas as base64 image
            const chartImageData = chartCanvas.toDataURL('image/png');

            // Replace canvas with img element
            const img = document.createElement('img');
            img.id = standaloneChartCanvas.id;
            img.className = standaloneChartCanvas.className;
            img.src = chartImageData;
            img.alt = getMessage('reportDownloadChartAlt', undefined, 'Annotation distribution chart');
            img.width = chartCanvas.width || 64;
            img.height = chartCanvas.height || 64;
            img.style.width = `${chartCanvas.width || 64}px`;
            img.style.height = `${chartCanvas.height || 64}px`;
            img.style.maxWidth = `${chartCanvas.width || 64}px`;
            img.style.maxHeight = `${chartCanvas.height || 64}px`;
            img.style.objectFit = 'contain';
            img.style.display = 'block';
            standaloneChartCanvas.replaceWith(img);
        } catch (error) {
            console.error('Error converting chart to image:', error);
            // If conversion fails, remove the chart
            if (standaloneChartCanvas) standaloneChartCanvas.remove();
        }
    }

    // Remove both download buttons
    const downloadReportBtn = container.querySelector('#downloadReportBtn');
    if (downloadReportBtn) downloadReportBtn.remove();

    const downloadImagesBtn = container.querySelector('#downloadImagesBtn');
    if (downloadImagesBtn) downloadImagesBtn.remove();

    // Remove button group if it's now empty
    const buttonGroup = container.querySelector('.button-group');
    if (buttonGroup && buttonGroup.children.length === 0) {
        buttonGroup.remove();
    }

    // Remove delete column from header
    const headerRow = container.querySelector('thead tr');
    if (headerRow && headerRow.lastElementChild) {
        headerRow.lastElementChild.remove();
    }

    const colGroup = container.querySelector('.report-table colgroup');
    if (colGroup && colGroup.lastElementChild) {
        colGroup.lastElementChild.remove();
    }

    // Remove delete column only from primary annotation rows.
    container.querySelectorAll('tbody tr.annotation-row').forEach((row) => {
        if (row.lastElementChild) {
            row.lastElementChild.remove();
        }
    });

    container.querySelectorAll('tbody td[colspan]').forEach((cellElement) => {
        const currentSpanValue = Number.parseInt(cellElement.getAttribute('colspan') || '', 10);
        if (Number.isInteger(currentSpanValue) && currentSpanValue > 1) {
            cellElement.setAttribute('colspan', String(currentSpanValue - 1));
        }
    });

    container.querySelectorAll('.description-editor').forEach((editor) => {
        const textBlock = document.createElement('div');
        textBlock.className = 'annotation-description-text';
        textBlock.textContent = editor.value;
        editor.replaceWith(textBlock);
    });

    container.querySelectorAll('.save-description-btn, .delete-image-btn').forEach((button) => {
        button.remove();
    });
}

function prepareStandalonePreviewImages(container) {
    container.querySelectorAll('.preview-image').forEach((imageElement) => {
        imageElement.removeAttribute('src');
        imageElement.removeAttribute('data-preview');
    });
}

async function embedImages(container) {
    const images = container.querySelectorAll('img:not(.preview-image)');
    await Promise.all(Array.from(images).map((imageElement) => {
        return new Promise((resolve) => {
            if (!imageElement.src) {
                resolve();
                return;
            }

            if (imageElement.src.startsWith('data:image/')) {
                resolve();
                return;
            }

            fetch(imageElement.src)
                .then((response) => response.blob())
                .then((imageBlob) => {
                    if (!imageBlob.type.startsWith('image/')) {
                        resolve();
                        return;
                    }

                    const fileReader = new FileReader();
                    fileReader.onloadend = () => {
                        imageElement.src = typeof fileReader.result === 'string' ? fileReader.result : imageElement.src;
                        resolve();
                    };
                    fileReader.onerror = () => resolve();
                    fileReader.readAsDataURL(imageBlob);
                })
                .catch(() => resolve());
        });
    }));
}

async function loadSvgIconsAsBase64() {
    const entries = Object.entries(SVG_PATHS);
    const results = await Promise.all(
        entries.map(([type, path]) => fetch(path).then(r => r.text()).then(svg => [type, svg]))
    );
    const icons = {};
    results.forEach(([type, svg]) => {
        icons[type] = `data:image/svg+xml;base64,${btoa(svg)}`;
    });
    return icons;
}

function replaceSvgIcons(container, icons) {
    container.querySelectorAll('.annotation-icon').forEach((icon) => {
        const type = icon.dataset.annotationType || icon.alt;
        if (icons[type]) {
            icon.src = icons[type];
        }
    });
}

function extractStyles() {
    return Array.from(document.styleSheets)
        .map(sheet => {
            try {
                return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
            } catch {
                return '';
            }
        })
        .join('\n');
}

function buildStandaloneHtml(reportHtml, styles, sessionJSON) {
    const downloadJsonLabel = getMessage('popupExportJsonTitle', undefined, 'Export session to JSON');
    const standaloneHeaderButtonMarkup = `
                <div class="standalone-header-actions">
                    <button id="downloadEmbeddedJsonBtn" class="btn-download btn-download--secondary" title="${downloadJsonLabel}">
                        ${downloadJsonLabel}
                    </button>
                </div>`;
    const standaloneReportHtml = reportHtml.replace(
        /(<div class="report-header__main">[\s\S]*?<\/div>)/,
        `$1${standaloneHeaderButtonMarkup}`
    );
    return `<!DOCTYPE html>
<html lang="${getUiLocale()}">
<head>
    <meta charset="utf-8">
    <title>${getMessage('reportHtmlTitle', undefined, 'Exploratory Testing Report')}</title>
    <style>${styles}
.standalone-header-actions {
    position: absolute;
    top: 50%;
    right: 48px;
    transform: translateY(-50%);
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
    z-index: 2;
}

.standalone-header-actions .btn-download {
    white-space: nowrap;
    padding: 8px 14px;
    font-size: 0.78rem;
}

@media (max-width: 768px) {
    .standalone-header-actions {
        position: static;
        transform: none;
        margin-top: 12px;
        width: 100%;
        justify-content: flex-end;
    }
}
</style>
</head>
<body>
    ${standaloneReportHtml}
    <div id="imagePreview" class="image-preview">
        <img src="" alt="${getMessage('reportImagePreviewAlt', undefined, 'Preview')}">
        <div id="imagePreviewMeta" class="image-preview__meta" hidden></div>
    </div>
    <div id="imageHoverPreview" class="image-hover-preview">
        <img src="" alt="${getMessage('reportImageHoverPreviewAlt', undefined, 'Hover preview')}">
    </div>
    <script>
        const sessionData = ${sessionJSON};
        let hoverPreviewAnchorElement = null;

        function buildSessionJsonFileName() {
            const startedAtValue = sessionData?.session?.startDateTime || Date.now();
            const startedAtDate = new Date(startedAtValue);
            const isoDatePart = Number.isNaN(startedAtDate.getTime())
                ? new Date().toISOString().slice(0, 10)
                : startedAtDate.toISOString().slice(0, 10);
            return 'ExploratorySession_' + isoDatePart + '.json';
        }

        function downloadEmbeddedJson() {
            const jsonString = JSON.stringify(sessionData, null, 2);
            const jsonBlob = new Blob([jsonString], { type: 'application/json' });
            const objectUrl = URL.createObjectURL(jsonBlob);
            const linkElement = document.createElement('a');
            linkElement.href = objectUrl;
            linkElement.download = buildSessionJsonFileName();
            document.body.appendChild(linkElement);
            linkElement.click();
            document.body.removeChild(linkElement);
            URL.revokeObjectURL(objectUrl);
        }

        function getSessionAnnotation(annotationIdentifier) {
            if (typeof annotationIdentifier !== 'string' || annotationIdentifier === '') {
                return null;
            }

            const annotationList = Array.isArray(sessionData?.session?.annotations)
                ? sessionData.session.annotations
                : [];
            return annotationList.find((annotationItem) => annotationItem.id === annotationIdentifier) || null;
        }

        function getAnnotationImageSource(annotationIdentifier, imageIndexValue) {
            const annotationItem = getSessionAnnotation(annotationIdentifier);
            if (!annotationItem || !Array.isArray(annotationItem.imageEntries)) {
                return '';
            }

            const imageIndex = Number.parseInt(imageIndexValue, 10);
            if (!Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex >= annotationItem.imageEntries.length) {
                return '';
            }

            return annotationItem.imageEntries[imageIndex]?.imageURL || '';
        }

        function getRecordingImageSource(annotationIdentifier, stepIdentifier) {
            if (typeof annotationIdentifier !== 'string' || annotationIdentifier === '' || typeof stepIdentifier !== 'string' || stepIdentifier === '') {
                return '';
            }

            const recordingState = sessionData?.annotationRecordingsById?.[annotationIdentifier];
            if (!recordingState || !Array.isArray(recordingState.screenshots)) {
                return '';
            }

            const screenshotItem = recordingState.screenshots.find((recordingScreenshot) => recordingScreenshot.triggerStepId === stepIdentifier);
            return screenshotItem?.imageURL || '';
        }

        function getStandalonePreviewSource(imageElement) {
            const annotationIdentifier = imageElement.dataset.annotationId || '';
            const imageIndexValue = imageElement.dataset.imageIndex || '';
            if (annotationIdentifier !== '' && imageIndexValue !== '') {
                return getAnnotationImageSource(annotationIdentifier, imageIndexValue);
            }

            const recordingAnnotationIdentifier = imageElement.dataset.recordingAnnotationId || '';
            const recordingStepIdentifier = imageElement.dataset.recordingStepId || '';
            if (recordingAnnotationIdentifier !== '' && recordingStepIdentifier !== '') {
                return getRecordingImageSource(recordingAnnotationIdentifier, recordingStepIdentifier);
            }

            return '';
        }

        function hydrateStandalonePreviewImages() {
            document.querySelectorAll('.preview-image').forEach((imageElement) => {
                const imageSource = getStandalonePreviewSource(imageElement);
                if (imageSource === '') {
                    imageElement.remove();
                    return;
                }

                imageElement.src = imageSource;
                imageElement.dataset.preview = imageSource;
            });
        }

        function showImagePreview(src, metadata = {}) {
            const preview = document.getElementById('imagePreview');
            if (!preview) return;
            const previewImg = preview.querySelector('img');
            const previewMeta = document.getElementById('imagePreviewMeta');
            if (!previewImg) return;
            previewImg.src = src;
            const actionText = typeof metadata?.title === 'string' ? metadata.title.trim() : '';
            const targetText = typeof metadata?.target === 'string' ? metadata.target.trim() : '';
            if (previewMeta) {
                const hasMetadata = actionText !== '' || targetText !== '';
                previewMeta.hidden = !hasMetadata;
                previewMeta.textContent = actionText && targetText
                    ? actionText + ': ' + targetText
                    : (actionText || targetText);
            }
            preview.classList.add('active');
            const close = () => {
                preview.classList.remove('active');
                if (previewMeta) {
                    previewMeta.hidden = true;
                    previewMeta.textContent = '';
                }
                preview.removeEventListener('click', close);
            };
            preview.addEventListener('click', close);
            previewImg.addEventListener('click', e => e.stopPropagation());
            previewMeta?.addEventListener('click', e => e.stopPropagation(), { once: true });
        }

        function positionHoverPreview(previewImage) {
            const preview = document.getElementById('imageHoverPreview');
            if (!preview || !preview.classList.contains('active') || !previewImage || !previewImage.isConnected) {
                return;
            }

            const anchorRect = previewImage.getBoundingClientRect();
            const previewRect = preview.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const gapSize = 10;
            const edgePadding = 8;
            let previewLeft = anchorRect.left + ((anchorRect.width - previewRect.width) / 2);
            let previewTop = anchorRect.top - previewRect.height - gapSize;

            if (previewTop < edgePadding) {
                previewTop = anchorRect.bottom + gapSize;
            }

            if (previewTop + previewRect.height > viewportHeight - edgePadding) {
                previewTop = Math.max(edgePadding, viewportHeight - previewRect.height - edgePadding);
            }

            if (previewLeft < edgePadding) {
                previewLeft = edgePadding;
            }

            if (previewLeft + previewRect.width > viewportWidth - edgePadding) {
                previewLeft = viewportWidth - previewRect.width - edgePadding;
            }

            preview.style.left = previewLeft + 'px';
            preview.style.top = previewTop + 'px';
        }

        function setupImageHover() {
            document.querySelectorAll('.preview-image').forEach(img => {
                img.addEventListener('click', e => {
                    e.preventDefault();
                    const isRecordingPreview = img.dataset.previewKind === 'recording-step';
                    showImagePreview(img.src, isRecordingPreview ? {
                        title: img.dataset.previewTitle || '',
                        target: img.dataset.previewTarget || ''
                    } : null);
                });
                img.addEventListener('mouseenter', () => {
                    const p = document.getElementById('imageHoverPreview');
                    if (!p) return;
                    p.querySelector('img').src = img.src;
                    p.classList.add('active');
                    hoverPreviewAnchorElement = img;
                    positionHoverPreview(img);
                });
                img.addEventListener('mousemove', () => positionHoverPreview(img));
                img.addEventListener('mouseleave', () => {
                    const p = document.getElementById('imageHoverPreview');
                    if (p) {
                        p.classList.remove('active');
                        p.querySelector('img').src = '';
                    }
                    hoverPreviewAnchorElement = null;
                });
            });

            window.addEventListener('resize', () => {
                if (!hoverPreviewAnchorElement) {
                    return;
                }

                positionHoverPreview(hoverPreviewAnchorElement);
            });
        }

        function setupReportTabs() {
            const tabButtons = Array.from(document.querySelectorAll('[data-report-tab]'));
            const tabPanels = Array.from(document.querySelectorAll('[data-report-panel]'));
            if (tabButtons.length === 0 || tabPanels.length === 0) {
                return;
            }

            const activateTab = (targetTabName) => {
                tabButtons.forEach((buttonElement) => {
                    const isActive = buttonElement.dataset.reportTab === targetTabName;
                    buttonElement.classList.toggle('is-active', isActive);
                    buttonElement.setAttribute('aria-selected', isActive ? 'true' : 'false');
                    buttonElement.tabIndex = isActive ? 0 : -1;
                });

                tabPanels.forEach((panelElement) => {
                    const isActive = panelElement.dataset.reportPanel === targetTabName;
                    panelElement.classList.toggle('is-active', isActive);
                    panelElement.hidden = !isActive;
                });
            };

            tabButtons.forEach((buttonElement) => {
                buttonElement.addEventListener('click', () => activateTab(buttonElement.dataset.reportTab));
            });

            const initialActiveButton = tabButtons.find((buttonElement) => buttonElement.classList.contains('is-active')) || tabButtons[0];
            activateTab(initialActiveButton.dataset.reportTab);
        }

        function setupEmbeddedJsonDownload() {
            const downloadButton = document.getElementById('downloadEmbeddedJsonBtn');
            if (!downloadButton) {
                return;
            }

            downloadButton.addEventListener('click', () => {
                downloadEmbeddedJson();
            });
        }

        function setupReplayCopyButtons() {
            const copyTitleLabel = ${JSON.stringify(getMessage('reportReplayCopyTitle', undefined, 'Copy recorded steps'))};
            const copySuccessLabel = ${JSON.stringify(getMessage('reportReplayCopySuccess', undefined, 'Copied'))};
            const copyFailedLabel = ${JSON.stringify(getMessage('reportReplayCopyFailed', undefined, 'Copy failed'))};
            let replayCopyTooltipTimer = null;
            function resetReplayCopyButtonsState() {
                document.querySelectorAll('.annotation-replay-copy-btn.is-copied').forEach((buttonElement) => {
                    buttonElement.classList.remove('is-copied');
                    delete buttonElement.dataset.tooltip;
                    buttonElement.setAttribute('aria-label', copyTitleLabel);
                    buttonElement.title = copyTitleLabel;
                });
            }
            document.addEventListener('click', async (event) => {
                const copyButton = event.target.closest('.annotation-replay-copy-btn');
                if (!copyButton) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                const encodedCopyText = copyButton.dataset.copyText || '';
                const copyText = encodedCopyText ? decodeURIComponent(encodedCopyText) : '';
                if (!copyText) {
                    return;
                }

                try {
                    await navigator.clipboard.writeText(copyText);
                    resetReplayCopyButtonsState();
                    copyButton.classList.add('is-copied');
                    const defaultLabel = copyButton.getAttribute('aria-label') || '';
                    copyButton.dataset.defaultLabel = defaultLabel;
                    copyButton.dataset.tooltip = copySuccessLabel;
                    copyButton.setAttribute('aria-label', copySuccessLabel);
                    copyButton.title = copySuccessLabel;
                    if (replayCopyTooltipTimer) {
                        window.clearTimeout(replayCopyTooltipTimer);
                    }
                    replayCopyTooltipTimer = window.setTimeout(() => {
                        resetReplayCopyButtonsState();
                        replayCopyTooltipTimer = null;
                    }, 2000);
                } catch (error) {
                    delete copyButton.dataset.tooltip;
                    copyButton.title = copyFailedLabel;
                    copyButton.setAttribute('aria-label', copyFailedLabel);
                }
            });
        }

        // Filter functionality for downloaded report
        document.querySelectorAll('.filter-pill').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                const type = this.dataset.type;
                document.querySelectorAll('.annotation-title-row, .annotation-row, .annotation-replay-row').forEach(row => {
                    const rowType = row.dataset.annotationType || '';
                    const shouldShow = type === 'all' || rowType === type;
                    row.style.display = shouldShow ? '' : 'none';
                });
            });
        });

        document.addEventListener('DOMContentLoaded', () => {
            hydrateStandalonePreviewImages();
            setupReportTabs();
            setupImageHover();
            setupEmbeddedJsonDownload();
            setupReplayCopyButtons();
        });
    <\/script>
</body>
</html>`;
}

function triggerDownload(htmlContent) {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ExploratoryTestingReport_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
