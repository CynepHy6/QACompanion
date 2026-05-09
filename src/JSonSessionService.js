import { Bug, Note, normalizeImageEntries } from './Annotation.js';
import { Session } from './Session.js';

const CONSTRUCTOR_BY_TYPE = {
    Bug,
    Note
};

function getSessionTimestamp(rawObject) {
    return rawObject.StartDateTime || rawObject.startDateTime || Date.now();
}

function getSessionBrowserInfo(rawObject) {
    return rawObject.BrowserInfo || rawObject.browserInfo || null;
}

function getAnnotationImageEntries(rawAnnotation) {
    if (Array.isArray(rawAnnotation.imageEntries)) {
        return rawAnnotation.imageEntries;
    }

    return normalizeImageEntries(rawAnnotation.imageURLs || rawAnnotation.imageURL || []);
}

export class JSonSessionService {
    getJSon(session) {
        return JSON.stringify(session.toSerializableObject(), null, 2);
    }

    getSession(jsonString) {
        const rawObject = JSON.parse(jsonString);
        const annotations = [];
        const rawAnnotations = Array.isArray(rawObject.annotations) ? rawObject.annotations : [];

        for (const rawAnnotation of rawAnnotations) {
            const annotation = this.getAnnotationFromType(rawAnnotation);
            if (annotation) {
                annotations.push(annotation);
            }
        }

        const session = new Session(getSessionTimestamp(rawObject), getSessionBrowserInfo(rawObject));
        session.setAnnotations(annotations);
        return session;
    }

    getAnnotationFromType(rawAnnotation) {
        const AnnotationConstructor = CONSTRUCTOR_BY_TYPE[rawAnnotation.type];
        if (!AnnotationConstructor) {
            return null;
        }

        return new AnnotationConstructor(
            rawAnnotation.name,
            rawAnnotation.url,
            rawAnnotation.timestamp,
            getAnnotationImageEntries(rawAnnotation),
            rawAnnotation.id || null
        );
    }

    getAnnotaionFromType(rawAnnotation) {
        return this.getAnnotationFromType(rawAnnotation);
    }
}