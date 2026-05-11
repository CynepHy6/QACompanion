const VALID_RECORDING_STATUSES = ['idle', 'recording', 'replaying'];
export const DRAFT_RECORDING_TARGET_KIND = 'draft';
export const ANNOTATION_RECORDING_TARGET_KIND = 'annotation';

function normalizeTimestamp(timestampValue) {
    if (typeof timestampValue === 'number' && Number.isFinite(timestampValue)) {
        return timestampValue;
    }

    if (typeof timestampValue === 'string' && timestampValue !== '') {
        const parsedTimestamp = new Date(timestampValue).getTime();
        if (!Number.isNaN(parsedTimestamp)) {
            return parsedTimestamp;
        }
    }

    return null;
}

function normalizeLocator(rawLocator = {}) {
    if (!rawLocator || typeof rawLocator !== 'object') {
        return null;
    }

    const strategy = typeof rawLocator.strategy === 'string' ? rawLocator.strategy : '';
    const value = typeof rawLocator.value === 'string' ? rawLocator.value : '';
    if (strategy === '' || value === '') {
        return null;
    }

    const normalizedLocator = {
        strategy,
        value
    };

    if (typeof rawLocator.name === 'string' && rawLocator.name !== '') {
        normalizedLocator.name = rawLocator.name;
    }

    return normalizedLocator;
}

function normalizePointer(rawPointer = {}) {
    if (!rawPointer || typeof rawPointer !== 'object') {
        return null;
    }

    const normalizedPointer = {};
    const pointerFields = ['clientX', 'clientY', 'offsetX', 'offsetY', 'button'];
    pointerFields.forEach((fieldName) => {
        if (typeof rawPointer[fieldName] === 'number' && Number.isFinite(rawPointer[fieldName])) {
            normalizedPointer[fieldName] = rawPointer[fieldName];
        }
    });

    return Object.keys(normalizedPointer).length > 0 ? normalizedPointer : null;
}

function normalizeShadowPath(rawShadowPath = []) {
    if (!Array.isArray(rawShadowPath)) {
        return [];
    }

    return rawShadowPath
        .map((locatorItem) => normalizeLocator(locatorItem))
        .filter((locatorItem) => locatorItem !== null);
}

function normalizeRecordingStep(rawStep = {}) {
    return {
        stepId: typeof rawStep.stepId === 'string' ? rawStep.stepId : '',
        type: typeof rawStep.type === 'string' ? rawStep.type : 'unknown',
        url: typeof rawStep.url === 'string' ? rawStep.url : '',
        timestamp: normalizeTimestamp(rawStep.timestamp) || Date.now(),
        locator: normalizeLocator(rawStep.locator),
        value: typeof rawStep.value === 'string' ? rawStep.value : '',
        inputType: typeof rawStep.inputType === 'string' ? rawStep.inputType : '',
        tagName: typeof rawStep.tagName === 'string' ? rawStep.tagName : '',
        text: typeof rawStep.text === 'string' ? rawStep.text : '',
        screenshotRef: typeof rawStep.screenshotRef === 'string' ? rawStep.screenshotRef : '',
        pointer: normalizePointer(rawStep.pointer),
        shadowPath: normalizeShadowPath(rawStep.shadowPath),
        sourceLocator: normalizeLocator(rawStep.sourceLocator),
        sourceShadowPath: normalizeShadowPath(rawStep.sourceShadowPath),
        replayPolicy: typeof rawStep.replayPolicy === 'string' ? rawStep.replayPolicy : 'auto',
        replayHint: typeof rawStep.replayHint === 'string' ? rawStep.replayHint : ''
    };
}

function normalizeRecordingScreenshot(rawScreenshot = {}) {
    return {
        id: typeof rawScreenshot.id === 'string' ? rawScreenshot.id : '',
        imageURL: typeof rawScreenshot.imageURL === 'string' ? rawScreenshot.imageURL : '',
        createdAt: normalizeTimestamp(rawScreenshot.createdAt) || Date.now(),
        triggerStepId: typeof rawScreenshot.triggerStepId === 'string' ? rawScreenshot.triggerStepId : ''
    };
}

export function createEmptyRecording() {
    return {
        id: null,
        status: 'idle',
        startedAt: null,
        stoppedAt: null,
        tabId: null,
        lastKnownUrl: '',
        lastError: '',
        activeStepId: '',
        failedStepId: '',
        steps: [],
        screenshots: []
    };
}

