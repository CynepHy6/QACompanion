import { Session } from './src/Session.js';
import { Bug, Note, normalizeImageEntries } from './src/Annotation.js';
import { buildExtensionStatePayload, ExtensionStateService, hasDraftContent, hasExportableState } from './src/ExtensionStateService.js';
import { createEmptyRecording, normalizeRecording } from './src/Recording.js';
import { ExportSessionCSV } from './src/ExportSessionCSV.js';
import { createBase64DataUrl } from './src/dataUrlEncoding.js';
import { getSystemInfo } from './src/browserInfo.js';
import { getMessage } from './src/i18n.js';

const STORAGE_KEYS = {
    session: 'session',
    draft: 'draft',
    recording: 'recording'
};

const RECORDING_SCREENSHOT_DELAY_MS = 250;
const PLAYBACK_DELAY_MIN_MS = 150;
const PLAYBACK_DELAY_MAX_MS = 2000;

const VALID_ANNOTATION_TYPES = ['Bug', 'Note'];

const ANNOTATION_CONSTRUCTORS = {
    Bug,
    Note
};

let session = new Session();
let draft = createEmptyDraft();
let recording = createEmptyRecording();
let stateReadyPromise = null;
let playbackToken = null;

function createEmptyDraft(type = 'Bug') {
    return {
        type,
        description: '',
        imageEntries: [],
        imageURLs: []
    };
}

function normalizeDraft(rawDraft = {}) {
    const draftType = VALID_ANNOTATION_TYPES.includes(rawDraft.type) ? rawDraft.type : 'Bug';
    const imageEntries = normalizeImageEntries(rawDraft.imageEntries || rawDraft.imageURLs || rawDraft.imageURL || []);
    return {
        type: draftType,
        description: typeof rawDraft.description === 'string' ? rawDraft.description : '',
        imageEntries,
        imageURLs: imageEntries.map((imageEntry) => imageEntry.imageURL)
    };
}

function createAnnotationFromStoredData(annotationData) {
    const AnnotationConstructor = ANNOTATION_CONSTRUCTORS[annotationData.type];
    if (!AnnotationConstructor) {
        return null;
    }

    return new AnnotationConstructor(
        annotationData.name,
        annotationData.url,
        annotationData.timestamp,
        annotationData.imageEntries || annotationData.imageURLs || annotationData.imageURL || [],
        annotationData.id || null
    );
}

async function ensureStateReady() {
    if (!stateReadyPromise) {
        stateReadyPromise = (async () => {
            const storedValues = await chrome.storage.local.get([STORAGE_KEYS.session, STORAGE_KEYS.draft, STORAGE_KEYS.recording]);
            session = reconstructSession(storedValues[STORAGE_KEYS.session]);
            draft = normalizeDraft(storedValues[STORAGE_KEYS.draft]);
            recording = normalizeRecording(storedValues[STORAGE_KEYS.recording]);
        })();
    }

    await stateReadyPromise;
}

function reconstructSession(storedSession) {
    if (!storedSession || !Array.isArray(storedSession.annotations)) {
        return new Session();
    }

    const startDateTime = storedSession.StartDateTime || storedSession.startDateTime || Date.now();
    const browserInfo = storedSession.BrowserInfo || storedSession.browserInfo || getSystemInfo();
    const restoredSession = new Session(startDateTime, browserInfo);

    for (const annotationData of storedSession.annotations) {
        const annotation = createAnnotationFromStoredData(annotationData);
        if (annotation) {
            restoredSession.addAnnotation(annotation);
        }
    }

    return restoredSession;
}

function createRuntimeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createRecordingPayload() {
    return {
        id: recording.id,
        status: recording.status,
        startedAt: recording.startedAt,
        stoppedAt: recording.stoppedAt,
        lastError: recording.lastError,
        activeStepId: recording.activeStepId,
        failedStepId: recording.failedStepId,
        stepCount: recording.steps.length,
        screenshotCount: recording.screenshots.length,
        canPlay: recording.steps.length > 0 && recording.status === 'idle',
        hasRecording: recording.steps.length > 0,
        steps: recording.steps.map((stepItem) => ({ ...stepItem })),
        screenshots: recording.screenshots.map((screenshotItem) => ({ ...screenshotItem }))
    };
}

async function saveRecording() {
    await chrome.storage.local.set({
        [STORAGE_KEYS.recording]: {
            ...recording,
            steps: recording.steps.map((stepItem) => ({ ...stepItem })),
            screenshots: recording.screenshots.map((screenshotItem) => ({ ...screenshotItem }))
        }
    });
}

function clearPlaybackToken() {
    playbackToken = null;
}

function updateRecordingStatus(nextStatus, errorMessage = '') {
    recording.status = nextStatus;
    recording.lastError = errorMessage;
    if (nextStatus !== 'replaying') {
        recording.activeStepId = '';
    }
}

function clearReplayFailureState() {
    recording.failedStepId = '';
}

function shouldCaptureRecordingScreenshot(stepType) {
    return stepType === 'click' || stepType === 'submit' || stepType === 'navigation';
}

async function ensureContentScriptReady(tabId) {
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ['js/content_script.js']
    });
}

