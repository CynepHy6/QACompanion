import { buildExtensionStatePayload } from '../../src/ExtensionStateService.js';
import { createEmptyRecording, normalizeRecording, normalizeRecordingMap, serializeRecording } from '../../src/Recording.js';
import { Session } from '../../src/Session.js';
import { Bug, Note } from '../../src/Annotation.js';

const ANNOTATION_CONSTRUCTORS = { Bug, Note };
const ADD_METHODS = { Bug: 'addBug', Note: 'addNote' };

function buildReportState(rawPayload) {
    const rawSession = rawPayload?.session || {};
    const session = new Session(rawSession.startDateTime, rawSession.browserInfo);
    const rawAnnotations = Array.isArray(rawSession.annotations) ? rawSession.annotations : [];

    rawAnnotations.forEach((annotation) => {
        const AnnotationConstructor = ANNOTATION_CONSTRUCTORS[annotation.type];
        if (!AnnotationConstructor) {
            return;
        }

        const nextAnnotation = new AnnotationConstructor(
            annotation.name,
            annotation.url,
            annotation.timestamp,
            annotation.imageEntries || [],
            annotation.id || null
        );
        session[ADD_METHODS[annotation.type]](nextAnnotation);
    });

    return {
        session,
        draft: {
            type: 'Bug',
            description: '',
            imageEntries: [],
            imageURLs: []
        },
        draftRecording: normalizeRecording(rawPayload?.draftRecording || {}),
        annotationRecordingsById: normalizeRecordingMap(rawPayload?.annotationRecordingsById || {}),
        draftAnnotationId: typeof rawPayload?.draftAnnotationId === 'string' ? rawPayload.draftAnnotationId : '',
        selectedRecordingTarget: rawPayload?.selectedRecordingTarget || { kind: 'draft', annotationId: '' }
    };
}

/**
 * Loads and reconstructs the extension state from the Chrome extension background.
 * @returns {Promise<object|null>} The reconstructed report state or null if no data.
 */
export async function loadReportState() {
    const response = await chrome.runtime.sendMessage({ type: "getSessionData" });
    if (!response || !response.hasExportableState) {
        return null;
    }

    const sessionData = await chrome.runtime.sendMessage({ type: "getFullSession" });
    if (!sessionData) {
        throw new Error('Could not get full session data');
    }

    return buildReportState(sessionData);
}

/**
 * Deletes an annotation via the Chrome extension background.
 * @param {string} annotationId - Stable annotation identifier.
 * @returns {Promise<object>} The response from the background script.
 */
export function deleteAnnotation(annotationId) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { type: "deleteAnnotation", annotationId },
            resolve
        );
    });
}

export function updateAnnotationName(annotationId, newName) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { type: "updateAnnotationName", annotationId, newName },
            resolve
        );
    });
}

export function deleteAnnotationImage(annotationId, imageIndex) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { type: "deleteAnnotationImage", annotationId, imageIndex },
            resolve
        );
    });
}

/**
 * Serializes extension state for embedding in the downloaded report.
 * @param {object} reportState
 * @returns {object}
 */
export function serializeReportState(reportState) {
    return buildExtensionStatePayload(
        reportState.session,
        reportState.draft,
        reportState.draftRecording,
        reportState.annotationRecordingsById
    );
}

export function getAnnotationRecording(reportState, annotationId) {
    if (!annotationId || !reportState?.annotationRecordingsById) {
        return createEmptyRecording();
    }

    return normalizeRecording(reportState.annotationRecordingsById[annotationId] || {});
}

export function setAnnotationRecording(reportState, annotationId, recordingState) {
    if (!reportState.annotationRecordingsById) {
        reportState.annotationRecordingsById = {};
    }

    reportState.annotationRecordingsById[annotationId] = serializeRecording(recordingState);
}
