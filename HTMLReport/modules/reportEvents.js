import { deleteAnnotation, deleteAnnotationImage, updateAnnotationName } from './reportData.js';
import { displayAnnotationsTable } from './reportUI.js';
import { downloadCompleteReport, downloadAllImages } from './reportDownload.js';

let annotationToDelete = null;
let currentFilter = 'all';

/**
 * Returns the current active filter type.
 */
export function getCurrentFilter() {
    return currentFilter;
}

/**
 * Sets up all interactive event listeners for the report.
 */
export function setupAllListeners(session) {
    setupFilterListeners(session);
    setupDeleteListeners();
    setupDownloadListener(session);
    setupTableActionListeners();
}

/**
 * Re-binds row-level listeners after table re-render.
 */
export function rebindTableListeners() {
    return;
}

function setupFilterListeners(session) {
    document.querySelectorAll('.filter-pill').forEach(button => {
        button.addEventListener('click', function () {
            document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.dataset.type;
            displayAnnotationsTable(session, currentFilter);
            rebindTableListeners();
        });
    });
}

function setupDeleteListeners() {
    document.getElementById('cancelDelete').addEventListener('click', () => {
        document.getElementById('divOverlay').style.display = 'none';
        annotationToDelete = null;
    });

    document.getElementById('deleteYes').addEventListener('click', async () => {
        if (annotationToDelete === null) return;
        const response = await deleteAnnotation(annotationToDelete);
        document.getElementById('divOverlay').style.display = 'none';
        annotationToDelete = null;
        // Reload to resync regardless of response
        location.reload();
    });
}

function setupDownloadListener(session) {
    document.getElementById('downloadReportBtn').addEventListener('click', () => {
        downloadCompleteReport(session);
    });

    document.getElementById('downloadImagesBtn').addEventListener('click', () => {
        downloadAllImages(session);
    });
}

function setupTableActionListeners() {
    document.getElementById('annotationsTableBody').addEventListener('click', async (event) => {
        const deleteButton = event.target.closest('.delete-btn');
        if (deleteButton) {
            annotationToDelete = deleteButton.dataset.annotationId;
            document.getElementById('divOverlay').style.display = 'block';
            return;
        }

        const saveButton = event.target.closest('.save-description-btn');
        if (saveButton) {
            const rowElement = saveButton.closest('tr');
            const descriptionField = rowElement.querySelector('.description-editor');
            await updateAnnotationName(saveButton.dataset.annotationId, descriptionField.value);
            location.reload();
            return;
        }

        const deleteImageButton = event.target.closest('.delete-image-btn');
        if (deleteImageButton) {
            await deleteAnnotationImage(
                deleteImageButton.dataset.annotationId,
                Number(deleteImageButton.dataset.imageIndex)
            );
            location.reload();
            return;
        }

        const previewImage = event.target.closest('.preview-image');
        if (previewImage) {
            showImagePreview(previewImage.dataset.preview);
        }
    });

    document.getElementById('annotationsTableBody').addEventListener('mouseover', (event) => {
        const previewImage = event.target.closest('.preview-image');
        if (!previewImage) {
            return;
        }

        showHoverPreview(previewImage.dataset.preview, event);
    });

    document.getElementById('annotationsTableBody').addEventListener('mousemove', (event) => {
        const previewImage = event.target.closest('.preview-image');
        if (!previewImage) {
            return;
        }

        updateHoverPosition(event);
    });

    document.getElementById('annotationsTableBody').addEventListener('mouseout', (event) => {
        const previewImage = event.target.closest('.preview-image');
        if (!previewImage || previewImage.contains(event.relatedTarget)) {
            return;
        }

        hideHoverPreview();
    });
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

function showHoverPreview(src, event) {
    const preview = document.getElementById('imageHoverPreview');
    preview.querySelector('img').src = src;
    preview.classList.add('active');
    updateHoverPosition(event);
}

function updateHoverPosition(event) {
    const preview = document.getElementById('imageHoverPreview');
    if (!preview.classList.contains('active')) return;

    const offset = 15;
    const pw = preview.offsetWidth;
    const ph = preview.offsetHeight;
    let left = event.clientX + offset;
    let top = event.clientY + offset;

    if (left + pw > window.innerWidth) left = event.clientX - pw - offset;
    if (top + ph > window.innerHeight) top = event.clientY - ph - offset;

    preview.style.left = left + 'px';
    preview.style.top = top + 'px';
}

function hideHoverPreview() {
    document.getElementById('imageHoverPreview').classList.remove('active');
}