async function sendMessageToTab(tabId, message) {
    try {
        return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
        const errorMessage = error?.message || '';
        const shouldRetryWithInjection = errorMessage.includes('Receiving end does not exist') ||
            errorMessage.includes('Could not establish connection');

        if (!shouldRetryWithInjection) {
            throw error;
        }

        await ensureContentScriptReady(tabId);
        return chrome.tabs.sendMessage(tabId, message);
    }
}

async function waitForTabComplete(tabId, expectedUrl = null, timeoutMilliseconds = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMilliseconds) {
        let currentTab = null;
        try {
            currentTab = await chrome.tabs.get(tabId);
        } catch (error) {
            await new Promise((resolve) => setTimeout(resolve, 150));
            continue;
        }

        const urlMatches = expectedUrl == null || currentTab.url === expectedUrl;
        if (currentTab.status === 'complete' && urlMatches) {
            return currentTab;
        }

        await new Promise((resolve) => setTimeout(resolve, 150));
    }

    throw new Error(getMessage('errorNavigationTimeout', undefined, 'Timed out while waiting for the page to finish loading.'));
}

function getNextStepForPlayback(stepIndex) {
    if (stepIndex + 1 >= recording.steps.length) {
        return null;
    }

    return recording.steps[stepIndex + 1];
}

function getBoundedPlaybackDelayMilliseconds(currentStep, nextStep) {
    if (!currentStep || !nextStep) {
        return 0;
    }

    const currentTimestamp = typeof currentStep.timestamp === 'number' ? currentStep.timestamp : NaN;
    const nextTimestamp = typeof nextStep.timestamp === 'number' ? nextStep.timestamp : NaN;
    if (!Number.isFinite(currentTimestamp) || !Number.isFinite(nextTimestamp)) {
        return PLAYBACK_DELAY_MIN_MS;
    }

    const recordedDelayMilliseconds = nextTimestamp - currentTimestamp;
    return Math.min(
        PLAYBACK_DELAY_MAX_MS,
        Math.max(PLAYBACK_DELAY_MIN_MS, recordedDelayMilliseconds)
    );
}

function markRecordingStopped() {
    recording.tabId = null;
    recording.lastKnownUrl = '';
    recording.stoppedAt = Date.now();
    recording.activeStepId = '';
}

async function setActiveReplayStep(stepId) {
    recording.activeStepId = typeof stepId === 'string' ? stepId : '';
    await saveRecording();
}

function createReplayStepError(stepItem, stepIndex, playbackResponse = null) {
    const stepNumber = stepIndex + 1;
    const replayError = new Error(
        getMessage('errorReplayActionFailed', [String(stepNumber)], `Step ${stepNumber} failed: couldn't replay the recorded action.`)
    );
    replayError.failedStepId = stepItem?.stepId || '';

    if (playbackResponse?.reason === 'target-not-found') {
        replayError.message = getMessage(
            'errorReplayTargetNotFound',
            [String(stepNumber)],
            `Step ${stepNumber} failed: target element not found.`
        );
        return replayError;
    }

    if (typeof playbackResponse?.error === 'string' && playbackResponse.error.trim() !== '') {
        replayError.message = `${getMessage('popupStepLabel', [String(stepNumber)], `Step ${stepNumber}`)}: ${playbackResponse.error}`;
    }

    return replayError;
}

function normalizeReplayStepError(stepItem, stepIndex, originalError) {
    if (originalError?.failedStepId && typeof originalError.failedStepId === 'string') {
        return originalError;
    }

    const stepNumber = stepIndex + 1;
    const replayError = new Error(
        getMessage('errorReplayActionFailed', [String(stepNumber)], `Step ${stepNumber} failed: couldn't replay the recorded action.`)
    );
    replayError.failedStepId = stepItem?.stepId || '';

    if (typeof originalError?.message === 'string' && originalError.message.trim() !== '') {
        const stepPrefix = `${getMessage('popupStepLabel', [String(stepNumber)], `Step ${stepNumber}`)}:`;
        replayError.message = originalError.message.startsWith(stepPrefix)
            ? originalError.message
            : `${stepPrefix} ${originalError.message}`;
    }

    return replayError;
}

async function saveDraft() {
    await chrome.storage.local.set({
        [STORAGE_KEYS.draft]: {
            type: draft.type,
            description: draft.description,
            imageEntries: draft.imageEntries.map((imageEntry) => ({ ...imageEntry })),
            imageURLs: [...draft.imageURLs]
        }
    });
}

function removeOldestScreenshotFromSession() {
    for (const annotation of session.getAnnotations()) {
        if (annotation.getImageURLs().length > 0) {
            annotation.removeImageAt(0);
            return true;
        }
    }

    return false;
}

function isQuotaError(error) {
    if (!error) {
        return false;
    }

    if (typeof error.message === 'string' && error.message.includes('QUOTA_BYTES')) {
        return true;
    }

    if (typeof error.name === 'string' && error.name.includes('QUOTA')) {
        return true;
    }

    return false;
}

function showNotification(title, message, timeoutMilliseconds = 5000) {
    const notificationId = `notification-${Date.now()}`;
    chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: 'icons/iconbig.png',
        title,
        message
    });

    setTimeout(() => {
        chrome.notifications.clear(notificationId);
    }, timeoutMilliseconds);
}

