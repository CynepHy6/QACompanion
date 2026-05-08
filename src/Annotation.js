const REMOVED_IMAGE_PLACEHOLDER = "IMAGE_REMOVED_DUE_TO_STORAGE_LIMIT";

function createFallbackAnnotationId() {
    const randomPart = Math.random().toString(16).slice(2, 10);
    return `annotation-${Date.now()}-${randomPart}`;
}

export function createAnnotationId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return createFallbackAnnotationId();
}

export function normalizeImageURLs(imageSource) {
    const rawImages = Array.isArray(imageSource) ? imageSource : [imageSource];

    return rawImages
        .filter((imageEntry) => typeof imageEntry === "string" && imageEntry.length > 0)
        .filter((imageEntry) => imageEntry !== REMOVED_IMAGE_PLACEHOLDER);
}

function normalizeAnnotationTimestamp(timestampValue) {
    if (timestampValue instanceof Date) {
        return timestampValue.getTime();
    }

    if (typeof timestampValue === "number") {
        return timestampValue;
    }

    if (typeof timestampValue === "string" && timestampValue.length > 0) {
        const parsedTimestamp = new Date(timestampValue).getTime();
        if (!Number.isNaN(parsedTimestamp)) {
            return parsedTimestamp;
        }
    }

    return Date.now();
}

export class Annotation {
    constructor(typeName, name, url, timestamp, imageSource = [], annotationId = null) {
        if (arguments.length <= 4) {
            annotationId = null;
            imageSource = timestamp;
            timestamp = url;
            url = name;
            name = typeName;
            typeName = "";
        }

        this.id = annotationId || createAnnotationId();
        this.type = typeName;
        this.name = name || "";
        this.url = url || "";
        this.timestamp = normalizeAnnotationTimestamp(timestamp);
        this.imageURLs = normalizeImageURLs(imageSource);
        this.imageURL = this.imageURLs[0] || "";
    }

    syncLegacyImageURL() {
        this.imageURL = this.imageURLs[0] || "";
    }

    getId() {
        return this.id;
    }

    getType() {
        return this.type;
    }

    getName() {
        return this.name;
    }

    setName(newName) {
        this.name = newName || "";
    }

    getURL() {
        return this.url;
    }

    getTimeStamp() {
        return new Date(this.timestamp);
    }

    setImageURL(imageURL) {
        this.imageURLs = normalizeImageURLs(imageURL);
        this.syncLegacyImageURL();
    }

    setImageURLs(imageURLs) {
        this.imageURLs = normalizeImageURLs(imageURLs);
        this.syncLegacyImageURL();
    }

    addImage(imageURL) {
        const normalizedImages = normalizeImageURLs(imageURL);
        if (normalizedImages.length === 0) {
            return;
        }

        this.imageURLs.push(...normalizedImages);
        this.syncLegacyImageURL();
    }

    addImages(imageURLs) {
        const normalizedImages = normalizeImageURLs(imageURLs);
        if (normalizedImages.length === 0) {
            return;
        }

        this.imageURLs.push(...normalizedImages);
        this.syncLegacyImageURL();
    }

    removeImageAt(imageIndex) {
        if (imageIndex < 0 || imageIndex >= this.imageURLs.length) {
            return;
        }

        this.imageURLs.splice(imageIndex, 1);
        this.syncLegacyImageURL();
    }

    getImageURL() {
        return this.imageURL;
    }

    getImageURLs() {
        return [...this.imageURLs];
    }

    toSerializableObject() {
        return {
            id: this.id,
            type: this.type,
            name: this.name,
            url: this.url,
            timestamp: this.timestamp,
            imageURL: this.imageURL,
            imageURLs: [...this.imageURLs]
        };
    }
}

export class Bug extends Annotation {
    constructor(name, url, timestamp, imageSource = [], annotationId = null) {
        super("Bug", name, url, timestamp, imageSource, annotationId);
    }
}

export class Note extends Annotation {
    constructor(name, url, timestamp, imageSource = [], annotationId = null) {
        super("Note", name, url, timestamp, imageSource, annotationId);
    }
}
