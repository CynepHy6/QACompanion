import { Bug, Note, normalizeImageEntries } from './Annotation.js';
import { createEmptyRecording, normalizeRecording } from './Recording.js';
import { Session } from './Session.js';

const ANNOTATION_CONSTRUCTORS = {
    Bug,
    Note
};

const VALID_ANNOTATION_TYPES = ['Bug', 'Note'];
const EXPORT_FORMAT_VERSION = 4;

function normalizeDraftType(draftType) {
    return VALID_ANNOTATION_TYPES.includes(draftType) ? draftType : 'Bug';
}

function serializeAnnotation(annotation) {
    return {
        id: annotation.getId(),
        type: annotation.getType(),
        name: annotation.getName(),
        url: annotation.getURL(),
        timestamp: annotation.getTimeStamp().getTime(),
        imageEntries: annotation.getImageEntries()
    };
}

function createAnnotationFromExport(rawAnnotation = {}) {
    const AnnotationConstructor = ANNOTATION_CONSTRUCTORS[rawAnnotation.type];
    if (!AnnotationConstructor) {
        return null;
    }

    return new AnnotationConstructor(
        rawAnnotation.name,
        rawAnnotation.url,
        rawAnnotation.timestamp,
        normalizeImageEntries(rawAnnotation.imageEntries || []),
        rawAnnotation.id || null
    );
}

function serializeDraft(draftState = {}) {
    const imageEntries = normalizeImageEntries(draftState.imageEntries || []);
    return {
        type: normalizeDraftType(draftState.type),
        description: typeof draftState.description === 'string' ? draftState.description : '',
        imageEntries,
        imageURLs: imageEntries.map((imageEntry) => imageEntry.imageURL)
    };
}

function createAnnotationFromDraft(draftState = {}) {
    const normalizedDraft = serializeDraft(draftState);
    if (!hasDraftContent(normalizedDraft)) {
        return null;
    }

    const AnnotationConstructor = ANNOTATION_CONSTRUCTORS[normalizedDraft.type];
    if (!AnnotationConstructor) {
        return null;
    }

    const timestampValue = normalizedDraft.imageEntries.length > 0
        ? normalizedDraft.imageEntries[normalizedDraft.imageEntries.length - 1].createdAt
        : Date.now();

    return new AnnotationConstructor(
        normalizedDraft.description,
        '',
        timestampValue,
        normalizedDraft.imageEntries
    );
}

function sanitizeRecording(recordingState = {}) {
    const normalizedRecording = normalizeRecording(recordingState);

    return {
        ...normalizedRecording,
        status: 'idle',
        tabId: null,
        activeStepId: '',
        failedStepId: '',
        lastError: ''
    };
}

function serializeSession(session) {
    return {
        startDateTime: session.getStartDateTime().getTime(),
        browserInfo: session.getBrowserInfo(),
        annotations: session.getAnnotations().map((annotation) => serializeAnnotation(annotation))
    };
}

function createSessionFromExport(rawSession = {}) {
    const session = new Session(
        rawSession.startDateTime,
        rawSession.browserInfo
    );

    const rawAnnotations = Array.isArray(rawSession.annotations) ? rawSession.annotations : [];
    const annotations = rawAnnotations
        .map((rawAnnotation) => createAnnotationFromExport(rawAnnotation))
        .filter((annotation) => annotation !== null);

    session.setAnnotations(annotations);
    return session;
}

export function hasDraftContent(draftState = {}) {
    const normalizedDraft = serializeDraft(draftState);
    return normalizedDraft.description.trim() !== '' || normalizedDraft.imageEntries.length > 0;
}

export function hasRecordingContent(recordingState = {}) {
    const normalizedRecording = sanitizeRecording(recordingState);
    return normalizedRecording.steps.length > 0 || normalizedRecording.screenshots.length > 0;
}

export function hasSessionContent(session) {
    return session.getAnnotations().length > 0;
}

export function hasExportableState(session, draftState = {}, recordingState = {}) {
    return hasSessionContent(session) || hasDraftContent(draftState) || hasRecordingContent(recordingState);
}

export function buildExtensionStatePayload(session, draftState = {}, recordingState = {}) {
    const serializedSession = serializeSession(session);
    const draftAnnotation = createAnnotationFromDraft(draftState);
    if (draftAnnotation) {
        serializedSession.annotations.push(serializeAnnotation(draftAnnotation));
    }

    return {
        version: EXPORT_FORMAT_VERSION,
        exportedAt: Date.now(),
        session: serializedSession,
        recording: sanitizeRecording(recordingState)
    };
}

export class ExtensionStateService {
    getJSON(session, draftState = {}, recordingState = {}) {
        return JSON.stringify(buildExtensionStatePayload(session, draftState, recordingState), null, 2);
    }

    getState(jsonString) {
        const rawObject = JSON.parse(jsonString);
        const rawSession = rawObject?.session || {};

        return {
            session: createSessionFromExport(rawSession),
            draft: serializeDraft({}),
            recording: sanitizeRecording(rawObject?.recording || createEmptyRecording())
        };
    }
}
