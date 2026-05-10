import { Bug, Note, normalizeImageEntries } from './Annotation.js';
import {
    createEmptyRecording,
    createRecordingSummary,
    normalizeRecording,
    normalizeRecordingMap,
    sanitizeRecording
} from './Recording.js';
import { Session } from './Session.js';

const ANNOTATION_CONSTRUCTORS = {
    Bug,
    Note
};

const VALID_ANNOTATION_TYPES = ['Bug', 'Note'];
const EXPORT_FORMAT_VERSION = 5;
const SYNTHETIC_DRAFT_ANNOTATION_ID = '__draft-annotation__';

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

function createEmptyDraftRecordingState() {
    return sanitizeRecording(createEmptyRecording());
}

function normalizeAnnotationRecordingsById(rawRecordings = {}) {
    return Object.fromEntries(
        Object.entries(normalizeRecordingMap(rawRecordings))
            .map(([annotationId, recordingState]) => [annotationId, sanitizeRecording(recordingState)])
    );
}

function createDraftAnnotationId() {
    return SYNTHETIC_DRAFT_ANNOTATION_ID;
}

function getLegacyRecordingImportTarget(rawSession = {}) {
    const annotations = Array.isArray(rawSession.annotations) ? rawSession.annotations : [];
    const lastAnnotation = annotations.length > 0 ? annotations[annotations.length - 1] : null;
    if (lastAnnotation && typeof lastAnnotation.id === 'string' && lastAnnotation.id !== '') {
        return lastAnnotation.id;
    }

    return '';
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

export function hasAnnotationRecordings(annotationRecordingsById = {}) {
    return Object.values(normalizeAnnotationRecordingsById(annotationRecordingsById))
        .some((recordingState) => hasRecordingContent(recordingState));
}

export function hasSessionContent(session) {
    return session.getAnnotations().length > 0;
}

export function hasExportableState(session, draftState = {}, draftRecordingState = {}, annotationRecordingsById = {}) {
    return hasSessionContent(session)
        || hasDraftContent(draftState)
        || hasRecordingContent(draftRecordingState)
        || hasAnnotationRecordings(annotationRecordingsById);
}

export function buildExtensionStatePayload(session, draftState = {}, draftRecordingState = {}, annotationRecordingsById = {}) {
    const serializedSession = serializeSession(session);
    const draftAnnotation = createAnnotationFromDraft(draftState);
    const sanitizedDraftRecording = sanitizeRecording(draftRecordingState);
    const sanitizedAnnotationRecordings = normalizeAnnotationRecordingsById(annotationRecordingsById);
    let draftAnnotationId = '';

    if (draftAnnotation) {
        draftAnnotationId = createDraftAnnotationId();
        draftAnnotation.id = draftAnnotationId;
        serializedSession.annotations.push(serializeAnnotation(draftAnnotation));
    }

    if (draftAnnotationId !== '' && hasRecordingContent(sanitizedDraftRecording)) {
        sanitizedAnnotationRecordings[draftAnnotationId] = sanitizedDraftRecording;
    }

    return {
        version: EXPORT_FORMAT_VERSION,
        exportedAt: Date.now(),
        session: serializedSession,
        draftRecording: sanitizedDraftRecording,
        annotationRecordingsById: sanitizedAnnotationRecordings,
        draftAnnotationId
    };
}

export class ExtensionStateService {
    getJSON(session, draftState = {}, draftRecordingState = {}, annotationRecordingsById = {}) {
        return JSON.stringify(buildExtensionStatePayload(session, draftState, draftRecordingState, annotationRecordingsById), null, 2);
    }

    getState(jsonString) {
        const rawObject = JSON.parse(jsonString);
        const rawSession = rawObject?.session || {};
        const isLegacyVersion = (rawObject?.version || 0) < EXPORT_FORMAT_VERSION;
        const draftAnnotationId = typeof rawObject?.draftAnnotationId === 'string' ? rawObject.draftAnnotationId : '';
        const rawAnnotationRecordings = normalizeAnnotationRecordingsById(rawObject?.annotationRecordingsById || {});
        let draftState = serializeDraft({});
        let draftRecording = sanitizeRecording(rawObject?.draftRecording || createEmptyDraftRecordingState());
        const session = createSessionFromExport(rawSession);
        const annotationRecordingsById = { ...rawAnnotationRecordings };

        if (draftAnnotationId !== '') {
            const draftAnnotation = session.getAnnotationById(draftAnnotationId);
            if (draftAnnotation) {
                draftState = serializeDraft({
                    type: draftAnnotation.getType(),
                    description: draftAnnotation.getName(),
                    imageEntries: draftAnnotation.getImageEntries()
                });
                if (annotationRecordingsById[draftAnnotationId]) {
                    draftRecording = sanitizeRecording(annotationRecordingsById[draftAnnotationId]);
                    delete annotationRecordingsById[draftAnnotationId];
                }
                session.deleteAnnotation(draftAnnotationId);
            }
        }

        if (isLegacyVersion && rawObject?.recording) {
            const legacyRecording = sanitizeRecording(rawObject.recording);
            if (hasRecordingContent(legacyRecording)) {
                const legacyTargetAnnotationId = getLegacyRecordingImportTarget(rawSession);
                if (legacyTargetAnnotationId !== '') {
                    annotationRecordingsById[legacyTargetAnnotationId] = legacyRecording;
                } else {
                    draftRecording = legacyRecording;
                }
            }
        }

        return {
            session,
            draft: draftState,
            draftRecording,
            annotationRecordingsById
        };
    }
}
