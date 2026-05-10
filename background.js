import { Session } from './src/Session.js';
import { Bug, Note, normalizeImageEntries } from './src/Annotation.js';
import { buildExtensionStatePayload, ExtensionStateService, hasDraftContent, hasExportableState } from './src/ExtensionStateService.js';
import {
    ANNOTATION_RECORDING_TARGET_KIND,
    createAnnotationRecordingTarget,
    createDraftRecordingTarget,
    createEmptyRecording,
    createRecordingSummary,
    isAnnotationRecordingTarget,
    normalizeRecording,
    normalizeRecordingMap,
    normalizeRecordingTarget,
    serializeRecording
} from './src/Recording.js';
import { createBase64DataUrl } from './src/dataUrlEncoding.js';
import { getSystemInfo } from './src/browserInfo.js';
import { getMessage } from './src/i18n.js';

const STORAGE_KEYS = {
    session: 'session',
    draft: 'draft',
    recording: 'recording'
};

const RECORDING_SCREENSHOT_DELAY_MS = 250;
const RECORDING_SCREENSHOT_MAX_WIDTH = 1080;
const STORED_SCREENSHOT_MIME_TYPE = 'image/webp';
const STORED_SCREENSHOT_QUALITY = 0.82;
const PLAYBACK_DELAY_MIN_MS = 150;
const PLAYBACK_DELAY_MAX_MS = 2000;

const VALID_ANNOTATION_TYPES = ['Bug', 'Note'];

const ANNOTATION_CONSTRUCTORS = {
    Bug,
    Note
};

let session = new Session();
let draft = createEmptyDraft();
let draftRecording = createEmptyRecording();
let annotationRecordingsById = {};
let selectedRecordingTarget = createDraftRecordingTarget();
let activeRecordingTarget = createDraftRecordingTarget();
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
            hydrateRecordingStore(storedValues[STORAGE_KEYS.recording]);
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

function hydrateRecordingStore(rawRecordingStore = {}) {
    if (rawRecordingStore && typeof rawRecordingStore === 'object' && Array.isArray(rawRecordingStore.steps)) {
        draftRecording = normalizeRecording(rawRecordingStore);
        annotationRecordingsById = {};
        selectedRecordingTarget = createDraftRecordingTarget();
        activeRecordingTarget = createDraftRecordingTarget();
        return;
    }

    draftRecording = normalizeRecording(rawRecordingStore?.draftRecording || {});
    annotationRecordingsById = normalizeRecordingMap(rawRecordingStore?.annotationRecordingsById || {});
    selectedRecordingTarget = normalizeRecordingTarget(rawRecordingStore?.selectedRecordingTarget || createDraftRecordingTarget());
    activeRecordingTarget = normalizeRecordingTarget(rawRecordingStore?.activeRecordingTarget || selectedRecordingTarget);
    selectedRecordingTarget = resolveRecordingTarget(selectedRecordingTarget);
    activeRecordingTarget = resolveRecordingTarget(activeRecordingTarget);
}

function cloneRecordingMap(recordingMap = {}) {
    return Object.fromEntries(
        Object.entries(recordingMap).map(([annotationId, recordingState]) => [annotationId, serializeRecording(recordingState)])
    );
}

function saveableRecordingStore() {
    return {
        draftRecording: serializeRecording(draftRecording),
        annotationRecordingsById: cloneRecordingMap(annotationRecordingsById),
        selectedRecordingTarget: { ...selectedRecordingTarget },
        activeRecordingTarget: { ...activeRecordingTarget }
    };
}

function resolveRecordingTarget(rawTarget = null) {
    const normalizedTarget = normalizeRecordingTarget(rawTarget || selectedRecordingTarget);
    if (!isAnnotationRecordingTarget(normalizedTarget)) {
        return createDraftRecordingTarget();
    }

    if (!session.getAnnotationById(normalizedTarget.annotationId)) {
        return createDraftRecordingTarget();
    }

    return normalizedTarget;
}

function setSelectedRecordingTarget(nextTarget) {
    selectedRecordingTarget = resolveRecordingTarget(nextTarget);
}

