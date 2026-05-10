import {
    formatDateLocalized,
    formatDateTimeLocalized,
    formatTimeLocalized,
    getAnnotationTypeLabel,
    getMessage,
    getPluralMessage,
    getRecorderStepTypeLabel
} from '../../src/i18n.js';

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
    const environmentItems = [
        {
            label: getMessage('reportEnvironmentStartDate', undefined, 'Start date'),
            value: formatDateTime(startDateTime),
            hint: getMessage('reportEnvironmentStartDateHint', undefined, 'The moment when this testing session started.')
        },
        {
            label: getMessage('reportEnvironmentBrowser', undefined, 'Browser'),
            value: formatBrowserInfo(browserInfo),
            hint: getMessage('reportEnvironmentBrowserHint', undefined, 'Detected browser name and version used during the session.')
        },
        {
            label: getMessage('reportEnvironmentOs', undefined, 'Operating system'),
            value: browserInfo.osDisplay || browserInfo.os || getMessage('reportNotAvailable', undefined, 'N/A'),
            hint: getMessage('reportEnvironmentOsHint', undefined, 'Detected operating system and CPU architecture.')
        },
        {
            label: getMessage('reportEnvironmentLocale', undefined, 'Locale'),
            value: browserInfo.pageLanguage || browserInfo.language || getMessage('reportNotAvailable', undefined, 'N/A'),
            hint: getMessage('reportEnvironmentLocaleHint', undefined, 'Language used by the page or browser for translations, formats, and content.')
        },
        {
            label: getMessage('reportEnvironmentTimezone', undefined, 'Timezone'),
            value: browserInfo.timezone || getMessage('reportNotAvailable', undefined, 'N/A'),
            hint: getMessage('reportEnvironmentTimezoneHint', undefined, 'Browser timezone used to format dates and times.')
        },
        {
            label: getMessage('reportEnvironmentViewport', undefined, 'Viewport'),
            value: browserInfo.viewport || getMessage('reportNotAvailable', undefined, 'N/A'),
            hint: getMessage('reportEnvironmentViewportHint', undefined, 'Visible page area size in CSS pixels.')
        },
        {
            label: getMessage('reportEnvironmentScreen', undefined, 'Screen'),
            value: browserInfo.screenResolution || getMessage('reportNotAvailable', undefined, 'N/A'),
            hint: getMessage('reportEnvironmentScreenHint', undefined, 'Reported screen resolution in physical pixels.')
        },
        {
            label: getMessage('reportEnvironmentDpr', undefined, 'DPR'),
            value: browserInfo.devicePixelRatio || getMessage('reportNotAvailable', undefined, 'N/A'),
            hint: getMessage('reportEnvironmentDprHint', undefined, 'Device Pixel Ratio. Shows how many physical pixels are used for one CSS pixel. Useful for zoom, screenshots, and sharpness issues.')
        },
        {
            label: getMessage('reportEnvironmentPageTitle', undefined, 'Page title'),
            value: browserInfo.pageTitle || getMessage('reportNotAvailable', undefined, 'N/A'),
            hint: getMessage('reportEnvironmentPageTitleHint', undefined, 'Current document title of the tested page.')
        }
    ];

    sessionInfo.innerHTML = environmentItems.map((item) => `
        <div class="info-item">
            <span class="info-key">
                <span
                    class="info-label${item.hint ? ' info-label--hint' : ''}"
                    ${item.hint ? `title="${escapeHtml(item.hint)}" aria-label="${escapeHtml(`${item.label}: ${item.hint}`)}"` : ''}
                >${item.label}${item.hint ? '<span class="info-label__hint-marker" aria-hidden="true">?</span>' : ''}</span>
            </span>
            <span class="info-value">${escapeHtml(item.value)}</span>
        </div>
    `).join('');
}

/**
 * Renders the summary stat cards.
 */