function waitForDuration(timeoutMilliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, timeoutMilliseconds);
    });
}

function formatDimensionLabel(widthValue, heightValue) {
    if (!Number.isFinite(widthValue) || !Number.isFinite(heightValue) || widthValue <= 0 || heightValue <= 0) {
        return '';
    }

    return `${widthValue}x${heightValue}`;
}

function formatPlatformOperatingSystem(platformName) {
    const platformLabels = {
        android: 'Android',
        cros: 'ChromeOS',
        linux: 'Linux',
        mac: 'macOS',
        openbsd: 'OpenBSD',
        win: 'Windows'
    };

    return platformLabels[platformName] || '';
}

async function getPageEnvironmentInfo(activeTab) {
    const fallbackPageInfo = {
        pageTitle: typeof activeTab?.title === 'string' ? activeTab.title : '',
        pageUrl: typeof activeTab?.url === 'string' ? activeTab.url : '',
        viewport: formatDimensionLabel(activeTab?.width, activeTab?.height),
        screenResolution: '',
        devicePixelRatio: '',
        pageLanguage: '',
        colorScheme: '',
        reducedMotion: ''
    };

    if (!activeTab || typeof activeTab.id !== 'number' || isRestrictedPage(activeTab.url)) {
        return fallbackPageInfo;
    }

    try {
        const response = await sendMessageToTab(activeTab.id, { type: 'getPageEnvironmentInfo' });
        return {
            pageTitle: typeof response?.pageTitle === 'string' && response.pageTitle !== ''
                ? response.pageTitle
                : fallbackPageInfo.pageTitle,
            pageUrl: typeof response?.pageUrl === 'string' && response.pageUrl !== ''
                ? response.pageUrl
                : fallbackPageInfo.pageUrl,
            viewport: formatDimensionLabel(response?.viewportWidth, response?.viewportHeight) || fallbackPageInfo.viewport,
            screenResolution: formatDimensionLabel(response?.screenWidth, response?.screenHeight),
            devicePixelRatio: Number.isFinite(response?.devicePixelRatio) ? String(response.devicePixelRatio) : '',
            pageLanguage: typeof response?.pageLanguage === 'string' ? response.pageLanguage : '',
            colorScheme: typeof response?.colorScheme === 'string' ? response.colorScheme : '',
            reducedMotion: typeof response?.reducedMotion === 'string' ? response.reducedMotion : ''
        };
    } catch (error) {
        console.log('Background: Environment snapshot fallback used.', error?.message || '');
        return fallbackPageInfo;
    }
}

async function getEnhancedSystemInfo(activeTab = null) {
    const baseSystemInfo = getSystemInfo();
    const pageInfo = await getPageEnvironmentInfo(activeTab);

    let platformInfo = null;
    try {
        if (chrome.runtime?.getPlatformInfo) {
            platformInfo = await chrome.runtime.getPlatformInfo();
        }
    } catch (error) {
        console.log('Background: Platform info unavailable.', error?.message || '');
    }

    const operatingSystemName = formatPlatformOperatingSystem(platformInfo?.os) || baseSystemInfo.os;
    const architectureName = platformInfo?.arch || baseSystemInfo.architecture || '';

    return {
        ...baseSystemInfo,
        os: operatingSystemName,
        architecture: architectureName,
        osDisplay: [operatingSystemName, architectureName].filter(Boolean).join(' '),
        pageTitle: pageInfo.pageTitle,
        pageUrl: pageInfo.pageUrl,
        viewport: pageInfo.viewport,
        screenResolution: pageInfo.screenResolution,
        devicePixelRatio: pageInfo.devicePixelRatio,
        pageLanguage: pageInfo.pageLanguage || baseSystemInfo.language,
        colorScheme: pageInfo.colorScheme,
        reducedMotion: pageInfo.reducedMotion
    };
}

async function saveSession() {
    while (true) {
        try {
            await chrome.storage.local.set({
                [STORAGE_KEYS.session]: session.toSerializableObject()
            });
            return;
        } catch (error) {
            if (!isQuotaError(error)) {
                throw error;
            }

            const removedScreenshot = removeOldestScreenshotFromSession();
            if (!removedScreenshot) {
                showNotification(
                    getMessage('notificationSessionSaveFailedTitle', undefined, 'Session save failed'),
                    getMessage('notificationSessionSaveFailedBody', undefined, 'Storage is full and there are no screenshots left to remove.'),
                    7000
                );
                throw error;
            }

            showNotification(
                getMessage('notificationSessionAdjustedTitle', undefined, 'Session saved with adjustment'),
                getMessage('notificationSessionAdjustedBody', undefined, 'The oldest screenshot was removed so the session could be saved.'),
                7000
            );
        }
    }
}

async function startSession(activeTab = null) {
    if (session.getAnnotations().length > 0) {
        return;
    }

    session = new Session(Date.now(), await getEnhancedSystemInfo(activeTab));
    await saveSession();
}

async function clearSession() {
    session = new Session();
    draft = createEmptyDraft();
    recording = createEmptyRecording();
    await saveSession();
    await saveDraft();
    await saveRecording();
}

async function updateDraftState(nextDraft) {
    draft = normalizeDraft(nextDraft);
    await saveDraft();
    return getDraftPayload();
}

