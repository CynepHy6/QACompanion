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

const EMPTY_DISPLAY_VALUE = '--';
const CURRENT_USER_FIELDS = [
    'userId',
    'identity',
    'identityLogin',
    'identityEmail',
    'identityPhone',
    'name',
    'surname',
    'email',
    'uiLanguage',
    'locale',
    'serviceLocale',
    'avatarUrl',
    'birthday',
    'roles'
];

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
            value: getDisplayValue(browserInfo.osDisplay || browserInfo.os),
            hint: getMessage('reportEnvironmentOsHint', undefined, 'Detected operating system and CPU architecture.')
        },
        {
            label: getMessage('reportEnvironmentPageLanguage', undefined, 'Page language'),
            value: getDisplayValue(browserInfo.pageLanguage),
            hint: getMessage('reportEnvironmentPageLanguageHint', undefined, 'Language declared by the page in the HTML lang attribute.')
        },
        {
            label: getMessage('reportEnvironmentBrowserLanguage', undefined, 'Browser language'),
            value: getDisplayValue(browserInfo.language),
            hint: getMessage('reportEnvironmentBrowserLanguageHint', undefined, 'Primary browser UI and formatting language reported by navigator.language.')
        },
        {
            label: getMessage('reportEnvironmentTimezone', undefined, 'Timezone'),
            value: getDisplayValue(browserInfo.timezone),
            hint: getMessage('reportEnvironmentTimezoneHint', undefined, 'Browser timezone used to format dates and times.')
        },
        {
            label: getMessage('reportEnvironmentViewport', undefined, 'Viewport'),
            value: getDisplayValue(browserInfo.viewport),
            hint: getMessage('reportEnvironmentViewportHint', undefined, 'Visible page area size in CSS pixels.')
        },
        {
            label: getMessage('reportEnvironmentScreen', undefined, 'Screen'),
            value: getDisplayValue(browserInfo.screenResolution),
            hint: getMessage('reportEnvironmentScreenHint', undefined, 'Reported screen resolution in physical pixels.')
        },
        {
            label: getMessage('reportEnvironmentDpr', undefined, 'DPR'),
            value: getDisplayValue(browserInfo.devicePixelRatio),
            hint: getMessage('reportEnvironmentDprHint', undefined, 'Device Pixel Ratio. Shows how many physical pixels are used for one CSS pixel. Useful for zoom, screenshots, and sharpness issues.')
        },
        {
            label: getMessage('reportEnvironmentPageTitle', undefined, 'Page title'),
            value: getDisplayValue(browserInfo.pageTitle),
            hint: getMessage('reportEnvironmentPageTitleHint', undefined, 'Current document title of the tested page.')
        }
    ];

    renderInfoItems(sessionInfo, environmentItems);
}

export function displayUserInfo(session) {
    const userInfoPanel = document.getElementById('userInfoPanel');
    const userInfoContainer = document.getElementById('userInfo');
    if (!userInfoPanel || !userInfoContainer) {
        return;
    }

    const currentUser = getCurrentUserInfo(session.getBrowserInfo());
    if (!currentUser) {
        userInfoPanel.hidden = true;
        userInfoContainer.innerHTML = '';
        setOverviewLayoutState(false);
        return;
    }

    const userItems = [
        {
            label: 'userId',
            value: getDisplayValue(currentUser.userId),
            rawLabel: true
        },
        {
            label: 'identity',
            value: getDisplayValue(currentUser.identity),
            rawLabel: true
        },
        {
            label: 'identityLogin',
            value: getDisplayValue(currentUser.identityLogin),
            rawLabel: true
        },
        {
            label: 'identityEmail',
            value: getDisplayValue(currentUser.identityEmail),
            rawLabel: true
        },
        {
            label: 'identityPhone',
            value: getDisplayValue(currentUser.identityPhone),
            rawLabel: true
        },
        {
            label: 'name',
            value: getDisplayValue(currentUser.name),
            rawLabel: true
        },
        {
            label: 'surname',
            value: getDisplayValue(currentUser.surname),
            rawLabel: true
        },
        {
            label: 'email',
            value: getDisplayValue(currentUser.email),
            rawLabel: true
        },
        {
            label: 'uiLanguage',
            value: getDisplayValue(currentUser.uiLanguage),
            rawLabel: true
        },
        {
            label: 'locale',
            value: getDisplayValue(currentUser.locale),
            rawLabel: true
        },
        {
            label: 'serviceLocale',
            value: getDisplayValue(currentUser.serviceLocale),
            rawLabel: true
        },
        {
            label: 'avatarUrl',
            value: getDisplayValue(currentUser.avatarUrl),
            rawLabel: true
        },
        {
            label: 'birthday',
            value: getDisplayValue(currentUser.birthday),
            rawLabel: true
        },
        {
            label: 'roles',
            value: formatRoles(currentUser.roles),
            rawLabel: true
        }
    ];

    renderInfoItems(userInfoContainer, userItems);
    userInfoPanel.hidden = false;
    setOverviewLayoutState(true);
}