function setActiveRecordingTarget(nextTarget) {
    activeRecordingTarget = resolveRecordingTarget(nextTarget);
}

function getRecordingStateForTarget(recordingTarget = null) {
    const resolvedTarget = resolveRecordingTarget(recordingTarget);
    if (!isAnnotationRecordingTarget(resolvedTarget)) {
        return draftRecording;
    }

    if (!annotationRecordingsById[resolvedTarget.annotationId]) {
        annotationRecordingsById[resolvedTarget.annotationId] = createEmptyRecording();
    }

    return annotationRecordingsById[resolvedTarget.annotationId];
}

function setRecordingStateForTarget(recordingTarget, nextRecordingState) {
    const resolvedTarget = resolveRecordingTarget(recordingTarget);
    const normalizedRecordingState = normalizeRecording(nextRecordingState);
    if (!isAnnotationRecordingTarget(resolvedTarget)) {
        draftRecording = normalizedRecordingState;
        return;
    }

    annotationRecordingsById[resolvedTarget.annotationId] = normalizedRecordingState;
}

function deleteRecordingStateForTarget(recordingTarget) {
    const resolvedTarget = resolveRecordingTarget(recordingTarget);
    if (!isAnnotationRecordingTarget(resolvedTarget)) {
        draftRecording = createEmptyRecording();
        return;
    }

    delete annotationRecordingsById[resolvedTarget.annotationId];
}

function createRecordingPayload(recordingTarget = null) {
    return createRecordingSummary(getRecordingStateForTarget(recordingTarget));
}

function createRecordingSummariesByAnnotationId() {
    return Object.fromEntries(
        session.getAnnotations().map((annotation) => {
            const annotationId = annotation.getId();
            return [annotationId, createRecordingPayload(createAnnotationRecordingTarget(annotationId))];
        })
    );
}

function createAnnotationSummaryPayload(annotation) {
    const annotationId = annotation.getId();
    const recordingSummary = createRecordingPayload(createAnnotationRecordingTarget(annotationId));
    const imageEntries = annotation.getImageEntries();
    return {
        id: annotationId,
        type: annotation.getType(),
        name: annotation.getName(),
        url: annotation.getURL(),
        timestamp: annotation.getTimeStamp().getTime(),
        imageCount: imageEntries.length,
        imageEntries,
        recording: {
            stepCount: recordingSummary.stepCount,
            screenshotCount: recordingSummary.screenshotCount,
            hasRecording: recordingSummary.hasRecording,
            status: recordingSummary.status
        }
    };
}

function createPopupStatePayload() {
    return {
        draft: getDraftPayload(),
        draftRecording: createRecordingPayload(createDraftRecordingTarget()),
        selectedRecordingTarget: { ...selectedRecordingTarget },
        selectedRecording: createRecordingPayload(selectedRecordingTarget),
        activeRecordingTarget: { ...activeRecordingTarget },
        annotations: session.getAnnotations()
            .slice()
            .sort((leftAnnotation, rightAnnotation) => rightAnnotation.getTimeStamp().getTime() - leftAnnotation.getTimeStamp().getTime())
            .map((annotation) => createAnnotationSummaryPayload(annotation)),
        summary: getSessionSummaryPayload()
    };
}

async function saveRecording() {
    await chrome.storage.local.set({
        [STORAGE_KEYS.recording]: saveableRecordingStore()
    });
}

function clearPlaybackToken() {
    playbackToken = null;
}

function updateRecordingStatus(recordingState, nextStatus, errorMessage = '') {
    recordingState.status = nextStatus;
    recordingState.lastError = errorMessage;
    if (nextStatus !== 'replaying') {
        recordingState.activeStepId = '';
    }
}

function clearReplayFailureState(recordingState) {
    recordingState.failedStepId = '';
}

function shouldCaptureRecordingScreenshot(stepType) {
    return stepType === 'click' || stepType === 'submit' || stepType === 'navigation';
}

function getActiveRecordingState() {
    return getRecordingStateForTarget(activeRecordingTarget);
}