async function appendImagesToDraft(imageURLs) {
    const nextImageEntries = normalizeImageEntries(imageURLs);
    draft.imageEntries.push(...nextImageEntries);
    draft.imageURLs = draft.imageEntries.map((imageEntry) => imageEntry.imageURL);
    await saveDraft();
    return getDraftPayload();
}

async function removeDraftImage(imageIndex) {
    if (imageIndex >= 0 && imageIndex < draft.imageEntries.length) {
        draft.imageEntries.splice(imageIndex, 1);
        draft.imageURLs = draft.imageEntries.map((imageEntry) => imageEntry.imageURL);
        await saveDraft();
    }

    return getDraftPayload();
}

function getDraftPayload() {
    return {
        type: draft.type,
        description: draft.description,
        imageEntries: draft.imageEntries.map((imageEntry) => ({ ...imageEntry })),
        imageURLs: [...draft.imageURLs]
    };
}

function getSessionSummaryPayload() {
    return {
        bugs: session.getBugs().length,
        notes: session.getNotes().length,
        annotationsCount: session.getAnnotations().length,
        draftHasContent: hasDraftContent(draft),
        recordingStepCount: recording.steps.length,
        recordingScreenshotCount: recording.screenshots.length,
        hasExportableState: hasExportableState(session, draft, recording)
    };
}

function getFullSessionPayload() {
    const extensionState = buildExtensionStatePayload(session, draft, recording);
    return {
        ...extensionState,
        recording: {
            ...extensionState.recording,
            lastError: recording.lastError,
            activeStepId: recording.activeStepId,
            failedStepId: recording.failedStepId
        }
    };
}

function formatExportTimestamp(dateValue) {
    const exportDate = new Date(dateValue);
    return exportDate.getFullYear() +
        ('0' + (exportDate.getMonth() + 1)).slice(-2) +
        ('0' + exportDate.getDate()).slice(-2) + '_' +
        ('0' + exportDate.getHours()).slice(-2) +
        ('0' + exportDate.getMinutes()).slice(-2);
}

function createAnnotationFromDraftData(type, description, currentUrl, imageEntries) {
    const AnnotationConstructor = ANNOTATION_CONSTRUCTORS[type];
    if (!AnnotationConstructor) {
        throw new Error(`Unknown annotation type: ${type}`);
    }

    return new AnnotationConstructor(description, currentUrl, Date.now(), imageEntries);
}

async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
}

async function captureRecordingScreenshot(stepId, tabId) {
    try {
        await waitForDuration(RECORDING_SCREENSHOT_DELAY_MS);

        const activeTab = await getActiveTab();
        if (!activeTab || activeTab.id !== tabId) {
            return '';
        }

        const imageURL = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        if (!imageURL) {
            return '';
        }

        const screenshotId = createRuntimeId('recording-shot');
        recording.screenshots.push({
            id: screenshotId,
            imageURL,
            createdAt: Date.now(),
            triggerStepId: stepId
        });

        return screenshotId;
    } catch (error) {
        console.log('Background: Recording screenshot skipped.', error?.message || '');
        return '';
    }
}

async function startRecordingFlow() {
    await ensureStateReady();

    if (recording.status === 'recording') {
        return createRecordingPayload();
    }

    if (recording.status === 'replaying') {
        throw new Error(getMessage('errorReplayAlreadyRunning', undefined, 'Replay is already running.'));
    }

    const activeTab = await getActiveTab();
    if (!activeTab || activeTab.id == null) {
        throw new Error(getMessage('errorNoActiveTabForRecording', undefined, 'No active tab found for recording.'));
    }

    if (isRestrictedPage(activeTab.url)) {
        throw new Error(getMessage('errorRecordingUnavailablePage', undefined, 'Recording is not available on this type of page.'));
    }

    if (session.getAnnotations().length === 0) {
        await startSession(activeTab);
    }

    const nextRecording = createEmptyRecording();
    nextRecording.id = createRuntimeId('recording');
    nextRecording.status = 'recording';
    nextRecording.startedAt = Date.now();
    nextRecording.tabId = activeTab.id;
    nextRecording.lastKnownUrl = activeTab.url || '';
    nextRecording.failedStepId = '';

    recording = nextRecording;

    try {
        await sendMessageToTab(activeTab.id, { type: 'setRecordingMode', isRecording: true });
        await saveRecording();
    } catch (error) {
        recording = createEmptyRecording();
        await saveRecording();
        throw error;
    }

    return createRecordingPayload();
}

