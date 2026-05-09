import { deleteAnnotation, deleteAnnotationImage, updateAnnotationName } from './reportData.js';
import { displayAnnotationsTable } from './reportUI.js';
import { downloadCompleteReport, downloadAllImages } from './reportDownload.js';

let currentFilter = 'all';
let hoverPreviewAnchorElement = null;
let armedDeleteImageKey = '';
let armedDeleteAnnotationId = '';
const pendingDescriptionSaveById = new Map();

/**
 * Returns the current active filter type.
 */
export function getCurrentFilter() {
    return currentFilter;
}

/**
 * Sets up all interactive event listeners for the report.
 */
export function setupAllListeners(reportState) {
    setupFilterListeners(reportState);
    setupDownloadListener(reportState);
    setupTableActionListeners(reportState.session);
}

/**
 * Re-binds row-level listeners after table re-render.
 */
export function rebindTableListeners() {
    return;
}

function getDeleteImageKey(annotationId, imageIndex) {
    return `${annotationId}:${imageIndex}`;
}

function renderDeleteImageButtonState() {
    document.querySelectorAll('.delete-image-btn').forEach((button) => {
        const buttonKey = getDeleteImageKey(
            button.dataset.annotationId || '',
            Number(button.dataset.imageIndex)
        );
        const isArmed = armedDeleteImageKey !== '' && armedDeleteImageKey === buttonKey;
        button.classList.toggle('is-armed', isArmed);
        button.title = isArmed ? 'Confirm remove screenshot' : 'Remove screenshot';
        button.setAttribute('aria-label', isArmed ? 'Confirm remove screenshot' : 'Remove screenshot');
        const hiddenLabel = button.querySelector('.visually-hidden');
        if (hiddenLabel) {
            hiddenLabel.textContent = isArmed ? 'Confirm remove screenshot' : 'Remove screenshot';
        }
    });
}

function renderDeleteAnnotationButtonState() {
    document.querySelectorAll('.delete-btn').forEach((button) => {
        const annotationId = button.dataset.annotationId || '';
        const isArmed = armedDeleteAnnotationId !== '' && armedDeleteAnnotationId === annotationId;
        button.classList.toggle('is-armed', isArmed);
        button.title = isArmed ? 'Confirm delete annotation' : 'Delete annotation';
        button.setAttribute('aria-label', isArmed ? 'Confirm delete annotation' : 'Delete annotation');
    });
}

function setupFilterListeners(reportState) {
    document.querySelectorAll('.filter-pill').forEach(button => {
        button.addEventListener('click', function () {
            document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.type;
            armedDeleteImageKey = '';
            armedDeleteAnnotationId = '';
            displayAnnotationsTable(reportState.session, currentFilter);
            renderDeleteImageButtonState();
            renderDeleteAnnotationButtonState();
            rebindTableListeners();
        });
    });
}

function setupDownloadListener(reportState) {
    document.getElementById('downloadReportBtn').addEventListener('click', () => {
        downloadCompleteReport(reportState);
    });

    document.getElementById('downloadImagesBtn').addEventListener('click', () => {
        downloadAllImages(reportState);
    });
}

function setupTableActionListeners(session) {
    document.getElementById('annotationsTableBody').addEventListener('click', async (event) => {
        const deleteButton = event.target.closest('.delete-btn');
        if (deleteButton) {
            const annotationId = deleteButton.dataset.annotationId || '';
            if (armedDeleteAnnotationId !== annotationId) {
                armedDeleteAnnotationId = annotationId;
                armedDeleteImageKey = '';
                renderDeleteAnnotationButtonState();
                renderDeleteImageButtonState();
                return;
            }

            armedDeleteAnnotationId = '';
            await deleteAnnotation(annotationId);
            location.reload();
            return;
        }

        const deleteImageButton = event.target.closest('.delete-image-btn');
        if (deleteImageButton) {
            const imageIndex = Number(deleteImageButton.dataset.imageIndex);
            const nextDeleteImageKey = getDeleteImageKey(deleteImageButton.dataset.annotationId, imageIndex);
            if (armedDeleteImageKey !== nextDeleteImageKey) {
                armedDeleteImageKey = nextDeleteImageKey;
                armedDeleteAnnotationId = '';
                renderDeleteImageButtonState();
                renderDeleteAnnotationButtonState();
                return;
            }

            armedDeleteImageKey = '';
            await deleteAnnotationImage(
                deleteImageButton.dataset.annotationId,
                imageIndex
            );
            location.reload();
            return;
        }

        const previewImage = event.target.closest('.preview-image');
        if (previewImage) {
            showImagePreview(previewImage.dataset.preview);
        }
    });

    document.getElementById('annotationsTableBody').addEventListener('input', (event) => {
        const descriptionField = event.target.closest('.description-editor');
        if (!descriptionField) {
            return;
        }

        updateDescriptionDirtyState(descriptionField);
    });

    document.getElementById('annotationsTableBody').addEventListener('change', async (event) => {
        const descriptionField = event.target.closest('.description-editor');
        if (!descriptionField) {
            return;
        }

        await persistDescriptionField(session, descriptionField, { silent: false });
    });

    document.getElementById('annotationsTableBody').addEventListener('mouseover', (event) => {
        const previewImage = event.target.closest('.preview-image');
        if (!previewImage) {
            return;
        }

        showHoverPreview(previewImage.dataset.preview, previewImage);
    });

    document.getElementById('annotationsTableBody').addEventListener('mousemove', (event) => {
        const previewImage = event.target.closest('.preview-image');
        if (!previewImage) {
            return;
        }

        updateHoverPosition(previewImage);
    });

    document.getElementById('annotationsTableBody').addEventListener('mouseout', (event) => {
        const previewImage = event.target.closest('.preview-image');
        if (!previewImage || previewImage.contains(event.relatedTarget)) {
            return;
        }

        hideHoverPreview();
    });

    window.addEventListener('resize', () => {
        if (!hoverPreviewAnchorElement) {
            return;
        }

        updateHoverPosition(hoverPreviewAnchorElement);
    });

    document.addEventListener('click', (event) => {
        if (armedDeleteImageKey === '') {
            return;
        }

        if (event.target.closest('.delete-image-btn')) {
            return;
        }

        armedDeleteImageKey = '';
        renderDeleteImageButtonState();
    });

    document.addEventListener('click', (event) => {
        if (armedDeleteAnnotationId === '') {
            return;
        }

        if (event.target.closest('.delete-btn')) {
            return;
        }

        armedDeleteAnnotationId = '';
        renderDeleteAnnotationButtonState();
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            return;
        }

        flushDirtyDescriptionEditors(session, { silent: true });
    });

    window.addEventListener('pagehide', () => {
        flushDirtyDescriptionEditors(session, { silent: true });
    });

    renderDeleteImageButtonState();
    renderDeleteAnnotationButtonState();
}