function getSelectedRecordingState() {
    return getRecordingStateForTarget(selectedRecordingTarget);
}

function getRecordingTargetLabel(recordingTarget) {
    const resolvedTarget = resolveRecordingTarget(recordingTarget);
    if (!isAnnotationRecordingTarget(resolvedTarget)) {
        return 'draft';
    }

    return resolvedTarget.annotationId;
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
    const recordingState = getRecordingStateForTarget(activeRecordingTarget);
    if (stepIndex + 1 >= recordingState.steps.length) {
        return null;
    }

    return recordingState.steps[stepIndex + 1];
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

function markRecordingStopped(recordingState) {
    recordingState.tabId = null;
    recordingState.lastKnownUrl = '';
    recordingState.stoppedAt = Date.now();
    recordingState.activeStepId = '';
}

async function setActiveReplayStep(stepId) {
    const recordingState = getRecordingStateForTarget(activeRecordingTarget);
    recordingState.activeStepId = typeof stepId === 'string' ? stepId : '';
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
    draftRecording = createEmptyRecording();
    annotationRecordingsById = {};
    selectedRecordingTarget = createDraftRecordingTarget();
    activeRecordingTarget = createDraftRecordingTarget();
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
    const nextImageEntries = await optimizeImageEntriesForStorage(imageURLs);
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
    const draftRecordingSummary = createRecordingPayload(createDraftRecordingTarget());
    const annotationRecordingSummaries = createRecordingSummariesByAnnotationId();
    const totalRecordingStepCount = draftRecordingSummary.stepCount
        + Object.values(annotationRecordingSummaries).reduce((totalCount, recordingSummary) => totalCount + recordingSummary.stepCount, 0);
    const totalRecordingScreenshotCount = draftRecordingSummary.screenshotCount
        + Object.values(annotationRecordingSummaries).reduce((totalCount, recordingSummary) => totalCount + recordingSummary.screenshotCount, 0);
    return {
        bugs: session.getBugs().length,
        notes: session.getNotes().length,
        annotationsCount: session.getAnnotations().length,
        draftHasContent: hasDraftContent(draft),
        recordingStepCount: totalRecordingStepCount,
        recordingScreenshotCount: totalRecordingScreenshotCount,
        hasExportableState: hasExportableState(session, draft, draftRecording, annotationRecordingsById),
        selectedRecordingTarget: { ...selectedRecordingTarget },
        draftRecording: draftRecordingSummary,
        annotationRecordingsById: annotationRecordingSummaries,
        annotations: session.getAnnotations().map((annotation) => createAnnotationSummaryPayload(annotation))
    };
}

function getFullSessionPayload() {
    const extensionState = buildExtensionStatePayload(session, draft, draftRecording, annotationRecordingsById);
    return {
        ...extensionState,
        draftRecording: serializeRecording(draftRecording),
        annotationRecordingsById: cloneRecordingMap(annotationRecordingsById),
        selectedRecordingTarget: { ...selectedRecordingTarget },
        activeRecordingTarget: { ...activeRecordingTarget }
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

function isStoredScreenshotDataUrl(dataUrl) {
    return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/webp;');
}

async function readBlobAsDataUrl(blob) {
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Failed to read optimized screenshot.'));
        reader.readAsDataURL(blob);
    });
}

async function optimizeImageForStorage(dataUrl, maximumWidth = 0) {
    if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
        return '';
    }

    if (maximumWidth <= 0 && isStoredScreenshotDataUrl(dataUrl)) {
        return dataUrl;
    }

    const response = await fetch(dataUrl);
    const imageBlob = await response.blob();
    const imageBitmap = await createImageBitmap(imageBlob);
    const targetWidth = maximumWidth > 0 && imageBitmap.width > maximumWidth
        ? maximumWidth
        : imageBitmap.width;
    const targetHeight = Math.max(
        1,
        Math.round((imageBitmap.height * targetWidth) / Math.max(1, imageBitmap.width))
    );
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const canvasContext = canvas.getContext('2d');

    if (!canvasContext) {
        throw new Error('Failed to create canvas context for recording screenshot optimization.');
    }

    canvasContext.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

    const optimizedBlob = await canvas.convertToBlob({
        type: STORED_SCREENSHOT_MIME_TYPE,
        quality: STORED_SCREENSHOT_QUALITY
    });

    return await readBlobAsDataUrl(optimizedBlob);
}