async function stopRecordingFlow(options = {}) {
    await ensureStateReady();

    if (recording.status !== 'recording') {
        return createRecordingPayload();
    }

    const currentTabId = recording.tabId;
    const suppressSyntheticNavigationOnStop = Boolean(options.suppressSyntheticNavigationOnStop);
    if (typeof currentTabId === 'number') {
        try {
            await waitForTabComplete(currentTabId);
            const currentTab = await chrome.tabs.get(currentTabId);
            const lastRecordedStep = recording.steps.length > 0
                ? recording.steps[recording.steps.length - 1]
                : null;
            const hasRealUrlChange = Boolean(
                currentTab &&
                currentTab.url &&
                currentTab.url !== recording.lastKnownUrl
            );
            const shouldAppendFinalNavigation = suppressSyntheticNavigationOnStop
                ? hasRealUrlChange
                : Boolean(
                    currentTab &&
                    currentTab.url &&
                    (!lastRecordedStep || lastRecordedStep.url !== currentTab.url || lastRecordedStep.type !== 'navigation')
                );

            if (shouldAppendFinalNavigation) {
                const stepId = createRuntimeId('recording-step');
                recording.steps.push({
                    stepId,
                    type: 'navigation',
                    url: currentTab.url,
                    timestamp: Date.now(),
                    locator: null,
                    value: '',
                    inputType: '',
                    tagName: '',
                    text: '',
                    screenshotRef: await captureRecordingScreenshot(stepId, currentTabId)
                });
                recording.lastKnownUrl = currentTab.url;
            }
        } catch (error) {
            console.log('Background: Failed to capture final navigation step.', error?.message || '');
        }
    }

    updateRecordingStatus('idle');
    markRecordingStopped();
    await saveRecording();

    if (typeof currentTabId === 'number') {
        try {
            await sendMessageToTab(currentTabId, { type: 'setRecordingMode', isRecording: false });
        } catch (error) {
            console.log('Background: Recorder teardown skipped.', error?.message || '');
        }
    }

    return createRecordingPayload();
}

async function clearRecordingData() {
    playbackToken = null;
    recording = createEmptyRecording();
    await saveRecording();
    return createRecordingPayload();
}

async function appendRecordedStep(rawStep, senderTab) {
    await ensureStateReady();

    if (recording.status !== 'recording') {
        return createRecordingPayload();
    }

    if (!senderTab || senderTab.id !== recording.tabId) {
        return createRecordingPayload();
    }

    const stepId = createRuntimeId('recording-step');
    const stepItem = {
        stepId,
        type: typeof rawStep.type === 'string' ? rawStep.type : 'unknown',
        url: typeof rawStep.url === 'string' ? rawStep.url : senderTab.url || recording.lastKnownUrl || '',
        timestamp: Date.now(),
        locator: rawStep.locator || null,
        value: typeof rawStep.value === 'string' ? rawStep.value : '',
        inputType: typeof rawStep.inputType === 'string' ? rawStep.inputType : '',
        tagName: typeof rawStep.tagName === 'string' ? rawStep.tagName : '',
        text: typeof rawStep.text === 'string' ? rawStep.text : '',
        screenshotRef: ''
    };

    const lastRecordedStep = recording.steps.length > 0
        ? recording.steps[recording.steps.length - 1]
        : null;
    const isDuplicateNavigation = stepItem.type === 'navigation' &&
        lastRecordedStep &&
        lastRecordedStep.type === 'navigation' &&
        lastRecordedStep.url === stepItem.url;

    if (isDuplicateNavigation) {
        return createRecordingPayload();
    }

    if (shouldCaptureRecordingScreenshot(stepItem.type)) {
        stepItem.screenshotRef = await captureRecordingScreenshot(stepId, senderTab.id);
    }

    recording.steps.push(stepItem);
    recording.lastKnownUrl = stepItem.url;
    await saveRecording();
    return createRecordingPayload();
}

async function appendNavigationStep(tabId, nextUrl) {
    if (recording.status !== 'recording' || tabId !== recording.tabId) {
        return;
    }

    if (!nextUrl || nextUrl === recording.lastKnownUrl) {
        return;
    }

    const stepId = createRuntimeId('recording-step');
    const stepItem = {
        stepId,
        type: 'navigation',
        url: nextUrl,
        timestamp: Date.now(),
        locator: null,
        value: '',
        inputType: '',
        tagName: '',
        text: '',
        screenshotRef: await captureRecordingScreenshot(stepId, tabId)
    };

    recording.steps.push(stepItem);
    recording.lastKnownUrl = nextUrl;
    await saveRecording();
}

async function playRecordedStepOnTab(tabId, stepItem) {
    return sendMessageToTab(tabId, {
        type: 'playRecordingStep',
        step: stepItem
    });
}

