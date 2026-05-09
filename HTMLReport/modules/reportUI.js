const ANNOTATION_ICONS = {
    Bug: '../images/bug.svg',
    Note: '../images/note.svg'
};

const ANNOTATION_COLORS = {
    Bug: '#ef4444',
    Note: '#22c55e'
};

/**
 * Renders session information in the header area.
 */
export function displaySessionInfo(session) {
    const sessionInfo = document.getElementById('sessionInfo');
    const browserInfo = session.getBrowserInfo();
    const startDateTime = session.getStartDateTime();

    sessionInfo.innerHTML = `
        <div class="info-item">
            <span class="info-label">Start Date</span>
            <span class="info-value">${startDateTime.toLocaleString()}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Browser</span>
            <span class="info-value">${browserInfo.browser} ${browserInfo.browserVersion}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Operating System</span>
            <span class="info-value">${browserInfo.os}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Cookies</span>
            <span class="info-value">${browserInfo.cookies ? 'Enabled' : 'Disabled'}</span>
        </div>
    `;
}

/**
 * Renders the summary stat cards.
 */
export function displayStats(reportState) {
    const stats = [
        { type: 'Bug', label: 'Bugs', count: reportState.session.getBugs().length, icon: ANNOTATION_ICONS.Bug },
        { type: 'Note', label: 'Notes', count: reportState.session.getNotes().length, icon: ANNOTATION_ICONS.Note },
        { type: 'Recording', label: 'Recorded Steps', count: reportState.recording.steps.length, icon: '' }
    ];

    const statsContainer = document.getElementById('statsCards');
    statsContainer.innerHTML = stats.map(stat => `
        <div class="stat-card stat-card--${stat.type.toLowerCase()}">
            <div class="stat-card__icon">
                ${stat.icon
            ? `<img src="${stat.icon}" alt="${stat.type}" class="annotation-icon">`
            : `<span class="stat-card__glyph">${escapeHtml(stat.type.slice(0, 1))}</span>`}
            </div>
            <div class="stat-card__content">
                <span class="stat-card__count">${stat.count}</span>
                <span class="stat-card__label">${stat.label}</span>
            </div>
        </div>
    `).join('');
}

export function displayRecordingCard(recordingState) {
    const recordingStateCard = document.getElementById('recordingStateCard');
    if (!recordingStateCard) {
        return;
    }

    recordingStateCard.innerHTML = `
        <div class="state-card__header">
            <div>
                <p class="state-card__eyebrow">Recorder Snapshot</p>
                <h3 class="state-card__title">${recordingState.steps.length > 0 ? 'Flow Captured' : 'No Recorded Flow'}</h3>
            </div>
            <span class="state-card__badge${recordingState.steps.length > 0 ? '' : ' is-muted'}">${recordingState.steps.length} steps</span>
        </div>
        <div class="state-metrics">
            <div class="state-metric">
                <span class="state-metric__label">Screenshots</span>
                <span class="state-metric__value">${recordingState.screenshots.length}</span>
            </div>
            <div class="state-metric">
                <span class="state-metric__label">Started</span>
                <span class="state-metric__value">${recordingState.startedAt ? formatDateTime(recordingState.startedAt) : 'N/A'}</span>
            </div>
            <div class="state-metric">
                <span class="state-metric__label">Stopped</span>
                <span class="state-metric__value">${recordingState.stoppedAt ? formatDateTime(recordingState.stoppedAt) : 'N/A'}</span>
            </div>
        </div>
        <p class="state-card__body">${recordingState.steps.length > 0 ? 'Recorded actions are included below and restored on import.' : 'No recorder steps were available in the exported state.'}</p>
    `;
}