export function updateReportHeaderSubtitle(reportState, generatedAtValue = Date.now(), rootElement = document) {
    const subtitleElement = typeof rootElement?.getElementById === 'function'
        ? rootElement.getElementById('reportHeaderSubtitle')
        : rootElement?.querySelector?.('#reportHeaderSubtitle');
    if (!subtitleElement) {
        return;
    }

    subtitleElement.textContent = buildReportHeaderSubtitle(reportState, generatedAtValue);
}

function renderInfoItems(containerElement, infoItems) {
    if (!containerElement) {
        return;
    }

    containerElement.innerHTML = infoItems.map((item) => `
        <div class="info-item">
            <span class="info-key">
                <span
                    class="info-label${item.rawLabel ? ' info-label--raw' : ''}${item.hint ? ' info-label--hint' : ''}"
                    ${item.hint ? `title="${escapeHtml(item.hint)}" aria-label="${escapeHtml(`${item.label}: ${item.hint}`)}"` : ''}
                >${item.label}${item.hint ? '<span class="info-label__hint-marker" aria-hidden="true">?</span>' : ''}</span>
            </span>
            <span class="info-value">${escapeHtml(item.value)}</span>
        </div>
    `).join('');
}

function setOverviewLayoutState(hasUserInfo) {
    const overviewInfoGrid = document.getElementById('overviewInfoGrid');
    if (!overviewInfoGrid) {
        return;
    }

    overviewInfoGrid.classList.toggle('overview-info-grid--single', !hasUserInfo);
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

function stepExpectsRecordingScreenshot(stepItem) {
    return stepItem?.type === 'click' || stepItem?.type === 'submit';
}

function renderRecordingTimelineMarkup(recordingState, annotationIdentifier) {
    const screenshotByStepId = new Map(
        recordingState.screenshots.map((screenshotItem) => [screenshotItem.triggerStepId, screenshotItem])
    );

    return recordingState.steps.map((stepItem, stepIndex) => {
        const linkedScreenshot = screenshotByStepId.get(stepItem.stepId);
        const shouldRenderScreenshotSlot = Boolean(linkedScreenshot) || stepExpectsRecordingScreenshot(stepItem);
        const isFailedStep = recordingState.failedStepId === stepItem.stepId;
        const recordingDatasetAttributes = annotationIdentifier
            ? `data-recording-annotation-id="${annotationIdentifier}" data-recording-step-id="${stepItem.stepId}"`
            : `data-draft-recording-step-id="${stepItem.stepId}"`;
        return `
            <article class="recording-step${isFailedStep ? ' is-failed' : ''}" data-step-type="${escapeHtml(stepItem.type)}">
                <div class="recording-step__header">
                    <span class="recording-step__index">${escapeHtml(getMessage('popupStepLabel', [String(stepIndex + 1)], `Step ${stepIndex + 1}`))}</span>
                    <span class="recording-step__type">${escapeHtml(getRecorderStepTypeLabel(stepItem.type))}</span>
                    <span class="recording-step__time">${formatDateTime(stepItem.timestamp)}</span>
                </div>
                <div class="recording-step__body${shouldRenderScreenshotSlot ? '' : ' recording-step__body--without-shot'}">
                    ${shouldRenderScreenshotSlot ? `<div class="recording-step__shot${linkedScreenshot ? '' : ' recording-step__shot--empty'}">
                        ${linkedScreenshot
                ? `<img src="${linkedScreenshot.imageURL}" class="preview-image" data-preview="${linkedScreenshot.imageURL}" data-preview-kind="recording-step" data-preview-title="${escapeHtml(getRecordingPreviewTitle(stepItem))}" data-preview-target="${escapeHtml(getRecordingPreviewTarget(stepItem))}" ${recordingDatasetAttributes} alt="${escapeHtml(getMessage('reportRecordingScreenshotAlt', [String(stepIndex + 1)], `Recording screenshot for step ${stepIndex + 1}`))}">`
                : `<div class="recording-step__shot-placeholder">${escapeHtml(getMessage('reportRecordingNoScreenshot', undefined, 'No screenshot'))}</div>`}
                    </div>` : ''}
                    <div class="recording-step__content">
                        <p class="recording-step__summary">${escapeHtml(getRecordingStepSummary(stepItem))}</p>
                        ${isFailedStep && recordingState.lastError ? `<p class="recording-step__error">${escapeHtml(recordingState.lastError)}</p>` : ''}
                        ${stepItem.replayHint ? `<p class="recording-step__hint">${escapeHtml(stepItem.replayHint)}</p>` : ''}
                        ${stepItem.url && stepItem.type !== 'navigation' ? `<p class="recording-step__url">${escapeHtml(stepItem.url)}</p>` : ''}
                        ${stepItem.locator ? `<p class="recording-step__locator">${escapeHtml(formatLocator(stepItem.locator))}</p>` : ''}
                        ${stepItem.sourceLocator ? `<p class="recording-step__locator">${escapeHtml(getMessage('reportRecordingSourceLocator', [formatLocator(stepItem.sourceLocator)], `Source: ${formatLocator(stepItem.sourceLocator)}`))}</p>` : ''}
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
    const chartCanvas = document.getElementById('annotationsChart');
    if (!chartCanvas) {
        return;
    }

    // Don't render chart if no annotations
    if (data.every(d => d === 0)) {
        chartCanvas.style.display = 'none';
        return;
    }

    chartCanvas.style.display = '';
    chartCanvas.width = 64;
    chartCanvas.height = 64;
    chartCanvas.style.width = '64px';
    chartCanvas.style.height = '64px';
    const ctx = chartCanvas.getContext('2d');
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
            responsive: false,
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
                <td colspan="4" class="empty-state">
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
        <tr class="annotation-title-row annotation-title-row--${type.toLowerCase()}" data-annotation-type="${escapeHtml(type)}">
            <td colspan="4" class="annotation-title-cell">
                ${annotation.url
                ? `<a class="annotation-title-link" href="${escapeHtml(annotation.url)}" target="_blank" rel="noopener" title="${escapeHtml(annotation.url)}">${escapeHtml(annotation.url)}</a>`
                : `<span class="annotation-title-link annotation-title-link--muted">${escapeHtml(EMPTY_DISPLAY_VALUE)}</span>`}
            </td>
        </tr>
        <tr class="annotation-row annotation-row--${type.toLowerCase()}" data-annotation-type="${escapeHtml(type)}">
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
                : `<span class="text-muted">${escapeHtml(EMPTY_DISPLAY_VALUE)}</span>`}
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
        <tr class="annotation-replay-row" data-annotation-type="${escapeHtml(type)}">
            <td colspan="4" class="annotation-replay-row__cell">
                <details class="annotation-replay-details">
                    <summary class="annotation-replay-details__summary">
                        <span class="annotation-replay-details__heading">
                            <span class="annotation-replay-details__title">${escapeHtml(getMessage('reportAnnotationReplayTitle', undefined, 'Replay'))}</span>
                            <span class="annotation-replay-details__meta">${escapeHtml(replaySummaryText)}</span>
                        </span>
                        <button
                            type="button"
                            class="annotation-replay-copy-btn"
                            data-copy-text="${escapeHtml(encodeURIComponent(buildRecordingCopyText(annotation, recordingState)))}"
                            title="${escapeHtml(getMessage('reportReplayCopyTitle', undefined, 'Copy recorded steps'))}"
                            aria-label="${escapeHtml(getMessage('reportReplayCopyTitle', undefined, 'Copy recorded steps'))}">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <path d="M6 2.5h5.5A1.5 1.5 0 0 1 13 4v7.5A1.5 1.5 0 0 1 11.5 13H6A1.5 1.5 0 0 1 4.5 11.5V4A1.5 1.5 0 0 1 6 2.5Z" stroke="currentColor" stroke-width="1.2"/>
                                <path d="M4.5 5H4A1.5 1.5 0 0 0 2.5 6.5V12A1.5 1.5 0 0 0 4 13.5h5.5A1.5 1.5 0 0 0 11 12v-.5" stroke="currentColor" stroke-width="1.2"/>
                            </svg>
                        </button>
                    </summary>
                    <div class="annotation-replay-details__body">
                        ${renderRecordingTimelineMarkup(recordingState, annotation.id)}
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

function buildReportHeaderSubtitle(reportState, generatedAtValue = Date.now()) {
    const subtitleLabel = getMessage('reportHeaderSubtitle', undefined, 'Session Summary');
    const firstEventTimestamp = getFirstReportEventTimestamp(reportState);
    const generationDateLabel = formatDate(generatedAtValue);
    if (!firstEventTimestamp) {
        return `${subtitleLabel} ${generationDateLabel}`;
    }

    const firstEventDateLabel = formatDate(firstEventTimestamp);
    if (firstEventDateLabel === generationDateLabel) {
        return `${subtitleLabel} ${firstEventDateLabel}`;
    }

    return `${subtitleLabel} ${firstEventDateLabel} - ${generationDateLabel}`;
}

function getFirstReportEventTimestamp(reportState) {
    const annotationTimestamps = reportState?.session?.getAnnotations?.()
        .map((annotationItem) => annotationItem?.getTimeStamp?.()?.getTime?.())
        .filter((timestampValue) => Number.isFinite(timestampValue)) || [];

    if (annotationTimestamps.length > 0) {
        return Math.min(...annotationTimestamps);
    }

    const sessionStartDate = reportState?.session?.getStartDateTime?.();
    const sessionStartTimestamp = sessionStartDate instanceof Date ? sessionStartDate.getTime() : new Date(sessionStartDate).getTime();
    return Number.isFinite(sessionStartTimestamp) ? sessionStartTimestamp : null;
}

function getCurrentUserInfo(browserInfo) {
    const currentUser = browserInfo?.currentUser;
    if (!currentUser || typeof currentUser !== 'object') {
        return null;
    }

    const hasVisibleValue = CURRENT_USER_FIELDS.some((fieldName) => {
        if (fieldName === 'roles') {
            return Array.isArray(currentUser.roles) && currentUser.roles.length > 0;
        }

        return typeof currentUser[fieldName] === 'string' && currentUser[fieldName].trim() !== '';
    });

    return hasVisibleValue ? currentUser : null;
}

function formatBrowserInfo(browserInfo) {
    if (!browserInfo) {
        return EMPTY_DISPLAY_VALUE;
    }

    if (browserInfo.browserDisplayName) {
        return browserInfo.browserDisplayName;
    }

    const browserName = typeof browserInfo.browser === 'string' ? browserInfo.browser : '';
    const browserVersion = typeof browserInfo.browserVersion === 'string' ? browserInfo.browserVersion : '';
    return [browserName, browserVersion].filter(Boolean).join(' ') || EMPTY_DISPLAY_VALUE;
}

function formatRoles(rolesValue) {
    if (!Array.isArray(rolesValue) || rolesValue.length === 0) {
        return EMPTY_DISPLAY_VALUE;
    }

    return rolesValue
        .filter((roleValue) => typeof roleValue === 'string' && roleValue.trim() !== '')
        .join(', ') || EMPTY_DISPLAY_VALUE;
}

function getDisplayValue(rawValue) {
    if (typeof rawValue === 'string') {
        const trimmedValue = rawValue.trim();
        return trimmedValue === '' ? EMPTY_DISPLAY_VALUE : trimmedValue;
    }

    if (rawValue === null || rawValue === undefined) {
        return EMPTY_DISPLAY_VALUE;
    }

    return String(rawValue);
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

function formatPointer(stepItem) {
    if (!stepItem?.pointer) {
        return '';
    }

    const offsetX = typeof stepItem.pointer.offsetX === 'number' ? stepItem.pointer.offsetX : null;
    const offsetY = typeof stepItem.pointer.offsetY === 'number' ? stepItem.pointer.offsetY : null;
    if (offsetX == null || offsetY == null) {
        return '';
    }

    return `${offsetX},${offsetY}`;
}

function formatReplayTarget(stepItem) {
    if (stepItem?.type === 'navigation' && stepItem?.url) {
        return stepItem.url;
    }

    if (stepItem?.tagName === 'CANVAS' && stepItem?.pointer) {
        const pointerLabel = formatPointer(stepItem);
        if (pointerLabel !== '') {
            return `canvas (${pointerLabel})`;
        }
    }

    if (stepItem?.text) {
        return stepItem.text;
    }

    if (stepItem?.locator) {
        return formatLocator(stepItem.locator);
    }

    return '';
}

function getRecordingPreviewTitle(stepItem) {
    return getRecorderStepTypeLabel(stepItem?.type || 'unknown');
}

function getRecordingPreviewTarget(stepItem) {
    const targetLabel = formatReplayTarget(stepItem);
    if (targetLabel !== '') {
        return targetLabel;
    }

    if (typeof stepItem?.value === 'string' && stepItem.value !== '') {
        return stepItem.value;
    }

    return EMPTY_DISPLAY_VALUE;
}

function buildRecordingCopyText(annotation, recordingState) {
    const recordingSteps = Array.isArray(recordingState?.steps) ? recordingState.steps : [];
    const titleText = annotation?.name || getMessage('errorNoTitleAvailable', undefined, 'Untitled page');
    const headerLines = [
        `${getAnnotationTypeLabel(annotation?.type || '')}: ${titleText}`,
        annotation?.url ? annotation.url : '',
        getMessage('reportReplayCopyStepCount', [String(recordingSteps.length)], `Steps: ${recordingSteps.length}`)
    ].filter(Boolean);

    const stepLines = recordingSteps.map((stepItem, stepIndex) => {
        const parts = [
            `${stepIndex + 1}. ${getRecorderStepTypeLabel(stepItem.type)}`,
            formatTime(stepItem.timestamp),
            getRecordingStepSummary(stepItem)
        ];
        const locatorLabel = formatReplayTarget(stepItem);
        if (locatorLabel) {
            parts.push(locatorLabel);
        }
        if (stepItem.replayPolicy === 'manual') {
            parts.push(getMessage('reportReplayCopyManual', undefined, 'manual step'));
        }
        if (stepItem.replayHint) {
            parts.push(stepItem.replayHint);
        }
        return parts.join(' | ');
    });

    return [...headerLines, '', ...stepLines].join('\n');
}

function getRecordingStepSummary(stepItem) {
    if (stepItem.type === 'input' || stepItem.type === 'change') {
        return getMessage('reportRecordingValueChanged', [stepItem.value || ''], `Value changed to "${stepItem.value || ''}"`);
    }

    if (stepItem.type === 'click') {
        if (stepItem.tagName === 'CANVAS' && stepItem.pointer) {
            return getMessage(
                'reportRecordingCanvasClick',
                [formatPointer(stepItem)],
                `Canvas click at ${formatPointer(stepItem)}`
            );
        }
        return stepItem.text
            ? getMessage('reportRecordingTargetText', [stepItem.text], `Target text: ${stepItem.text}`)
            : getMessage('reportRecordingInteraction', undefined, 'Interaction with target element');
    }

    if (stepItem.type === 'doubleClick') {
        return stepItem.text
            ? getMessage('reportRecordingDoubleClick', [stepItem.text], `Double click: ${stepItem.text}`)
            : getMessage('reportRecordingDoubleClickFallback', undefined, 'Double click');
    }

    if (stepItem.type === 'contextMenu') {
        return stepItem.text
            ? getMessage('reportRecordingContextMenu', [stepItem.text], `Context menu: ${stepItem.text}`)
            : getMessage('reportRecordingContextMenuFallback', undefined, 'Context menu');
    }

    if (stepItem.type === 'hoverEnter' || stepItem.type === 'hoverLeave') {
        const hoverTarget = formatReplayTarget(stepItem);
        const fallbackText = stepItem.type === 'hoverEnter' ? 'Hover enter' : 'Hover leave';
        return hoverTarget
            ? getMessage(
                stepItem.type === 'hoverEnter' ? 'reportRecordingHoverEnter' : 'reportRecordingHoverLeave',
                [hoverTarget],
                `${fallbackText}: ${hoverTarget}`
            )
            : getMessage(
                stepItem.type === 'hoverEnter' ? 'reportRecordingHoverEnterFallback' : 'reportRecordingHoverLeaveFallback',
                undefined,
                fallbackText
            );
    }

    if (stepItem.type === 'dragStart') {
        return stepItem.text
            ? getMessage('reportRecordingDragStart', [stepItem.text], `Drag start: ${stepItem.text}`)
            : getMessage('reportRecordingDragStartFallback', undefined, 'Drag start');
    }

    if (stepItem.type === 'drop') {
        return stepItem.text
            ? getMessage('reportRecordingDrop', [stepItem.text], `Drop on: ${stepItem.text}`)
            : getMessage('reportRecordingDropFallback', undefined, 'Drop');
    }

    if (stepItem.type === 'file') {
        return getMessage(
            'reportRecordingFileManual',
            [stepItem.value || EMPTY_DISPLAY_VALUE],
            `File input selected: ${stepItem.value || EMPTY_DISPLAY_VALUE}`
        );
    }

    if (stepItem.type === 'submit') {
        return getMessage('reportRecordingSubmit', undefined, 'Submit form');
    }

    if (stepItem.type === 'navigation') {
        return stepItem.url
            ? getMessage('reportRecordingNavigatedTo', [stepItem.url], `Navigated to ${stepItem.url}`)
            : getMessage('reportRecordingNavigationEvent', undefined, 'Navigation event');
    }

    return stepItem.text || stepItem.value || getMessage('reportRecordingFallbackAction', undefined, 'Recorded action');
}
