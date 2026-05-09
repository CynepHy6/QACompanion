export function getMessage(messageKey, substitutions = undefined, fallbackValue = '') {
    try {
        const localizedMessage = chrome?.i18n?.getMessage(messageKey, substitutions);
        if (localizedMessage) {
            return localizedMessage;
        }
    } catch {
        // Ignore i18n access issues and fall back below.
    }

    return fallbackValue;
}

export function getUiLocale() {
    try {
        return chrome?.i18n?.getUILanguage?.() || navigator.language || 'en';
    } catch {
        return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en';
    }
}

export function isRussianLocale() {
    return getUiLocale().toLowerCase().startsWith('ru');
}

export function getPluralCategory(countValue) {
    const absoluteCount = Math.abs(Number(countValue) || 0);

    if (!isRussianLocale()) {
        return absoluteCount === 1 ? 'one' : 'many';
    }

    const lastTwoDigits = absoluteCount % 100;
    const lastDigit = absoluteCount % 10;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
        return 'many';
    }

    if (lastDigit === 1) {
        return 'one';
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
        return 'few';
    }

    return 'many';
}

export function getPluralMessage(messageKeyBase, countValue, extraSubstitutions = [], fallbackValue = '') {
    const pluralCategory = getPluralCategory(countValue);
    const substitutions = [String(countValue), ...extraSubstitutions];
    return getMessage(`${messageKeyBase}_${pluralCategory}`, substitutions, fallbackValue);
}

export function formatDateLocalized(timestampValue, options = {}) {
    return new Date(timestampValue).toLocaleDateString(getUiLocale(), options);
}

export function formatTimeLocalized(timestampValue, options = {}) {
    return new Date(timestampValue).toLocaleTimeString(getUiLocale(), options);
}

export function formatDateTimeLocalized(timestampValue, options = {}) {
    return new Date(timestampValue).toLocaleString(getUiLocale(), options);
}

export function getAnnotationTypeLabel(typeName) {
    if (typeName === 'Bug') {
        return getMessage('annotationBug', undefined, 'Bug');
    }

    if (typeName === 'Note') {
        return getMessage('annotationNote', undefined, 'Note');
    }

    if (typeName === 'Recording') {
        return getMessage('annotationRecording', undefined, 'Recording');
    }

    return typeName;
}

export function getRecorderStepTypeLabel(stepType) {
    const messageKeyByType = {
        click: 'stepTypeClick',
        input: 'stepTypeInput',
        change: 'stepTypeChange',
        submit: 'stepTypeSubmit',
        navigation: 'stepTypeNavigation',
        unknown: 'stepTypeUnknown'
    };

    const messageKey = messageKeyByType[stepType] || messageKeyByType.unknown;
    return getMessage(messageKey, undefined, stepType);
}