export function createDraftRecordingTarget() {
    return {
        kind: DRAFT_RECORDING_TARGET_KIND,
        annotationId: ''
    };
}

export function createAnnotationRecordingTarget(annotationId = '') {
    return {
        kind: ANNOTATION_RECORDING_TARGET_KIND,
        annotationId: typeof annotationId === 'string' ? annotationId : ''
    };
}

export function normalizeRecordingTarget(rawTarget = {}) {
    if (rawTarget?.kind === ANNOTATION_RECORDING_TARGET_KIND && typeof rawTarget.annotationId === 'string' && rawTarget.annotationId !== '') {
        return createAnnotationRecordingTarget(rawTarget.annotationId);
    }

    return createDraftRecordingTarget();
}

export function isAnnotationRecordingTarget(recordingTarget = {}) {
    return normalizeRecordingTarget(recordingTarget).kind === ANNOTATION_RECORDING_TARGET_KIND;
}

export function serializeRecording(recordingState = {}) {
    const normalizedRecording = normalizeRecording(recordingState);

    return {
        ...normalizedRecording,
        steps: normalizedRecording.steps.map((stepItem) => ({ ...stepItem })),
        screenshots: normalizedRecording.screenshots.map((screenshotItem) => ({ ...screenshotItem }))
    };
}

export function sanitizeRecording(recordingState = {}) {
    const normalizedRecording = normalizeRecording(recordingState);

    return {
        ...serializeRecording(normalizedRecording),
        status: 'idle',
        tabId: null,
        activeStepId: '',
        failedStepId: '',
        lastError: ''
    };
}

export function createRecordingSummary(recordingState = {}) {
    const normalizedRecording = normalizeRecording(recordingState);

    return {
        id: normalizedRecording.id,
        status: normalizedRecording.status,
        startedAt: normalizedRecording.startedAt,
        stoppedAt: normalizedRecording.stoppedAt,
        lastError: normalizedRecording.lastError,
        activeStepId: normalizedRecording.activeStepId,
        failedStepId: normalizedRecording.failedStepId,
        stepCount: normalizedRecording.steps.length,
        screenshotCount: normalizedRecording.screenshots.length,
        canPlay: normalizedRecording.steps.length > 0 && normalizedRecording.status === 'idle',
        hasRecording: normalizedRecording.steps.length > 0,
        steps: normalizedRecording.steps.map((stepItem) => ({ ...stepItem })),
        screenshots: normalizedRecording.screenshots.map((screenshotItem) => ({ ...screenshotItem }))
    };
}

export function normalizeRecordingMap(rawRecordingMap = {}) {
    if (!rawRecordingMap || typeof rawRecordingMap !== 'object') {
        return {};
    }

    return Object.fromEntries(
        Object.entries(rawRecordingMap)
            .filter(([annotationId]) => typeof annotationId === 'string' && annotationId !== '')
            .map(([annotationId, recordingState]) => [annotationId, normalizeRecording(recordingState)])
    );
}

export function normalizeRecording(rawRecording = {}) {
    const emptyRecording = createEmptyRecording();
    const recordingStatus = VALID_RECORDING_STATUSES.includes(rawRecording.status)
        ? rawRecording.status
        : emptyRecording.status;

    return {
        id: typeof rawRecording.id === 'string' ? rawRecording.id : emptyRecording.id,
        status: recordingStatus,
        startedAt: normalizeTimestamp(rawRecording.startedAt),
        stoppedAt: normalizeTimestamp(rawRecording.stoppedAt),
        tabId: typeof rawRecording.tabId === 'number' ? rawRecording.tabId : null,
        lastKnownUrl: typeof rawRecording.lastKnownUrl === 'string' ? rawRecording.lastKnownUrl : '',
        lastError: typeof rawRecording.lastError === 'string' ? rawRecording.lastError : '',
        activeStepId: typeof rawRecording.activeStepId === 'string' ? rawRecording.activeStepId : '',
        failedStepId: typeof rawRecording.failedStepId === 'string' ? rawRecording.failedStepId : '',
        steps: Array.isArray(rawRecording.steps)
            ? rawRecording.steps.map((stepItem) => normalizeRecordingStep(stepItem)).filter((stepItem) => stepItem.stepId !== '')
            : [],
        screenshots: Array.isArray(rawRecording.screenshots)
            ? rawRecording.screenshots
                .map((screenshotItem) => normalizeRecordingScreenshot(screenshotItem))
                .filter((screenshotItem) => screenshotItem.id !== '' && screenshotItem.imageURL !== '')
            : []
    };
}
