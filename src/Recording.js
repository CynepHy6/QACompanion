const VALID_RECORDING_STATUSES = ['idle', 'recording', 'replaying'];

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
        screenshotRef: typeof rawStep.screenshotRef === 'string' ? rawStep.screenshotRef : ''
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