export function displayRecordingTimeline(recordingState) {
    const recordingTimeline = document.getElementById('recordingTimeline');
    if (!recordingTimeline) {
        return;
    }

    if (recordingState.steps.length === 0) {
        recordingTimeline.innerHTML = '<div class="recording-empty-state">No recording steps available.</div>';
        return;
    }

    const screenshotByStepId = new Map(
        recordingState.screenshots.map((screenshotItem) => [screenshotItem.triggerStepId, screenshotItem])
    );

    recordingTimeline.innerHTML = recordingState.steps.map((stepItem, stepIndex) => {
        const linkedScreenshot = screenshotByStepId.get(stepItem.stepId);
        return `
            <article class="recording-step">
                <div class="recording-step__header">
                    <span class="recording-step__index">Step ${stepIndex + 1}</span>
                    <span class="recording-step__type">${escapeHtml(stepItem.type)}</span>
                    <span class="recording-step__time">${formatDateTime(stepItem.timestamp)}</span>
                </div>
                <div class="recording-step__body">
                    <div class="recording-step__shot${linkedScreenshot ? '' : ' recording-step__shot--empty'}">
                        ${linkedScreenshot
                ? `<img src="${linkedScreenshot.imageURL}" class="preview-image" data-preview="${linkedScreenshot.imageURL}" alt="Recording screenshot for step ${stepIndex + 1}">`
                : '<div class="recording-step__shot-placeholder">No screenshot</div>'}
                    </div>
                    <div class="recording-step__content">
                        <p class="recording-step__summary">${escapeHtml(getRecordingStepSummary(stepItem))}</p>
                        ${stepItem.url ? `<p class="recording-step__url">${escapeHtml(stepItem.url)}</p>` : ''}
                        ${stepItem.locator ? `<p class="recording-step__locator">${escapeHtml(formatLocator(stepItem.locator))}</p>` : ''}
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

/**
 * Creates the pie chart for annotation distribution.
 */
export function createAnnotationsChart(session) {
    const data = [
        session.getBugs().length,
        session.getNotes().length
    ];

    // Don't render chart if no annotations
    if (data.every(d => d === 0)) {
        document.getElementById('chartContainer').style.display = 'none';
        return;
    }

    const ctx = document.getElementById('annotationsChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Bugs', 'Notes'],
            datasets: [{
                data,
                backgroundColor: [
                    ANNOTATION_COLORS.Bug,
                    ANNOTATION_COLORS.Note
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            cutout: '60%',
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

/**
 * Renders the annotations table filtered by the current filter.
 */
export function displayAnnotationsTable(session, currentFilter) {
    const tableBody = document.getElementById('annotationsTableBody');
    const annotations = session.getAnnotations();
    const filtered = annotations.filter(
        a => currentFilter === 'all' || a.constructor.name === currentFilter
    );

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    No annotations found for this filter.
                </td>
            </tr>`;
        return;
    }

    tableBody.innerHTML = filtered.map((annotation) => {
        const type = annotation.constructor.name;
        const imageEntries = annotation.getImageEntries();
        return `
        <tr class="annotation-row annotation-row--${type.toLowerCase()}">
            <td class="annotation-type-cell">
                <span class="type-icon-chip type-icon-chip--${type.toLowerCase()}" title="${type}" aria-label="${type}">
                    <img src="${ANNOTATION_ICONS[type] || ''}" alt="${type}" class="annotation-icon">
                </span>
            </td>
            <td class="annotation-description">
                <textarea
                    class="description-editor"
                    data-annotation-id="${annotation.id}"
                    data-saved-value="${escapeHtml(annotation.name)}"
                    rows="4">${escapeHtml(annotation.name)}</textarea>
            </td>
            <td class="annotation-url">
                ${annotation.url ? `<a href="${escapeHtml(annotation.url)}" target="_blank" rel="noopener">${truncateUrl(annotation.url)}</a>` : '<span class="text-muted">N/A</span>'}
            </td>
            <td class="annotation-time">${annotation.timestamp ? formatDate(annotation.timestamp) : 'N/A'}</td>
            <td class="screenshot-cell">
                ${imageEntries.length > 0
                ? `<div class="screenshot-gallery">
                    ${imageEntries.map((imageEntry, imageIndex) => `
                        <div class="screenshot-thumb">
                            <div class="screenshot-thumb__image-shell">
                                <img src="${imageEntry.imageURL}"
                                     class="preview-image"
                                     data-annotation-id="${annotation.id}"
                                     data-image-index="${imageIndex}"
                                     data-preview="${imageEntry.imageURL}"
                                     alt="Screenshot ${imageIndex + 1}">
                                <button
                                    class="delete-image-btn"
                                    data-annotation-id="${annotation.id}"
                                    data-image-index="${imageIndex}"
                                    title="Remove screenshot"
                                    aria-label="Remove screenshot">
                                    <span class="visually-hidden">Remove screenshot</span>
                                </button>
                            </div>
                            <span class="screenshot-time">${formatTime(imageEntry.createdAt)}</span>
                        </div>
                    `).join('')}
                </div>`
                : '<span class="text-muted">--</span>'}
            </td>
            <td class="annotation-actions-cell">
                <div class="row-actions">
                    <button class="delete-btn" data-annotation-id="${annotation.id}" title="Delete annotation" aria-label="Delete annotation">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M5.5 5.5v6m5-6v6M2 3.5h12m-1.5 0l-.533 8.528A1.5 1.5 0 0110.477 13.5H5.523a1.5 1.5 0 01-1.49-1.472L3.5 3.5m3-1.5h3a1 1 0 011 1v.5h-5V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncateUrl(url) {
    try {
        const parsed = new URL(url);
        const display = parsed.hostname + parsed.pathname;
        return display.length > 50 ? display.substring(0, 47) + '...' : display;
    } catch {
        return url.length > 50 ? url.substring(0, 47) + '...' : url;
    }
}

function formatDate(timestampValue) {
    return new Date(timestampValue).toLocaleDateString('ru-RU');
}

function formatTime(timestampValue) {
    return new Date(timestampValue).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatDateTime(timestampValue) {
    return new Date(timestampValue).toLocaleString('ru-RU');
}

function formatLocator(locator) {
    if (!locator) {
        return '';
    }

    const locatorName = locator.name ? ` (${locator.name})` : '';
    return `${locator.strategy}: ${locator.value}${locatorName}`;
}

function getRecordingStepSummary(stepItem) {
    if (stepItem.type === 'input' || stepItem.type === 'change') {
        return `Value changed to "${stepItem.value || ''}"`;
    }

    if (stepItem.type === 'click' || stepItem.type === 'submit') {
        return stepItem.text ? `Target text: ${stepItem.text}` : 'Interaction with target element';
    }

    if (stepItem.type === 'navigation') {
        return stepItem.url ? `Navigated to ${stepItem.url}` : 'Navigation event';
    }

    return stepItem.text || stepItem.value || 'Recorded action';
}