export function displayStats(reportState) {
    const statsContainer = document.getElementById('statsCards');
    if (!statsContainer) {
        return;
    }

    const replayEntries = getReplayEntries(reportState);
    const totalRecordedSteps = replayEntries.reduce((totalCount, replayEntry) => totalCount + replayEntry.recordingState.steps.length, 0);
    const stats = [
        { type: 'Bug', label: getMessage('reportStatsBugs', undefined, 'Bugs'), count: reportState.session.getBugs().length, icon: ANNOTATION_ICONS.Bug },
        { type: 'Note', label: getMessage('reportStatsNotes', undefined, 'Notes'), count: reportState.session.getNotes().length, icon: ANNOTATION_ICONS.Note },
        { type: 'Recording', label: getMessage('reportStatsRecordedSteps', undefined, 'Recorded steps'), count: totalRecordedSteps, icon: '' }
    ];

    statsContainer.innerHTML = stats.map(stat => `
        <div class="chart-legend__item chart-legend__item--${stat.type.toLowerCase()}">
            <div class="chart-legend__icon">
                ${stat.icon
            ? `<img src="${stat.icon}" alt="${escapeHtml(getAnnotationTypeLabel(stat.type))}" class="annotation-icon" data-annotation-type="${escapeHtml(stat.type)}">`
            : `<span class="chart-legend__glyph">${escapeHtml(stat.label.slice(0, 1))}</span>`}
            </div>
            <div class="chart-legend__content">
                <span class="chart-legend__count">${stat.count}</span>
                <span class="chart-legend__label">${stat.label}</span>
            </div>
        </div>
    `).join('');
}

function getAnnotationRecordingState(reportState, annotationId) {
    return reportState?.annotationRecordingsById?.[annotationId] || {
        steps: [],
        screenshots: [],
        lastError: '',
        failedStepId: '',
        startedAt: null,
        stoppedAt: null
    };
}

function getReplayEntries(reportState) {
    return reportState.session.getAnnotations()
        .map((annotation) => ({
            annotation,
            recordingState: getAnnotationRecordingState(reportState, annotation.getId())
        }))
        .filter(({ recordingState }) => Array.isArray(recordingState.steps) && recordingState.steps.length > 0);
}

