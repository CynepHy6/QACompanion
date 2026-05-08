import { Bug, Note, normalizeImageURLs } from './Annotation.js';
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

function getAnnotationImages(rawAnnotation) {
    if (Array.isArray(rawAnnotation.imageURLs)) {
        return rawAnnotation.imageURLs;
    }

    return normalizeImageURLs(rawAnnotation.imageURL || []);
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
            getAnnotationImages(rawAnnotation),
            rawAnnotation.id || null
        );
    }

    getAnnotaionFromType(rawAnnotation) {
        return this.getAnnotationFromType(rawAnnotation);
    }
}