async function playRecordingFlow() {
    await ensureStateReady();

    if (recording.status === 'recording') {
        throw new Error(getMessage('errorStopRecordingBeforeReplay', undefined, 'Stop recording before starting replay.'));
    }

    if (recording.status === 'replaying') {
        throw new Error(getMessage('errorReplayAlreadyRunning', undefined, 'Replay is already running.'));
    }

    if (recording.steps.length === 0) {
        throw new Error(getMessage('errorNoRecordingToReplay', undefined, 'There is no recording to replay.'));
    }

    const activeTab = await getActiveTab();
    if (!activeTab || activeTab.id == null) {
        throw new Error(getMessage('errorNoActiveTabForReplay', undefined, 'No active tab found for replay.'));
    }

    if (isRestrictedPage(activeTab.url)) {
        throw new Error(getMessage('errorReplayUnavailablePage', undefined, 'Replay is not available on this type of page.'));
    }

    const playbackId = createRuntimeId('playback');
    playbackToken = playbackId;
    recording.status = 'replaying';
    recording.lastError = '';
    clearReplayFailureState();
    recording.tabId = activeTab.id;
    await saveRecording();

    try {
        const firstStep = recording.steps[0];
        if (firstStep && firstStep.url && activeTab.url !== firstStep.url) {
            await chrome.tabs.update(activeTab.id, { url: firstStep.url });
            await waitForTabComplete(activeTab.id, firstStep.url);
            await ensureContentScriptReady(activeTab.id);
        }

        for (let stepIndex = 0; stepIndex < recording.steps.length; stepIndex += 1) {
            if (playbackToken !== playbackId) {
                throw new Error(getMessage('errorReplayCancelled', undefined, 'Replay cancelled.'));
            }

            const stepItem = recording.steps[stepIndex];
            await setActiveReplayStep(stepItem.stepId);
            try {
                if (stepItem.type === 'navigation') {
                    const currentTab = await chrome.tabs.get(activeTab.id);
                    if (currentTab.url !== stepItem.url) {
                        await chrome.tabs.update(activeTab.id, { url: stepItem.url });
                    }

                    await waitForTabComplete(activeTab.id, stepItem.url);
                    await ensureContentScriptReady(activeTab.id);
                } else {
                    await waitForTabComplete(activeTab.id);
                    const playbackResponse = await playRecordedStepOnTab(activeTab.id, stepItem);
                    if (!playbackResponse || playbackResponse.success !== true) {
                        throw createReplayStepError(stepItem, stepIndex, playbackResponse);
                    }
                }
            } catch (error) {
                throw normalizeReplayStepError(stepItem, stepIndex, error);
            }

            const nextStep = getNextStepForPlayback(stepIndex);
            if (nextStep) {
                await waitForDuration(getBoundedPlaybackDelayMilliseconds(stepItem, nextStep));
            }
        }

        updateRecordingStatus('idle');
        markRecordingStopped();
        clearReplayFailureState();
        await saveRecording();
        clearPlaybackToken();
        return createRecordingPayload();
    } catch (error) {
        recording.failedStepId = typeof error?.failedStepId === 'string' ? error.failedStepId : '';
        updateRecordingStatus('idle', error.message || getMessage('errorReplayActionFailed', ['?'], 'Replay failed.'));
        markRecordingStopped();
        await saveRecording();
        clearPlaybackToken();
        throw error;
    }
}

async function cancelPlayback() {
    playbackToken = null;
    if (recording.status === 'replaying') {
        clearReplayFailureState();
        updateRecordingStatus('idle', getMessage('errorReplayCancelled', undefined, 'Replay cancelled.'));
        markRecordingStopped();
        await saveRecording();
    }

    return createRecordingPayload();
}

function isRecorderActiveForSender(senderTab) {
    return recording.status === 'recording' &&
        senderTab &&
        typeof senderTab.id === 'number' &&
        senderTab.id === recording.tabId;
}

async function syncRecordingNavigationFromActiveTab() {
    if (recording.status !== 'recording') {
        return createRecordingPayload();
    }

    const activeTab = await getActiveTab();
    if (!activeTab || activeTab.id !== recording.tabId || !activeTab.url) {
        return createRecordingPayload();
    }

    const lastRecordedStep = recording.steps.length > 0
        ? recording.steps[recording.steps.length - 1]
        : null;
    const shouldAppendNavigation = !lastRecordedStep ||
        lastRecordedStep.url !== activeTab.url ||
        lastRecordedStep.type !== 'navigation';

    if (!shouldAppendNavigation) {
        return createRecordingPayload();
    }

    const stepId = createRuntimeId('recording-step');
    recording.steps.push({
        stepId,
        type: 'navigation',
        url: activeTab.url,
        timestamp: Date.now(),
        locator: null,
        value: '',
        inputType: '',
        tagName: '',
        text: '',
        screenshotRef: await captureRecordingScreenshot(stepId, activeTab.id)
    });
    recording.lastKnownUrl = activeTab.url;
    await saveRecording();
    return createRecordingPayload();
}

async function createAnnotationFromDraft() {
    await ensureStateReady();

    const description = draft.description.trim();
    if (!description) {
        throw new Error(getMessage('errorDescriptionRequired', undefined, 'Add a description before saving the step.'));
    }

    const activeTab = await getActiveTab();

    if (session.getAnnotations().length === 0) {
        await startSession(activeTab);
    }
    const currentUrl = activeTab && activeTab.url ? activeTab.url : 'N/A';
    const annotation = createAnnotationFromDraftData(
        draft.type,
        description,
        currentUrl,
        draft.imageEntries
    );

    session.addAnnotation(annotation);
    await saveSession();

    const savedType = draft.type;
    const savedDescription = draft.description;
    draft = createEmptyDraft(savedType);
    await saveDraft();

    showNotification(
        getMessage('notificationActionSavedTitle', undefined, 'Step saved'),
        getMessage('notificationActionSavedBody', [savedDescription], `"${savedDescription}" was saved successfully.`)
    );

    return {
        annotation: annotation.toSerializableObject(),
        draft: getDraftPayload(),
        summary: getSessionSummaryPayload()
    };
}

async function updateAnnotationName(annotationId, newName) {
    await ensureStateReady();

    const trimmedName = typeof newName === 'string' ? newName.trim() : '';
    if (!trimmedName) {
        throw new Error(getMessage('errorDescriptionCannotBeEmpty', undefined, 'Description cannot be empty.'));
    }

    const updated = session.updateAnnotationName(annotationId, trimmedName);
    if (!updated) {
        throw new Error(getMessage('errorAnnotationNotFound', undefined, 'Annotation not found.'));
    }

    await saveSession();
}