function getSavedDescriptionValue(descriptionField) {
    return typeof descriptionField.dataset.savedValue === 'string'
        ? descriptionField.dataset.savedValue
        : '';
}

async function persistDescriptionField(session, descriptionField, options = {}) {
    const annotationId = descriptionField.dataset.annotationId || '';
    if (annotationId === '') {
        return false;
    }

    if (pendingDescriptionSaveById.has(annotationId)) {
        return pendingDescriptionSaveById.get(annotationId);
    }

    const { silent = false } = options;
    const previousSavedValue = getSavedDescriptionValue(descriptionField);
    const nextSavedValue = descriptionField.value.trim();

    if (nextSavedValue === previousSavedValue) {
        descriptionField.value = previousSavedValue;
        updateDescriptionDirtyState(descriptionField);
        return false;
    }

    if (nextSavedValue === '') {
        descriptionField.value = previousSavedValue;
        updateDescriptionDirtyState(descriptionField);
        if (!silent) {
            alert('Description cannot be empty.');
        }
        return false;
    }

    session.updateAnnotationName(annotationId, nextSavedValue);
    descriptionField.value = nextSavedValue;

    const savePromise = updateAnnotationName(annotationId, nextSavedValue)
        .then(() => {
            descriptionField.dataset.savedValue = nextSavedValue;
            descriptionField.classList.remove('is-dirty');
            return true;
        })
        .catch((error) => {
            session.updateAnnotationName(annotationId, previousSavedValue);
            descriptionField.value = previousSavedValue;
            descriptionField.dataset.savedValue = previousSavedValue;
            updateDescriptionDirtyState(descriptionField);
            if (!silent) {
                alert(error.message || 'Failed to update description.');
            }
            return false;
        })
        .finally(() => {
            pendingDescriptionSaveById.delete(annotationId);
        });

    pendingDescriptionSaveById.set(annotationId, savePromise);
    return savePromise;
}

function flushDirtyDescriptionEditors(session, options = {}) {
    const dirtyEditors = Array.from(document.querySelectorAll('.description-editor.is-dirty'));
    if (dirtyEditors.length === 0) {
        return Promise.resolve([]);
    }

    return Promise.allSettled(
        dirtyEditors.map((descriptionField) => persistDescriptionField(session, descriptionField, options))
    );
}

function updateDescriptionDirtyState(descriptionField) {
    const savedValue = getSavedDescriptionValue(descriptionField);
    descriptionField.classList.toggle('is-dirty', descriptionField.value !== savedValue);
}

// --- Image Preview ---

function showImagePreview(src) {
    const preview = document.getElementById('imagePreview');
    const previewImg = preview.querySelector('img');
    previewImg.src = src;
    preview.classList.add('active');

    const closePreview = () => {
        preview.classList.remove('active');
        preview.removeEventListener('click', closePreview);
    };
    preview.addEventListener('click', closePreview);
    previewImg.addEventListener('click', (e) => e.stopPropagation());
}

function showHoverPreview(src, previewImage) {
    const preview = document.getElementById('imageHoverPreview');
    preview.querySelector('img').src = src;
    preview.classList.add('active');
    hoverPreviewAnchorElement = previewImage;
    updateHoverPosition(previewImage);
}

function updateHoverPosition(previewImage) {
    const preview = document.getElementById('imageHoverPreview');
    if (!preview.classList.contains('active') || !previewImage?.isConnected) {
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

function hideHoverPreview() {
    const preview = document.getElementById('imageHoverPreview');
    preview.classList.remove('active');
    preview.querySelector('img').src = '';
    hoverPreviewAnchorElement = null;
}