async function optimizeImageEntriesForStorage(imageSource, maximumWidth = 0) {
    const normalizedImageEntries = normalizeImageEntries(imageSource);
    const optimizedImageEntries = [];

    for (const imageEntry of normalizedImageEntries) {
        optimizedImageEntries.push({
            ...imageEntry,
            imageURL: await optimizeImageForStorage(imageEntry.imageURL, maximumWidth)
        });
    }

    return optimizedImageEntries;
}

async function captureRecordingScreenshot(stepId, tabId) {
    try {
        await waitForDuration(RECORDING_SCREENSHOT_DELAY_MS);
        const recordingState = getActiveRecordingState();

        const activeTab = await getActiveTab();
        if (!activeTab || activeTab.id !== tabId || recordingState.tabId !== tabId) {
            return '';
        }

        const sourceImageUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        if (!sourceImageUrl) {
            return '';
        }

        const imageURL = await optimizeImageForStorage(sourceImageUrl, RECORDING_SCREENSHOT_MAX_WIDTH);

        const screenshotId = createRuntimeId('recording-shot');
        recordingState.screenshots.push({
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

async function startRecordingFlow(recordingTarget = null) {
    await ensureStateReady();

    const targetToUse = resolveRecordingTarget(recordingTarget || selectedRecordingTarget);
    setSelectedRecordingTarget(targetToUse);
    setActiveRecordingTarget(targetToUse);
    const recordingState = getActiveRecordingState();

    if (recordingState.status === 'recording') {
        await saveRecording();
        return createRecordingPayload(targetToUse);
    }

    if (recordingState.status === 'replaying') {
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
    setRecordingStateForTarget(targetToUse, nextRecording);

    try {
        await sendMessageToTab(activeTab.id, { type: 'setRecordingMode', isRecording: true });
        await saveRecording();
    } catch (error) {
        setRecordingStateForTarget(targetToUse, createEmptyRecording());
        await saveRecording();
        throw error;
    }

    return createRecordingPayload(targetToUse);
}

async function stopRecordingFlow(options = {}) {
    await ensureStateReady();

    const recordingState = getActiveRecordingState();
    if (recordingState.status !== 'recording') {
        return createRecordingPayload(activeRecordingTarget);
    }

    const currentTabId = recordingState.tabId;
    const suppressSyntheticNavigationOnStop = Boolean(options.suppressSyntheticNavigationOnStop);
    if (typeof currentTabId === 'number') {
        try {
            await waitForTabComplete(currentTabId);
            const currentTab = await chrome.tabs.get(currentTabId);
            const lastRecordedStep = recordingState.steps.length > 0
                ? recordingState.steps[recordingState.steps.length - 1]
                : null;
            const hasRealUrlChange = Boolean(
                currentTab &&
                currentTab.url &&
                currentTab.url !== recordingState.lastKnownUrl
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
                recordingState.steps.push({
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
                recordingState.lastKnownUrl = currentTab.url;
            }
        } catch (error) {
            console.log('Background: Failed to capture final navigation step.', error?.message || '');
        }
    }

    updateRecordingStatus(recordingState, 'idle');
    markRecordingStopped(recordingState);
    await saveRecording();

    if (typeof currentTabId === 'number') {
        try {
            await sendMessageToTab(currentTabId, { type: 'setRecordingMode', isRecording: false });
        } catch (error) {
            console.log('Background: Recorder teardown skipped.', error?.message || '');
        }
    }

    return createRecordingPayload(activeRecordingTarget);
}

async function clearRecordingData(recordingTarget = null) {
    playbackToken = null;
    const targetToClear = resolveRecordingTarget(recordingTarget || selectedRecordingTarget);
    deleteRecordingStateForTarget(targetToClear);
    if (getRecordingTargetLabel(activeRecordingTarget) === getRecordingTargetLabel(targetToClear)) {
        setActiveRecordingTarget(createDraftRecordingTarget());
    }
    if (getRecordingTargetLabel(selectedRecordingTarget) === getRecordingTargetLabel(targetToClear)) {
        setSelectedRecordingTarget(targetToClear);
    }
    await saveRecording();
    return createRecordingPayload(targetToClear);
}

async function appendRecordedStep(rawStep, senderTab) {
    await ensureStateReady();

    const recordingState = getActiveRecordingState();
    if (recordingState.status !== 'recording') {
        return createRecordingPayload(activeRecordingTarget);
    }

    if (!senderTab || senderTab.id !== recordingState.tabId) {
        return createRecordingPayload(activeRecordingTarget);
    }

    const stepId = createRuntimeId('recording-step');
    const stepItem = {
        stepId,
        type: typeof rawStep.type === 'string' ? rawStep.type : 'unknown',
        url: typeof rawStep.url === 'string' ? rawStep.url : senderTab.url || recordingState.lastKnownUrl || '',
        timestamp: Date.now(),
        locator: rawStep.locator || null,
        value: typeof rawStep.value === 'string' ? rawStep.value : '',
        inputType: typeof rawStep.inputType === 'string' ? rawStep.inputType : '',
        tagName: typeof rawStep.tagName === 'string' ? rawStep.tagName : '',
        text: typeof rawStep.text === 'string' ? rawStep.text : '',
        screenshotRef: ''
    };

    const lastRecordedStep = recordingState.steps.length > 0
        ? recordingState.steps[recordingState.steps.length - 1]
        : null;
    const isDuplicateNavigation = stepItem.type === 'navigation'
        && lastRecordedStep
        && lastRecordedStep.type === 'navigation'
        && lastRecordedStep.url === stepItem.url;

    if (isDuplicateNavigation) {
        return createRecordingPayload(activeRecordingTarget);
    }

    if (shouldCaptureRecordingScreenshot(stepItem.type)) {
        stepItem.screenshotRef = await captureRecordingScreenshot(stepId, senderTab.id);
    }

    recordingState.steps.push(stepItem);
    recordingState.lastKnownUrl = stepItem.url;
    await saveRecording();
    return createRecordingPayload(activeRecordingTarget);
}

async function appendNavigationStep(tabId, nextUrl) {
    const recordingState = getActiveRecordingState();
    if (recordingState.status !== 'recording' || tabId !== recordingState.tabId) {
        return;
    }

    if (!nextUrl || nextUrl === recordingState.lastKnownUrl) {
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

    recordingState.steps.push(stepItem);
    recordingState.lastKnownUrl = nextUrl;
    await saveRecording();
}

async function playRecordedStepOnTab(tabId, stepItem) {
    return sendMessageToTab(tabId, {
        type: 'playRecordingStep',
        step: stepItem
    });
}

async function playRecordingFlow(recordingTarget = null) {
    await ensureStateReady();

    const targetToUse = resolveRecordingTarget(recordingTarget || selectedRecordingTarget);
    setSelectedRecordingTarget(targetToUse);
    setActiveRecordingTarget(targetToUse);
    const recordingState = getActiveRecordingState();

    if (recordingState.status === 'recording') {
        throw new Error(getMessage('errorStopRecordingBeforeReplay', undefined, 'Stop recording before starting replay.'));
    }

    if (recordingState.status === 'replaying') {
        throw new Error(getMessage('errorReplayAlreadyRunning', undefined, 'Replay is already running.'));
    }

    if (recordingState.steps.length === 0) {
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
    recordingState.status = 'replaying';
    recordingState.lastError = '';
    clearReplayFailureState(recordingState);
    recordingState.tabId = activeTab.id;
    await saveRecording();

    try {
        const firstStep = recordingState.steps[0];
        if (firstStep && firstStep.url && activeTab.url !== firstStep.url) {
            await chrome.tabs.update(activeTab.id, { url: firstStep.url });
            await waitForTabComplete(activeTab.id, firstStep.url);
            await ensureContentScriptReady(activeTab.id);
        }

        for (let stepIndex = 0; stepIndex < recordingState.steps.length; stepIndex += 1) {
            if (playbackToken !== playbackId) {
                throw new Error(getMessage('errorReplayCancelled', undefined, 'Replay cancelled.'));
            }

            const stepItem = recordingState.steps[stepIndex];
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

        updateRecordingStatus(recordingState, 'idle');
        markRecordingStopped(recordingState);
        clearReplayFailureState(recordingState);
        await saveRecording();
        clearPlaybackToken();
        return createRecordingPayload(targetToUse);
    } catch (error) {
        recordingState.failedStepId = typeof error?.failedStepId === 'string' ? error.failedStepId : '';
        updateRecordingStatus(recordingState, 'idle', error.message || getMessage('errorReplayActionFailed', ['?'], 'Replay failed.'));
        markRecordingStopped(recordingState);
        await saveRecording();
        clearPlaybackToken();
        throw error;
    }
}

async function cancelPlayback() {
    playbackToken = null;
    const recordingState = getActiveRecordingState();
    if (recordingState.status === 'replaying') {
        clearReplayFailureState(recordingState);
        updateRecordingStatus(recordingState, 'idle', getMessage('errorReplayCancelled', undefined, 'Replay cancelled.'));
        markRecordingStopped(recordingState);
        await saveRecording();
    }

    return createRecordingPayload(activeRecordingTarget);
}

function isRecorderActiveForSender(senderTab) {
    const recordingState = getActiveRecordingState();
    return recordingState.status === 'recording'
        && senderTab
        && typeof senderTab.id === 'number'
        && senderTab.id === recordingState.tabId;
}

async function syncRecordingNavigationFromActiveTab() {
    const recordingState = getActiveRecordingState();
    if (recordingState.status !== 'recording') {
        return createRecordingPayload(activeRecordingTarget);
    }

    const activeTab = await getActiveTab();
    if (!activeTab || activeTab.id !== recordingState.tabId || !activeTab.url) {
        return createRecordingPayload(activeRecordingTarget);
    }

    const lastRecordedStep = recordingState.steps.length > 0
        ? recordingState.steps[recordingState.steps.length - 1]
        : null;
    const shouldAppendNavigation = !lastRecordedStep
        || lastRecordedStep.url !== activeTab.url
        || lastRecordedStep.type !== 'navigation';

    if (!shouldAppendNavigation) {
        return createRecordingPayload(activeRecordingTarget);
    }

    const stepId = createRuntimeId('recording-step');
    recordingState.steps.push({
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
    recordingState.lastKnownUrl = activeTab.url;
    await saveRecording();
    return createRecordingPayload(activeRecordingTarget);
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
    const annotationId = annotation.getId();
    const draftRecordingHasContent = draftRecording.steps.length > 0 || draftRecording.screenshots.length > 0;
    if (draftRecordingHasContent) {
        annotationRecordingsById[annotationId] = normalizeRecording(draftRecording);
        draftRecording = createEmptyRecording();
        setSelectedRecordingTarget(createAnnotationRecordingTarget(annotationId));
        setActiveRecordingTarget(createAnnotationRecordingTarget(annotationId));
    } else {
        setSelectedRecordingTarget(createAnnotationRecordingTarget(annotationId));
    }
    await saveSession();
    await saveRecording();

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
        summary: getSessionSummaryPayload(),
        popupState: createPopupStatePayload()
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

    const optimizedImageEntries = await optimizeImageEntriesForStorage(imageURLs);
    const updated = session.appendAnnotationImages(annotationId, optimizedImageEntries);
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

    delete annotationRecordingsById[annotationId];
    if (isAnnotationRecordingTarget(selectedRecordingTarget) && selectedRecordingTarget.annotationId === annotationId) {
        setSelectedRecordingTarget(createDraftRecordingTarget());
    }
    if (isAnnotationRecordingTarget(activeRecordingTarget) && activeRecordingTarget.annotationId === annotationId) {
        setActiveRecordingTarget(createDraftRecordingTarget());
    }

    await saveSession();
    await saveRecording();
}

async function exportSessionJSON() {
    await ensureStateReady();

    if (!hasExportableState(session, draft, draftRecording, annotationRecordingsById)) {
        return false;
    }

    const extensionStateService = new ExtensionStateService();
    const jsonData = extensionStateService.getJSON(session, draft, draftRecording, annotationRecordingsById);
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
    draftRecording = importedState.draftRecording || createEmptyRecording();
    annotationRecordingsById = normalizeRecordingMap(importedState.annotationRecordingsById || {});
    selectedRecordingTarget = createDraftRecordingTarget();
    activeRecordingTarget = createDraftRecordingTarget();
    try {
        await saveSession();
        await saveDraft();
        await saveRecording();
    } catch (error) {
        throw error;
    }
    showNotification(
        getMessage('notificationImportSuccessTitle', undefined, 'Import completed'),
        getMessage('notificationImportSuccessBody', undefined, 'Session data was imported successfully.')
    );
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
            case 'getPopupState':
                return { status: 'ok', popupState: createPopupStatePayload() };
            case 'getRecordingState':
                return {
                    status: 'ok',
                    recording: createRecordingPayload(selectedRecordingTarget),
                    selectedRecordingTarget: { ...selectedRecordingTarget },
                    draftRecording: createRecordingPayload(createDraftRecordingTarget()),
                    annotationRecordingsById: createRecordingSummariesByAnnotationId()
                };
            case 'getRecorderModeForSender':
                const activeRecordingState = getActiveRecordingState();
                return {
                    status: 'ok',
                    isRecording: isRecorderActiveForSender(sender.tab || null),
                    lastKnownUrl: activeRecordingState.lastKnownUrl,
                    recordingId: activeRecordingState.id
                };
            case 'setSelectedRecordingTarget':
                setSelectedRecordingTarget(request.target || createDraftRecordingTarget());
                await saveRecording();
                return { status: 'ok', popupState: createPopupStatePayload() };
            case 'startRecordingFlow':
                return { status: 'ok', recording: await startRecordingFlow(request.target || null), popupState: createPopupStatePayload() };
            case 'syncRecordingNavigation':
                return { status: 'ok', recording: await syncRecordingNavigationFromActiveTab(), popupState: createPopupStatePayload() };
            case 'stopRecordingFlow':
                return { status: 'ok', recording: await stopRecordingFlow(request.options || {}), popupState: createPopupStatePayload() };
            case 'clearRecordingData':
                return { status: 'ok', recording: await clearRecordingData(request.target || null), popupState: createPopupStatePayload() };
            case 'appendRecordedStep':
                return { status: 'ok', recording: await appendRecordedStep(request.step || {}, sender.tab || null), popupState: createPopupStatePayload() };
            case 'playRecordingFlow':
                return { status: 'ok', recording: await playRecordingFlow(request.target || null), popupState: createPopupStatePayload() };
            case 'cancelPlayback':
                return { status: 'ok', recording: await cancelPlayback(), popupState: createPopupStatePayload() };
            case 'getDraft':
                return { status: 'ok', draft: getDraftPayload() };
            case 'updateDraft':
                return { status: 'ok', draft: await updateDraftState(request.draft) };
            case 'clearDraft':
                draft = createEmptyDraft(request.typeName || draft.type || 'Bug');
                draftRecording = createEmptyRecording();
                setSelectedRecordingTarget(createDraftRecordingTarget());
                setActiveRecordingTarget(createDraftRecordingTarget());
                await saveDraft();
                await saveRecording();
                return { status: 'ok', draft: getDraftPayload(), popupState: createPopupStatePayload() };
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
            const recordingState = getActiveRecordingState();
            if (recordingState.tabId !== tabId) {
                return;
            }

            if (recordingState.status === 'recording') {
                await appendNavigationStep(tabId, tab.url || '');
                try {
                    await sendMessageToTab(tabId, { type: 'setRecordingMode', isRecording: true });
                } catch (error) {
                    console.log('Background: Recorder sync skipped.', error?.message || '');
                }
            }

            if (recordingState.status === 'replaying') {
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