async function appendAnnotationImages(annotationId, imageURLs) {
    await ensureStateReady();

    const updated = session.appendAnnotationImages(annotationId, imageURLs);
    if (!updated) {
        throw new Error(getMessage('errorAnnotationNotFound', undefined, 'Annotation not found.'));
    }

    await saveSession();
}

async function deleteAnnotationImage(annotationId, imageIndex) {
    await ensureStateReady();

    const updated = session.removeAnnotationImage(annotationId, imageIndex);
    if (!updated) {
        throw new Error(getMessage('errorAnnotationImageNotFound', undefined, 'Annotation screenshot not found.'));
    }

    await saveSession();
}

async function deleteAnnotation(annotationId) {
    await ensureStateReady();

    const deleted = session.deleteAnnotation(annotationId);
    if (!deleted) {
        throw new Error(getMessage('errorAnnotationNotFound', undefined, 'Annotation not found.'));
    }

    await saveSession();
}

async function exportSessionCSV() {
    await ensureStateReady();

    if (session.getAnnotations().length === 0) {
        return false;
    }

    const exportService = new ExportSessionCSV(session);
    const csvData = exportService.getCSVData();
    const browserInfo = session.getBrowserInfo();
    const browserInfoString = `${browserInfo.browser}_${browserInfo.browserVersion}`;
    const fileName = `ExploratorySession_${browserInfoString}_${formatExportTimestamp(session.StartDateTime)}.csv`;
    const dataUrl = createBase64DataUrl('text/csv', csvData);

    await chrome.downloads.download({
        url: dataUrl,
        filename: fileName,
        saveAs: true
    });

    return true;
}

async function exportSessionJSON() {
    await ensureStateReady();

    if (!hasExportableState(session, draft, recording)) {
        return false;
    }

    const extensionStateService = new ExtensionStateService();
    const jsonData = extensionStateService.getJSON(session, draft, recording);
    const browserInfo = session.getBrowserInfo();
    const browserInfoString = `${browserInfo.browser}_${browserInfo.browserVersion}`;
    const fileName = `ExploratorySession_${browserInfoString}_${formatExportTimestamp(session.StartDateTime)}.json`;
    const dataUrl = createBase64DataUrl('application/json', jsonData);

    await chrome.downloads.download({
        url: dataUrl,
        filename: fileName,
        saveAs: true
    });

    return true;
}

function getImportChunkStorageKey(importId, chunkIndex) {
    return `importChunk:${importId}:${chunkIndex}`;
}

async function handleImportStoredChunks(request) {
    const { importId, totalChunks } = request;
    const storageKeys = [];
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        storageKeys.push(getImportChunkStorageKey(importId, chunkIndex));
    }

    try {
        const chunkMap = await chrome.storage.local.get(storageKeys);
        const collectedChunks = [];

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const storageKey = getImportChunkStorageKey(importId, chunkIndex);
            const chunkValue = chunkMap[storageKey];
            if (typeof chunkValue !== 'string') {
                return { status: 'nothing to import' };
            }

            collectedChunks.push(chunkValue);
        }

        const fullJsonData = collectedChunks.join('');

        const success = await processImportedJSON(fullJsonData);
        return { status: success ? 'ok' : 'nothing to import' };
    } finally {
        await chrome.storage.local.remove(storageKeys);
    }
}

async function processImportedJSON(sessionJsonData) {
    await ensureStateReady();

    let importedState = null;
    try {
        const extensionStateService = new ExtensionStateService();
        importedState = extensionStateService.getState(sessionJsonData);
    } catch (error) {
        throw error;
    }

    if (!importedState) {
        return false;
    }

    session = importedState.session;
    draft = importedState.draft;
    recording = importedState.recording;
    try {
        await saveSession();
        await saveDraft();
        await saveRecording();
    } catch (error) {
        throw error;
    }
    return true;
}

function isRestrictedPage(url) {
    if (typeof url !== 'string') {
        return true;
    }

    return url.startsWith('chrome://') ||
        url.startsWith('edge://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('about:');
}

async function initiateCropSelection() {
    await ensureStateReady();

    const activeTab = await getActiveTab();
    if (!activeTab || activeTab.id == null) {
        throw new Error(getMessage('errorNoActiveTabForCrop', undefined, 'No active tab found for crop selection.'));
    }

    if (isRestrictedPage(activeTab.url)) {
        showNotification(
            getMessage('notificationSelectionUnavailableTitle', undefined, 'Selection unavailable'),
            getMessage('notificationSelectionUnavailableBody', undefined, 'Screen selection can\'t be used on this kind of page. Try a regular website instead.')
        );
        return;
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['js/content_script.js']
        });
    } catch (error) {
        console.log('Background: Content script already available or injection not required.', error?.message || '');
    }

    await chrome.tabs.sendMessage(activeTab.id, { type: 'startSelection' });
}

