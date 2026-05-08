import { getSystemInfo } from './browserInfo.js';

function normalizeSessionTimestamp(dateTime) {
  if (dateTime instanceof Date) {
    return dateTime.getTime();
  }

  if (typeof dateTime === 'number') {
    return dateTime;
  }

  if (typeof dateTime === 'string' && dateTime.length > 0) {
    const parsedTimestamp = new Date(dateTime).getTime();
    if (!Number.isNaN(parsedTimestamp)) {
      return parsedTimestamp;
    }
  }

  return Date.now();
}

function isBrowserInfoComplete(browserInfo) {
  return Boolean(
    browserInfo &&
    typeof browserInfo.browser === 'string' &&
    browserInfo.browser !== '' &&
    typeof browserInfo.browserVersion === 'string' &&
    browserInfo.browserVersion !== '' &&
    typeof browserInfo.os === 'string' &&
    browserInfo.os !== ''
  );
}

export class Session {
  constructor(dateTime, browserInfo) {
    this.BrowserInfo = isBrowserInfoComplete(browserInfo) ? browserInfo : getSystemInfo();
    this.StartDateTime = normalizeSessionTimestamp(dateTime);
    this.annotations = [];
  }

  getBrowserInfo() {
    return this.BrowserInfo;
  }

  getStartDateTime() {
    return new Date(this.StartDateTime);
  }

  clearAnnotations() {
    this.annotations = [];
  }

  setAnnotations(newAnnotations) {
    this.annotations = Array.isArray(newAnnotations) ? [...newAnnotations] : [];
  }

  addAnnotation(annotation) {
    this.annotations.push(annotation);
  }

  addBug(newBug) {
    this.addAnnotation(newBug);
  }

  addNote(newNote) {
    this.addAnnotation(newNote);
  }

  getAnnotations() {
    return this.annotations;
  }

  getAnnotationIndex(annotationIdentifier) {
    if (typeof annotationIdentifier === 'number') {
      return annotationIdentifier;
    }

    return this.annotations.findIndex((annotation) => annotation.id === annotationIdentifier);
  }

  getAnnotationById(annotationIdentifier) {
    const annotationIndex = this.getAnnotationIndex(annotationIdentifier);
    if (annotationIndex < 0 || annotationIndex >= this.annotations.length) {
      return null;
    }

    return this.annotations[annotationIndex];
  }

  deleteAnnotation(annotationIdentifier) {
    const annotationIndex = this.getAnnotationIndex(annotationIdentifier);
    if (annotationIndex > -1) {
      this.annotations.splice(annotationIndex, 1);
      return true;
    }

    return false;
  }

  updateAnnotationName(annotationIdentifier, newName) {
    const annotation = this.getAnnotationById(annotationIdentifier);
    if (!annotation) {
      return false;
    }

    annotation.setName(newName);
    return true;
  }

  appendAnnotationImages(annotationIdentifier, imageURLs) {
    const annotation = this.getAnnotationById(annotationIdentifier);
    if (!annotation) {
      return false;
    }

    annotation.addImages(imageURLs);
    return true;
  }

  removeAnnotationImage(annotationIdentifier, imageIndex) {
    const annotation = this.getAnnotationById(annotationIdentifier);
    if (!annotation) {
      return false;
    }

    annotation.removeImageAt(imageIndex);
    return true;
  }

  getBugs() {
    return this.annotations.filter((item) => item.getType() === 'Bug');
  }

  getNotes() {
    return this.annotations.filter((item) => item.getType() === 'Note');
  }

  toSerializableObject() {
    return {
      StartDateTime: this.StartDateTime,
      BrowserInfo: this.BrowserInfo,
      annotations: this.annotations.map((annotation) => annotation.toSerializableObject())
    };
  }
}