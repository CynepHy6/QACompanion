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
    return normalizeImageEntries(imageSource).map((imageEntry) => imageEntry.imageURL);
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

function normalizeImageCreatedAt(createdAtValue, fallbackTimestamp = Date.now()) {
    if (typeof createdAtValue === "number" && Number.isFinite(createdAtValue)) {
        return createdAtValue;
    }

    if (typeof createdAtValue === "string" && createdAtValue.length > 0) {
        const parsedTimestamp = new Date(createdAtValue).getTime();
        if (!Number.isNaN(parsedTimestamp)) {
            return parsedTimestamp;
        }
    }

    return fallbackTimestamp;
}

function normalizeImageEntry(rawEntry, fallbackTimestamp = Date.now()) {
    if (typeof rawEntry === "string") {
        if (rawEntry.length === 0 || rawEntry === REMOVED_IMAGE_PLACEHOLDER) {
            return null;
        }

        return {
            imageURL: rawEntry,
            createdAt: fallbackTimestamp
        };
    }

    if (!rawEntry || typeof rawEntry !== "object") {
        return null;
    }

    const imageURL = typeof rawEntry.imageURL === "string"
        ? rawEntry.imageURL
        : typeof rawEntry.url === "string"
            ? rawEntry.url
            : "";

    if (imageURL.length === 0 || imageURL === REMOVED_IMAGE_PLACEHOLDER) {
        return null;
    }

    return {
        imageURL,
        createdAt: normalizeImageCreatedAt(rawEntry.createdAt, fallbackTimestamp)
    };
}

export function normalizeImageEntries(imageSource, fallbackTimestamp = Date.now()) {
    const rawImages = Array.isArray(imageSource) ? imageSource : [imageSource];

    return rawImages
        .map((imageEntry) => normalizeImageEntry(imageEntry, fallbackTimestamp))
        .filter((imageEntry) => imageEntry !== null);
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
        this.imageEntries = normalizeImageEntries(imageSource, this.timestamp);
        this.syncLegacyImageData();
    }

    syncLegacyImageData() {
        this.imageURLs = this.imageEntries.map((imageEntry) => imageEntry.imageURL);
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
        this.imageEntries = normalizeImageEntries(imageURL);
        this.syncLegacyImageData();
    }

    setImageURLs(imageURLs) {
        this.imageEntries = normalizeImageEntries(imageURLs);
        this.syncLegacyImageData();
    }

    setImageEntries(imageEntries) {
        this.imageEntries = normalizeImageEntries(imageEntries, this.timestamp);
        this.syncLegacyImageData();
    }

    addImage(imageURL) {
        const normalizedImages = normalizeImageEntries(imageURL);
        if (normalizedImages.length === 0) {
            return;
        }

        this.imageEntries.push(...normalizedImages);
        this.syncLegacyImageData();
    }

    addImages(imageURLs) {
        const normalizedImages = normalizeImageEntries(imageURLs);
        if (normalizedImages.length === 0) {
            return;
        }

        this.imageEntries.push(...normalizedImages);
        this.syncLegacyImageData();
    }

    removeImageAt(imageIndex) {
        if (imageIndex < 0 || imageIndex >= this.imageEntries.length) {
            return;
        }

        this.imageEntries.splice(imageIndex, 1);
        this.syncLegacyImageData();
    }

    getImageURL() {
        return this.imageURL;
    }

    getImageURLs() {
        return [...this.imageURLs];
    }

    getImageEntries() {
        return this.imageEntries.map((imageEntry) => ({ ...imageEntry }));
    }

    toSerializableObject() {
        return {
            id: this.id,
            type: this.type,
            name: this.name,
            url: this.url,
            timestamp: this.timestamp,
            imageURL: this.imageURL,
            imageURLs: [...this.imageURLs],
            imageEntries: this.getImageEntries()
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