async function handleCropScreenshotRequest(request) {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    if (!dataUrl) {
        throw new Error(getMessage('errorCaptureScreenshotFailed', undefined, 'Failed to capture screenshot.'));
    }

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(
        request.coordinates.width,
        request.coordinates.height
    );
    const canvasContext = canvas.getContext('2d');

    canvasContext.drawImage(
        bitmap,
        request.coordinates.x,
        request.coordinates.y,
        request.coordinates.width,
        request.coordinates.height,
        0,
        0,
        request.coordinates.width,
        request.coordinates.height
    );

    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    const croppedDataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(croppedBlob);
    });

    return croppedDataUrl;
}

async function handleProcessAnnotatedCrop(request) {
    await ensureStateReady();
    await appendImagesToDraft(request.annotatedImageData);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const runAsync = async () => {
        await ensureStateReady();

        switch (request.type) {
            case 'getRecordingState':
                return { status: 'ok', recording: createRecordingPayload() };
            case 'getRecorderModeForSender':
                return {
                    status: 'ok',
                    isRecording: isRecorderActiveForSender(sender.tab || null),
                    lastKnownUrl: recording.lastKnownUrl,
                    recordingId: recording.id
                };
            case 'startRecordingFlow':
                return { status: 'ok', recording: await startRecordingFlow() };
            case 'syncRecordingNavigation':
                return { status: 'ok', recording: await syncRecordingNavigationFromActiveTab() };
            case 'stopRecordingFlow':
                return { status: 'ok', recording: await stopRecordingFlow(request.options || {}) };
            case 'clearRecordingData':
                return { status: 'ok', recording: await clearRecordingData() };
            case 'appendRecordedStep':
                return { status: 'ok', recording: await appendRecordedStep(request.step || {}, sender.tab || null) };
            case 'playRecordingFlow':
                return { status: 'ok', recording: await playRecordingFlow() };
            case 'cancelPlayback':
                return { status: 'ok', recording: await cancelPlayback() };
            case 'getDraft':
                return { status: 'ok', draft: getDraftPayload() };
            case 'updateDraft':
                return { status: 'ok', draft: await updateDraftState(request.draft) };
            case 'clearDraft':
                draft = createEmptyDraft(request.typeName || draft.type || 'Bug');
                await saveDraft();
                return { status: 'ok', draft: getDraftPayload() };
            case 'removeDraftImage':
                return { status: 'ok', draft: await removeDraftImage(request.imageIndex) };
            case 'addDraftScreenshot':
                return { status: 'ok', draft: await appendImagesToDraft(await chrome.tabs.captureVisibleTab(null, { format: 'png' })) };
            case 'initiateCropSelection':
                if (request.draft) {
                    await updateDraftState(request.draft);
                }
                await initiateCropSelection();
                return { status: 'ok' };
            case 'requestCropScreenshot':
                return { croppedImageData: await handleCropScreenshotRequest(request) };
            case 'csToBgCropData':
                await handleProcessAnnotatedCrop(request);
                return { status: 'ok', draft: getDraftPayload() };
            case 'selectionCancelled':
                return { status: 'ok' };
            case 'createAnnotationFromDraft':
                return { status: 'ok', ...(await createAnnotationFromDraft()) };
            case 'updateAnnotationName':
                await updateAnnotationName(request.annotationId || request.annotationID, request.newName);
                return { status: 'ok' };
            case 'appendAnnotationImages':
                await appendAnnotationImages(request.annotationId, request.imageURLs || request.imageURL || []);
                return { status: 'ok' };
            case 'deleteAnnotationImage':
                await deleteAnnotationImage(request.annotationId, request.imageIndex);
                return { status: 'ok' };
            case 'deleteAnnotation':
                await deleteAnnotation(request.annotationId || request.annotationID);
                return { status: 'ok' };
            case 'exportSessionCSV':
                return { status: await exportSessionCSV() ? 'ok' : 'nothing to export' };
            case 'exportSessionJSon':
                return { status: await exportSessionJSON() ? 'ok' : 'nothing to export' };
            case 'importSessionJSonStoredChunks':
                return await handleImportStoredChunks(request);
            case 'clearSession':
                await clearSession();
                return { status: 'ok' };
            case 'getSessionData':
                return getSessionSummaryPayload();
            case 'getFullSession':
                return getFullSessionPayload();
            default:
                return { status: 'unknown message' };
        }
    };

    runAsync()
        .then((response) => sendResponse(response))
        .catch((error) => {
            console.error('Background request failed:', request.type, error);
            sendResponse({
                status: 'error',
                error: error.message || getMessage('errorUnknown', undefined, 'Unknown error')
            });
        });

    return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') {
        return;
    }

    ensureStateReady()
        .then(async () => {
            if (recording.tabId !== tabId) {
                return;
            }

            if (recording.status === 'recording') {
                await appendNavigationStep(tabId, tab.url || '');
                try {
                    await sendMessageToTab(tabId, { type: 'setRecordingMode', isRecording: true });
                } catch (error) {
                    console.log('Background: Recorder sync skipped.', error?.message || '');
                }
            }

            if (recording.status === 'replaying') {
                try {
                    await ensureContentScriptReady(tabId);
                } catch (error) {
                    console.log('Background: Replay sync skipped.', error?.message || '');
                }
            }
        })
        .catch((error) => {
            console.error('Background tab update failed:', error);
        });
});

ensureStateReady();