function renderRecordingTimelineMarkup(recordingState) {
    const screenshotByStepId = new Map(
        recordingState.screenshots.map((screenshotItem) => [screenshotItem.triggerStepId, screenshotItem])
    );

    return recordingState.steps.map((stepItem, stepIndex) => {
        const linkedScreenshot = screenshotByStepId.get(stepItem.stepId);
        const isFailedStep = recordingState.failedStepId === stepItem.stepId;
        return `
            <article class="recording-step${isFailedStep ? ' is-failed' : ''}">
                <div class="recording-step__header">
                    <span class="recording-step__index">${escapeHtml(getMessage('popupStepLabel', [String(stepIndex + 1)], `Step ${stepIndex + 1}`))}</span>
                    <span class="recording-step__type">${escapeHtml(getRecorderStepTypeLabel(stepItem.type))}</span>
                    <span class="recording-step__time">${formatDateTime(stepItem.timestamp)}</span>
                </div>
                <div class="recording-step__body">
                    <div class="recording-step__shot${linkedScreenshot ? '' : ' recording-step__shot--empty'}">
                        ${linkedScreenshot
                ? `<img src="${linkedScreenshot.imageURL}" class="preview-image" data-preview="${linkedScreenshot.imageURL}" alt="${escapeHtml(getMessage('reportRecordingScreenshotAlt', [String(stepIndex + 1)], `Recording screenshot for step ${stepIndex + 1}`))}">`
                : `<div class="recording-step__shot-placeholder">${escapeHtml(getMessage('reportRecordingNoScreenshot', undefined, 'No screenshot'))}</div>`}
                    </div>
                    <div class="recording-step__content">
                        <p class="recording-step__summary">${escapeHtml(getRecordingStepSummary(stepItem))}</p>
                        ${isFailedStep && recordingState.lastError ? `<p class="recording-step__error">${escapeHtml(recordingState.lastError)}</p>` : ''}
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
            labels: [
                getMessage('reportChartLabelBugs', undefined, 'Bugs'),
                getMessage('reportChartLabelNotes', undefined, 'Notes')
            ],
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
export function displayAnnotationsTable(reportState, currentFilter) {
    const tableBody = document.getElementById('annotationsTableBody');
    const annotations = reportState.session.getAnnotations();
    const filtered = annotations.filter(
        a => currentFilter === 'all' || a.constructor.name === currentFilter
    );

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    ${escapeHtml(getMessage('reportNoAnnotationsForFilter', undefined, 'No annotations found for this filter.'))}
                </td>
            </tr>`;
        return;
    }

    tableBody.innerHTML = filtered.map((annotation) => {
        const type = annotation.constructor.name;
        const imageEntries = annotation.getImageEntries();
        const recordingState = getAnnotationRecordingState(reportState, annotation.id);
        const hasLinkedReplay = recordingState.steps.length > 0;
        const replaySummaryText = `${getPluralMessage('countStep', recordingState.steps.length, `${recordingState.steps.length} steps`)} · ${getPluralMessage('countScreenshot', recordingState.screenshots.length, `${recordingState.screenshots.length} screenshots`)}`;
        return `
        <tr class="annotation-row annotation-row--${type.toLowerCase()}">
            <td class="annotation-type-cell">
                <span class="type-icon-chip type-icon-chip--${type.toLowerCase()}" title="${escapeHtml(getAnnotationTypeLabel(type))}" aria-label="${escapeHtml(getAnnotationTypeLabel(type))}">
                    <img src="${ANNOTATION_ICONS[type] || ''}" alt="${escapeHtml(getAnnotationTypeLabel(type))}" class="annotation-icon" data-annotation-type="${escapeHtml(type)}">
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
                ${annotation.url ? `<a href="${escapeHtml(annotation.url)}" target="_blank" rel="noopener">${truncateUrl(annotation.url)}</a>` : `<span class="text-muted">${escapeHtml(getMessage('reportNotAvailable', undefined, 'N/A'))}</span>`}
            </td>
            <td class="annotation-time">${annotation.timestamp ? formatDate(annotation.timestamp) : escapeHtml(getMessage('reportNotAvailable', undefined, 'N/A'))}</td>
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
                                     alt="${escapeHtml(getMessage('reportScreenshotAlt', [String(imageIndex + 1)], `Screenshot ${imageIndex + 1}`))}">
                                <button
                                    class="delete-image-btn"
                                    data-annotation-id="${annotation.id}"
                                    data-image-index="${imageIndex}"
                                    title="${escapeHtml(getMessage('reportRemoveScreenshot', undefined, 'Remove screenshot'))}"
                                    aria-label="${escapeHtml(getMessage('reportRemoveScreenshot', undefined, 'Remove screenshot'))}">
                                    <span class="visually-hidden">${escapeHtml(getMessage('reportRemoveScreenshot', undefined, 'Remove screenshot'))}</span>
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
                    <button class="delete-btn" data-annotation-id="${annotation.id}" title="${escapeHtml(getMessage('reportDeleteAnnotation', undefined, 'Delete annotation'))}" aria-label="${escapeHtml(getMessage('reportDeleteAnnotation', undefined, 'Delete annotation'))}">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M5.5 5.5v6m5-6v6M2 3.5h12m-1.5 0l-.533 8.528A1.5 1.5 0 0110.477 13.5H5.523a1.5 1.5 0 01-1.49-1.472L3.5 3.5m3-1.5h3a1 1 0 011 1v.5h-5V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>${hasLinkedReplay ? `
        <tr class="annotation-replay-row">
            <td colspan="6" class="annotation-replay-row__cell">
                <details class="annotation-replay-details">
                    <summary class="annotation-replay-details__summary">
                        <span class="annotation-replay-details__title">${escapeHtml(getMessage('reportAnnotationReplayTitle', undefined, 'Replay'))}</span>
                        <span class="annotation-replay-details__meta">${escapeHtml(replaySummaryText)}</span>
                    </summary>
                    <div class="annotation-replay-details__body">
                        ${renderRecordingTimelineMarkup(recordingState)}
                    </div>
                </details>
            </td>
        </tr>` : ''}`;
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

function formatBrowserInfo(browserInfo) {
    if (!browserInfo) {
        return getMessage('reportNotAvailable', undefined, 'N/A');
    }

    if (browserInfo.browserDisplayName) {
        return browserInfo.browserDisplayName;
    }

    const browserName = typeof browserInfo.browser === 'string' ? browserInfo.browser : '';
    const browserVersion = typeof browserInfo.browserVersion === 'string' ? browserInfo.browserVersion : '';
    return [browserName, browserVersion].filter(Boolean).join(' ') || getMessage('reportNotAvailable', undefined, 'N/A');
}

function formatDate(timestampValue) {
    return formatDateLocalized(timestampValue);
}

function formatTime(timestampValue) {
    return formatTimeLocalized(timestampValue, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatDateTime(timestampValue) {
    return formatDateTimeLocalized(timestampValue);
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
        return getMessage('reportRecordingValueChanged', [stepItem.value || ''], `Value changed to "${stepItem.value || ''}"`);
    }

    if (stepItem.type === 'click' || stepItem.type === 'submit') {
        return stepItem.text
            ? getMessage('reportRecordingTargetText', [stepItem.text], `Target text: ${stepItem.text}`)
            : getMessage('reportRecordingInteraction', undefined, 'Interaction with target element');
    }

    if (stepItem.type === 'navigation') {
        return stepItem.url
            ? getMessage('reportRecordingNavigatedTo', [stepItem.url], `Navigated to ${stepItem.url}`)
            : getMessage('reportRecordingNavigationEvent', undefined, 'Navigation event');
    }

    return stepItem.text || stepItem.value || getMessage('reportRecordingFallbackAction', undefined, 'Recorded action');
}
