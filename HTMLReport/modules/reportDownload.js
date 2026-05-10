import { serializeReportState } from './reportData.js';
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

    const recordingScreenshots = reportState.recording.screenshots.map((screenshotItem, imageIndex) => ({
        sourceType: 'recording',
        annotationType: 'Recording',
        annotationName: screenshotItem.triggerStepId || `step-${imageIndex + 1}`,
        imageURL: screenshotItem.imageURL,
        createdAt: screenshotItem.createdAt,
        imageIndex
    }));

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

    // Remove interactive-only elements from download
    removeInteractiveElements(reportContent);

    // Embed all images as base64
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
    const chartContainer = container.querySelector('#chartContainer');
    if (chartCanvas && chartContainer) {
        try {
            // Get the canvas as base64 image
            const chartImageData = chartCanvas.toDataURL('image/png');

            // Replace canvas with img element
            const canvas = chartContainer.querySelector('canvas');
            if (canvas) {
                const img = document.createElement('img');
                img.src = chartImageData;
                img.alt = getMessage('reportDownloadChartAlt', undefined, 'Annotation distribution chart');
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
                canvas.replaceWith(img);
            }
        } catch (error) {
            console.error('Error converting chart to image:', error);
            // If conversion fails, remove the chart
            if (chartContainer) chartContainer.remove();
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

    // Remove delete column from each row
    container.querySelectorAll('tbody tr').forEach(row => {
        if (row.lastElementChild) row.lastElementChild.remove();
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

async function embedImages(container) {
    const images = container.querySelectorAll('.preview-image');
    await Promise.all(Array.from(images).map(img => {
        return new Promise((resolve) => {
            if (!img.src) return resolve();
            const tempImg = new Image();
            tempImg.crossOrigin = 'Anonymous';
            tempImg.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = tempImg.width;
                canvas.height = tempImg.height;
                canvas.getContext('2d').drawImage(tempImg, 0, 0);
                img.src = canvas.toDataURL('image/png');
                resolve();
            };
            tempImg.onerror = () => resolve();
            tempImg.src = img.src;
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
    container.querySelectorAll('.annotation-icon').forEach(icon => {
        const type = icon.alt;
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
    return `<!DOCTYPE html>
<html lang="${getUiLocale()}">
<head>
    <meta charset="utf-8">
    <title>${getMessage('reportHtmlTitle', undefined, 'Exploratory Testing Report')}</title>
    <style>${styles}</style>
</head>
<body>
    ${reportHtml}
    <div id="imagePreview" class="image-preview">
        <img src="" alt="${getMessage('reportImagePreviewAlt', undefined, 'Preview')}">
    </div>
    <div id="imageHoverPreview" class="image-hover-preview">
        <img src="" alt="${getMessage('reportImageHoverPreviewAlt', undefined, 'Hover preview')}">
    </div>
    <script>
        const sessionData = ${sessionJSON};
        let hoverPreviewAnchorElement = null;

        function showImagePreview(src) {
            const preview = document.getElementById('imagePreview');
            if (!preview) return;
            const previewImg = preview.querySelector('img');
            if (!previewImg) return;
            previewImg.src = src;
            preview.classList.add('active');
            const close = () => { preview.classList.remove('active'); preview.removeEventListener('click', close); };
            preview.addEventListener('click', close);
            previewImg.addEventListener('click', e => e.stopPropagation());
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
                img.addEventListener('click', e => { e.preventDefault(); showImagePreview(img.src); });
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

        // Filter functionality for downloaded report
        document.querySelectorAll('.filter-pill').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                const type = this.dataset.type;
                document.querySelectorAll('.annotation-row').forEach(row => {
                    if (type === 'all') {
                        row.style.display = '';
                    } else {
                        row.style.display = row.classList.contains('annotation-row--' + type.toLowerCase()) ? '' : 'none';
                    }
                });
            });
        });

        document.addEventListener('DOMContentLoaded', () => {
            setupReportTabs();
            setupImageHover();
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
