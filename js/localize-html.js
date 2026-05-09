(function () {
    'use strict';

    const MESSAGE_PATTERN = /__MSG_([A-Za-z0-9_@]+)__/g;
    const SKIPPED_TAG_NAMES = new Set(['SCRIPT', 'STYLE']);

    function getLocalizedMessage(messageKey) {
        try {
            const localizedMessage = chrome?.i18n?.getMessage(messageKey);
            return localizedMessage || '';
        } catch {
            return '';
        }
    }

    function replaceMessageTokens(textValue) {
        if (typeof textValue !== 'string' || textValue.includes('__MSG_') === false) {
            return textValue;
        }

        return textValue.replace(MESSAGE_PATTERN, (fullMatch, messageKey) => {
            const localizedMessage = getLocalizedMessage(messageKey);
            return localizedMessage || fullMatch;
        });
    }

    function localizeTextNodes(rootNode) {
        const textWalker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
        let currentTextNode = textWalker.nextNode();

        while (currentTextNode) {
            const parentElement = currentTextNode.parentElement;
            if (!parentElement || SKIPPED_TAG_NAMES.has(parentElement.tagName)) {
                currentTextNode = textWalker.nextNode();
                continue;
            }

            const localizedText = replaceMessageTokens(currentTextNode.nodeValue);
            if (localizedText !== currentTextNode.nodeValue) {
                currentTextNode.nodeValue = localizedText;
            }

            currentTextNode = textWalker.nextNode();
        }
    }

    function localizeAttributes(rootNode) {
        const elementList = rootNode.querySelectorAll('*');
        elementList.forEach((elementNode) => {
            if (SKIPPED_TAG_NAMES.has(elementNode.tagName)) {
                return;
            }

            Array.from(elementNode.attributes).forEach((attributeNode) => {
                if (attributeNode.value.includes('__MSG_') === false) {
                    return;
                }

                const localizedValue = replaceMessageTokens(attributeNode.value);
                if (localizedValue !== attributeNode.value) {
                    elementNode.setAttribute(attributeNode.name, localizedValue);
                }
            });
        });
    }

    function applyDocumentLanguage() {
        try {
            const uiLanguage = chrome?.i18n?.getUILanguage?.();
            if (!uiLanguage) {
                return;
            }

            document.documentElement.lang = uiLanguage;
        } catch {
            // Ignore language detection issues.
        }
    }

    function localizeDocument() {
        localizeTextNodes(document.documentElement);
        localizeAttributes(document.documentElement);
        applyDocumentLanguage();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', localizeDocument, { once: true });
    } else {
        localizeDocument();
    }
})();
