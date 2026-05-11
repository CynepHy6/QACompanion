// js/content_script.js

// Check if the main listener and elements are already set up
if (typeof window.exploratoryTestingCropperInitialized === 'undefined') {
    window.exploratoryTestingCropperInitialized = true;

    let selectionBox = null; // Will hold the div element
    let isDrawing = false;   // True when mouse is down and dragging
    let startX, startY;      // Initial mouse coordinates on mousedown
    let selectionInstructionNotification = null; // For the notification message

    // Store data received from popup
    let currentAnnotationType = null;
    let currentDescription = null;

    function getMessage(messageKey, substitutions, fallbackValue = '') {
        try {
            const localizedMessage = chrome?.i18n?.getMessage(messageKey, substitutions);
            if (localizedMessage) {
                return localizedMessage;
            }
        } catch {
            // Ignore lookup errors and use fallback below.
        }

        return fallbackValue;
    }

    // Helper function to check if extension context is valid
    function isExtensionContextValid() {
        try {
            // Multiple checks to ensure extension context is valid
            if (!chrome || !chrome.runtime) {
                return false;
            }

            // Check if runtime.id exists
            if (chrome.runtime.id === undefined) {
                return false;
            }

            // Try to access sendMessage to ensure it's available
            if (typeof chrome.runtime.sendMessage !== 'function') {
                return false;
            }

            // Additional check: try to get the URL (this will fail if context is invalid)
            try {
                chrome.runtime.getURL('');
                return true;
            } catch (e) {
                return false;
            }
        } catch (e) {
            return false;
        }
    }

    // Helper function to safely send messages to background
    function safeSendMessage(message, callback) {
        // Comprehensive validation before attempting to send
        if (!isExtensionContextValid()) {
            // Silently show notification without console warnings
            showExtensionReloadNotification();
            return;
        }

        try {
            chrome.runtime.sendMessage(message, function(response) {
                // Handle async errors from chrome.runtime.lastError
                if (chrome.runtime.lastError) {
                    const errorMessage = chrome.runtime.lastError.message;
                    if (errorMessage.includes("Extension context invalidated") ||
                        errorMessage.includes("message port closed") ||
                        errorMessage.includes("receiving end does not exist")) {
                        // Silently show notification without console warnings
                        showExtensionReloadNotification();
                    } else {
                        console.error("Content script: Error sending message:", errorMessage);
                    }
                } else if (callback) {
                    callback(response);
                }
            });
        } catch (error) {
            // Catch synchronous errors
            if (error.message && (error.message.includes("Extension context invalidated") ||
                                  error.message.includes("message port closed"))) {
                // Silently show notification without console warnings
                showExtensionReloadNotification();
            } else {
                console.error("Content script: Unexpected error sending message:", error);
            }
        }
    }

    // Show notification to reload page when extension context is invalidated
    function showExtensionReloadNotification() {
        // Notification disabled - function does nothing
        // Errors are handled silently without user notification
    }

    // This listener is added once per page load/script injection context
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "startSelection") {
            // Check if extension context is valid
            if (!isExtensionContextValid()) {
                // Silently show notification without console warnings
                showExtensionReloadNotification();
                return true;
            }

            // Store annotation details
            currentAnnotationType = request.annotationType;
            currentDescription = request.description;

            isDrawing = false;
            if (selectionBox) { // Hide if it exists from a previous attempt
                selectionBox.style.display = 'none';
            }
            initSelection(); // Prepare for a new selection
            sendResponse({ status: "selectionStarted" }); // Response back to popup.js
        }
        // For safety with multiple potential message types, keeping 'return true;'
        // as other handlers (if added in the future) might use sendResponse asynchronously.
        return true;
    });

    function createSelectionBoxElement() {
        // Check if the element already exists
        let existingBox = document.getElementById('exploratoryTestingSelectionBox');
        if (!existingBox) {
            let box = document.createElement('div');
            box.id = 'exploratoryTestingSelectionBox';
            box.style.position = 'fixed';
            box.style.backgroundColor = 'rgba(0, 100, 255, 0.3)';
            box.style.border = '1px dashed #0064ff';
            box.style.zIndex = '2147483647'; // Max z-index
            box.style.cursor = 'crosshair';
            box.style.pointerEvents = 'none';
            box.style.display = 'none';
            document.body.appendChild(box);
            return box;
        }
        return existingBox;
    }

    function showSelectionNotification(message) {
        removeSelectionNotification();
        selectionInstructionNotification = document.createElement('div');
        selectionInstructionNotification.id = 'exploratoryTestingSelectionNotification';
        selectionInstructionNotification.textContent = message;
        selectionInstructionNotification.style.position = 'fixed';
        selectionInstructionNotification.style.top = '20px';
        selectionInstructionNotification.style.left = '50%';
        selectionInstructionNotification.style.transform = 'translateX(-50%)';
        selectionInstructionNotification.style.padding = '10px 20px';
        selectionInstructionNotification.style.backgroundColor = 'rgba(0,0,0,0.75)';
        selectionInstructionNotification.style.color = 'white';
        selectionInstructionNotification.style.fontSize = '16px';
        selectionInstructionNotification.style.borderRadius = '5px';
        selectionInstructionNotification.style.zIndex = '2147483646';
        selectionInstructionNotification.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
        document.body.appendChild(selectionInstructionNotification);
    }

    function removeSelectionNotification() {
        if (selectionInstructionNotification && selectionInstructionNotification.parentNode) {
            selectionInstructionNotification.parentNode.removeChild(selectionInstructionNotification);
            selectionInstructionNotification = null;
        }
    }

    function initSelection() {
        if (!selectionBox) {
            console.error("Selection box element not found or created!");
            return;
        }
        selectionBox.style.left = '0px';
        selectionBox.style.top = '0px';
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        selectionBox.style.display = 'none';

        cleanUpAllSelectionListeners();
        removeSelectionNotification();
        showSelectionNotification(
            getMessage('selectionInstruction', undefined, 'Click and drag to select an area. Press Esc to cancel.')
        );

        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('keydown', handleKeyDown);
    }

    function handleMouseDown(event) {
        event.preventDefault();
        event.stopPropagation();

        isDrawing = true;
        startX = event.clientX;
        startY = event.clientY;

        selectionBox.style.left = startX + 'px';
        selectionBox.style.top = startY + 'px';
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        selectionBox.style.display = 'block';

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(event) {
        if (!isDrawing) return;
        event.preventDefault();
        event.stopPropagation();

        let currentX = event.clientX;
        let currentY = event.clientY;

        let newX = Math.min(startX, currentX);
        let newY = Math.min(startY, currentY);
        let width = Math.abs(currentX - startX);
        let height = Math.abs(currentY - startY);

        selectionBox.style.left = newX + 'px';
        selectionBox.style.top = newY + 'px';
        selectionBox.style.width = width + 'px';
        selectionBox.style.height = height + 'px';
    }

    function handleMouseUp(event) {
        if (!isDrawing) return;
        isDrawing = false;
        event.preventDefault();
        event.stopPropagation();

        cleanUpInProgressSelectionListeners();

        let finalX = parseInt(selectionBox.style.left, 10);
        let finalY = parseInt(selectionBox.style.top, 10);
        let finalWidth = parseInt(selectionBox.style.width, 10);
        let finalHeight = parseInt(selectionBox.style.height, 10);

        // Hide selection box and notification IMMEDIATELY
        if (selectionBox) selectionBox.style.display = 'none';
        removeSelectionNotification();

        if (finalWidth > 0 && finalHeight > 0) {
            // Wait for the browser to re-render without the selection box
            // This ensures the screenshot won't include the blue overlay
            requestAnimationFrame(() => {
                setTimeout(() => {
                    // Capture the selected area and open annotation editor
                    captureAndOpenAnnotationEditor(finalX, finalY, finalWidth, finalHeight);
                }, 50); // Wait 50ms for the DOM to fully update
            });
        } else {
            safeSendMessage({
                type: "selectionCancelled",
                annotationType: currentAnnotationType
            });
            // Reset stored type and description
            currentAnnotationType = null;
            currentDescription = null;
        }
    }

    // Capture the cropped area and open the annotation editor
    function captureAndOpenAnnotationEditor(x, y, width, height) {
        const dpr = window.devicePixelRatio || 1;

        // Request screenshot from background
        safeSendMessage({
            type: "requestCropScreenshot",
            coordinates: {
                x: x * dpr,
                y: y * dpr,
                width: width * dpr,
                height: height * dpr
            }
        }, (response) => {
            if (response && response.croppedImageData) {
                // Open annotation editor with the cropped image
                openAnnotationEditor(response.croppedImageData);
            } else {
                console.error("Content script: Failed to get cropped screenshot");
                safeSendMessage({
                    type: "selectionCancelled",
                    annotationType: currentAnnotationType
                });
                currentAnnotationType = null;
                currentDescription = null;
            }
        });
    }

    // Open annotation editor overlay
    function openAnnotationEditor(imageData) {
        // Create iframe for annotation editor
        const iframe = document.createElement('iframe');
        iframe.id = 'exploratoryTestingAnnotationEditor';
        iframe.style.position = 'fixed';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.zIndex = '2147483647';
        iframe.src = chrome.runtime.getURL('js/annotation_editor.html');

        document.body.appendChild(iframe);

        // Wait for iframe to load, then send image data
        iframe.addEventListener('load', () => {
            iframe.contentWindow.postMessage({
                type: 'initAnnotationEditor',
                imageData: imageData
            }, '*');
        });

        // Listen for messages from annotation editor
        const messageHandler = (event) => {
            if (event.data.type === 'annotationComplete') {
                // Close editor
                closeAnnotationEditor();

                // Send annotated image to background
                safeSendMessage({
                    type: "csToBgCropData",
                    annotatedImageData: event.data.imageData,
                    annotationType: currentAnnotationType,
                    description: currentDescription
                });
                // Reset and cleanup
                currentAnnotationType = null;
                currentDescription = null;
                window.removeEventListener('message', messageHandler);
            } else if (event.data.type === 'annotationCancelled') {
                // Close editor and cancel
                closeAnnotationEditor();

                safeSendMessage({
                    type: "selectionCancelled",
                    annotationType: currentAnnotationType
                });

                // Reset and cleanup
                currentAnnotationType = null;
                currentDescription = null;
                window.removeEventListener('message', messageHandler);
            }
        };

        window.addEventListener('message', messageHandler);
    }

    // Close annotation editor
    function closeAnnotationEditor() {
        const iframe = document.getElementById('exploratoryTestingAnnotationEditor');
        if (iframe && iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
        }
    }

    function handleKeyDown(event) {
        if (event.key === 'Escape') {
            if (isDrawing) {
                isDrawing = false;
            }
            if (selectionBox) selectionBox.style.display = 'none';
            cleanUpAllSelectionListeners();
            removeSelectionNotification();

            safeSendMessage({
                type: "selectionCancelled",
                annotationType: currentAnnotationType // Include type
            });
            // Reset stored type and description
            currentAnnotationType = null;
            currentDescription = null;
        }
    }

    function cleanUpInProgressSelectionListeners() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }

    function cleanUpAllSelectionListeners() {
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('keydown', handleKeyDown);
    }

    // Initial creation of the selection box
    selectionBox = createSelectionBoxElement();

}
else {
}

if (typeof window.qaCompanionRecorderInitialized === 'undefined') {
    window.qaCompanionRecorderInitialized = true;

    let recorderEnabled = false;
    let lastSyncedRecordingId = '';
    let replayHighlightElement = null;
    let replayHighlightTimer = null;
    const pendingInputTimers = new Map();
    const pendingClickTimers = new Map();
    let lastRecordedDragSource = null;
    let activeReplayDragState = null;

    function getCookieValue(cookieName) {
        if (typeof cookieName !== 'string' || cookieName === '' || typeof document.cookie !== 'string') {
            return '';
        }

        const cookiePrefix = `${cookieName}=`;
        return document.cookie
            .split(';')
            .map((cookiePart) => cookiePart.trim())
            .find((cookiePart) => cookiePart.startsWith(cookiePrefix))
            ?.slice(cookiePrefix.length) || '';
    }

    function decodeBase64UrlSegment(base64UrlValue) {
        if (typeof base64UrlValue !== 'string' || base64UrlValue === '') {
            return '';
        }

        const normalizedValue = base64UrlValue
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const paddedValue = normalizedValue + '='.repeat((4 - (normalizedValue.length % 4)) % 4);
        try {
            return atob(paddedValue);
        } catch {
            return '';
        }
    }

    function decodeJwtPayload(tokenValue) {
        if (typeof tokenValue !== 'string' || tokenValue === '') {
            return null;
        }

        const tokenParts = tokenValue.split('.');
        if (tokenParts.length < 2) {
            return null;
        }

        const payloadJson = decodeBase64UrlSegment(tokenParts[1]);
        if (payloadJson === '') {
            return null;
        }

        try {
            return JSON.parse(payloadJson);
        } catch {
            return null;
        }
    }

    function deriveCurrentUserInfoFromToken() {
        const tokenValue = getCookieValue('token_global');
        if (tokenValue === '') {
            return null;
        }

        const payloadData = decodeJwtPayload(tokenValue);
        if (!payloadData || typeof payloadData !== 'object') {
            return null;
        }

        return {
            userId: Number.isFinite(payloadData.userId) ? String(payloadData.userId) : '',
            identity: typeof payloadData.identity === 'string' ? payloadData.identity : '',
            identityLogin: typeof payloadData.identityLogin === 'string' ? payloadData.identityLogin : '',
            identityEmail: typeof payloadData.identityEmail === 'string' ? payloadData.identityEmail : '',
            identityPhone: typeof payloadData.identityPhone === 'string' ? payloadData.identityPhone : '',
            name: typeof payloadData.name === 'string' ? payloadData.name : '',
            surname: typeof payloadData.surname === 'string' ? payloadData.surname : '',
            email: typeof payloadData.email === 'string' ? payloadData.email : '',
            uiLanguage: typeof payloadData.uiLanguage === 'string' ? payloadData.uiLanguage : '',
            locale: typeof payloadData.locale === 'string' ? payloadData.locale : '',
            serviceLocale: typeof payloadData.serviceLocale === 'string' ? payloadData.serviceLocale : '',
            avatarUrl: typeof payloadData.avatarUrl === 'string' ? payloadData.avatarUrl : '',
            birthday: typeof payloadData.birthday === 'string' ? payloadData.birthday : '',
            roles: Array.isArray(payloadData.roles)
                ? payloadData.roles.filter((roleValue) => typeof roleValue === 'string' && roleValue !== '')
                : []
        };
    }

    function buildCssPath(targetElement) {
        if (!targetElement || targetElement.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }

        const pathParts = [];
        let currentElement = targetElement;

        while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE && currentElement !== document.body) {
            let selectorPart = currentElement.tagName.toLowerCase();
            if (currentElement.id) {
                selectorPart += `#${currentElement.id}`;
                pathParts.unshift(selectorPart);
                break;
            }

            let siblingIndex = 1;
            let previousSibling = currentElement.previousElementSibling;
            while (previousSibling) {
                if (previousSibling.tagName === currentElement.tagName) {
                    siblingIndex += 1;
                }
                previousSibling = previousSibling.previousElementSibling;
            }

            selectorPart += `:nth-of-type(${siblingIndex})`;
            pathParts.unshift(selectorPart);
            currentElement = currentElement.parentElement;
        }

        return pathParts.join(' > ');
    }

    function getComposedTargetElement(event) {
        const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : [];
        return eventPath.find((pathItem) => pathItem instanceof HTMLElement)
            || (event.target instanceof HTMLElement ? event.target : null);
    }

    function isFileInputElement(targetElement) {
        return targetElement instanceof HTMLInputElement && targetElement.type === 'file';
    }

    function getAssociatedFileInput(targetElement) {
        if (isFileInputElement(targetElement)) {
            return targetElement;
        }

        if (targetElement instanceof HTMLLabelElement && targetElement.control instanceof HTMLInputElement && targetElement.control.type === 'file') {
            return targetElement.control;
        }

        return null;
    }

    function buildShadowPath(targetElement) {
        const shadowPath = [];
        let currentRoot = targetElement?.getRootNode?.();
        while (currentRoot instanceof ShadowRoot) {
            if (!(currentRoot.host instanceof HTMLElement)) {
                break;
            }

            shadowPath.unshift(buildElementLocator(currentRoot.host));
            currentRoot = currentRoot.host.getRootNode();
        }

        return shadowPath;
    }

    function buildTargetPathKey(targetElement) {
        const primaryLocator = buildElementLocator(targetElement);
        const shadowPath = buildShadowPath(targetElement);
        return JSON.stringify({
            locator: primaryLocator,
            shadowPath
        });
    }

    function collectPointerData(event, targetElement) {
        if (!(event instanceof MouseEvent) || !(targetElement instanceof HTMLElement)) {
            return null;
        }

        const targetRect = targetElement.getBoundingClientRect();
        return {
            clientX: event.clientX,
            clientY: event.clientY,
            offsetX: Math.round(event.clientX - targetRect.left),
            offsetY: Math.round(event.clientY - targetRect.top),
            button: event.button
        };
    }

    function shouldRecordHoverTarget(targetElement) {
        if (!(targetElement instanceof HTMLElement)) {
            return false;
        }

        return targetElement.matches('.hover-card, [data-record-hover], [data-hover-target]');
    }

    function buildElementLocator(targetElement) {
        if (targetElement.id) {
            return {
                strategy: 'id',
                value: targetElement.id
            };
        }

        if (targetElement.name) {
            return {
                strategy: 'name',
                value: targetElement.name
            };
        }

        const dataAttribute = Array.from(targetElement.attributes || []).find((attributeItem) => {
            return attributeItem.name.startsWith('data-') && attributeItem.value !== '';
        });
        if (dataAttribute) {
            return {
                strategy: 'data',
                name: dataAttribute.name,
                value: dataAttribute.value
            };
        }

        return {
            strategy: 'css',
            value: buildCssPath(targetElement)
        };
    }

    function normalizeRecordedValue(targetElement) {
        if (targetElement.tagName === 'SELECT') {
            return targetElement.value || '';
        }

        if (targetElement.type === 'checkbox' || targetElement.type === 'radio') {
            return targetElement.checked ? 'checked' : 'unchecked';
        }

        if (targetElement.isContentEditable) {
            return targetElement.innerText || '';
        }

        return targetElement.value || '';
    }

    function createRecordedStep(stepType, targetElement, extraFields = {}) {
        const stepPayload = {
            type: stepType,
            url: window.location.href,
            locator: buildElementLocator(targetElement),
            value: normalizeRecordedValue(targetElement),
            inputType: targetElement.type || '',
            tagName: targetElement.tagName || '',
            text: (targetElement.textContent || '').trim().slice(0, 120),
            shadowPath: buildShadowPath(targetElement),
            replayPolicy: 'auto',
            replayHint: ''
        };

        return {
            ...stepPayload,
            ...extraFields
        };
    }

    function postRecordedStep(stepType, targetElement, extraFields = {}) {
        try {
            safeSendMessage({
                type: 'appendRecordedStep',
                step: createRecordedStep(stepType, targetElement, extraFields)
            });
        } catch (error) {
            if (!error.message || !error.message.includes('Extension context invalidated')) {
                console.error('Recorder: failed to send step.', error);
            }
        }
    }

    function getLocatorKey(locatorData) {
        if (!locatorData) {
            return 'unknown';
        }

        return [
            locatorData.strategy || '',
            locatorData.name || '',
            locatorData.value || ''
        ].join(':');
    }

    function clearPendingClickRecord(locatorKey) {
        const pendingClick = pendingClickTimers.get(locatorKey);
        if (!pendingClick) {
            return;
        }

        clearTimeout(pendingClick.timerId);
        pendingClickTimers.delete(locatorKey);
    }

    function flushPendingInputRecords() {
        for (const [locatorKey, timerData] of pendingInputTimers.entries()) {
            clearTimeout(timerData.timerId);
            postRecordedStep(timerData.stepType, timerData.targetElement);
            pendingInputTimers.delete(locatorKey);
        }
    }

    function flushPendingClickRecords() {
        for (const [locatorKey, timerData] of pendingClickTimers.entries()) {
            clearTimeout(timerData.timerId);
            postRecordedStep(timerData.stepType, timerData.targetElement, timerData.extraFields);
            pendingClickTimers.delete(locatorKey);
        }
    }

    function getRecordedClickTarget(event) {
        const originalTarget = getComposedTargetElement(event);
        if (!originalTarget) {
            return null;
        }

        const explicitInteractiveTarget = originalTarget.closest(
            'button, a, input, textarea, select, label, summary, option, [role="button"], [contenteditable="true"], [tabindex], [onclick]'
        );
        if (explicitInteractiveTarget) {
            return explicitInteractiveTarget;
        }

        let currentElement = originalTarget;
        while (currentElement && currentElement !== document.body && currentElement !== document.documentElement) {
            if (currentElement instanceof HTMLElement) {
                return currentElement;
            }

            currentElement = currentElement.parentElement;
        }

        return null;
    }

    function scheduleClickRecord(stepType, targetElement, extraFields = {}) {
        const locatorKey = `${stepType}:${buildTargetPathKey(targetElement)}`;
        clearPendingClickRecord(locatorKey);
        const timerId = setTimeout(() => {
            postRecordedStep(stepType, targetElement, extraFields);
            pendingClickTimers.delete(locatorKey);
        }, 260);
        pendingClickTimers.set(locatorKey, {
            timerId,
            stepType,
            targetElement,
            extraFields
        });
    }

    function shouldRecordClickImmediately(targetElement) {
        if (!(targetElement instanceof HTMLElement)) {
            return false;
        }

        return targetElement.matches(
            'a, button, summary, input[type="submit"], input[type="button"], [role="button"]'
        );
    }

    function handleRecordedClick(event) {
        if (!recorderEnabled) {
            return;
        }

        const targetElement = getRecordedClickTarget(event);
        if (!targetElement) {
            return;
        }

        if (getAssociatedFileInput(targetElement)) {
            return;
        }

        flushPendingInputRecords();
        const clickExtraFields = {
            pointer: collectPointerData(event, targetElement)
        };
        if (shouldRecordClickImmediately(targetElement)) {
            postRecordedStep('click', targetElement, clickExtraFields);
            return;
        }

        scheduleClickRecord('click', targetElement, clickExtraFields);
    }

    function handleRecordedDoubleClick(event) {
        if (!recorderEnabled) {
            return;
        }

        const targetElement = getRecordedClickTarget(event);
        if (!targetElement) {
            return;
        }

        flushPendingInputRecords();
        clearPendingClickRecord(`click:${buildTargetPathKey(targetElement)}`);
        postRecordedStep('doubleClick', targetElement, {
            pointer: collectPointerData(event, targetElement)
        });
    }

    function handleRecordedContextMenu(event) {
        if (!recorderEnabled) {
            return;
        }

        const targetElement = getRecordedClickTarget(event);
        if (!targetElement) {
            return;
        }

        flushPendingInputRecords();
        postRecordedStep('contextMenu', targetElement, {
            pointer: collectPointerData(event, targetElement)
        });
    }

    function scheduleInputRecord(stepType, targetElement) {
        const locatorData = buildElementLocator(targetElement);
        const locatorKey = `${stepType}:${getLocatorKey(locatorData)}`;
        const activeTimer = pendingInputTimers.get(locatorKey);
        if (activeTimer) {
            clearTimeout(activeTimer.timerId);
        }

        const timerId = setTimeout(() => {
            postRecordedStep(stepType, targetElement);
            pendingInputTimers.delete(locatorKey);
        }, 300);

        pendingInputTimers.set(locatorKey, {
            timerId,
            stepType,
            targetElement
        });
    }

    function handleRecordedInput(event) {
        if (!recorderEnabled) {
            return;
        }

        const targetElement = getComposedTargetElement(event);
        if (!(targetElement instanceof HTMLElement)) {
            return;
        }

        if (isFileInputElement(targetElement)) {
            return;
        }

        if (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA' || targetElement.isContentEditable) {
            scheduleInputRecord('input', targetElement);
        }
    }

    function handleRecordedChange(event) {
        if (!recorderEnabled) {
            return;
        }

        const targetElement = getComposedTargetElement(event);
        if (!(targetElement instanceof HTMLElement)) {
            return;
        }

        if (isFileInputElement(targetElement)) {
            const fileNames = Array.from(targetElement.files || [])
                .map((fileItem) => fileItem.name)
                .filter((fileName) => typeof fileName === 'string' && fileName !== '');
            postRecordedStep('file', targetElement, {
                value: fileNames.join(', '),
                replayPolicy: 'manual',
                replayHint: getMessage(
                    'popupRecorderManualFileReplay',
                    undefined,
                    'Replay paused. Choose the file manually to continue.'
                )
            });
            return;
        }

        postRecordedStep('change', targetElement);
    }

    function handleRecordedSubmit(event) {
        if (!recorderEnabled) {
            return;
        }

        const targetElement = getComposedTargetElement(event);
        if (!(targetElement instanceof HTMLElement)) {
            return;
        }

        postRecordedStep('submit', targetElement);
    }

    function handleRecordedHoverEnter(event) {
        if (!recorderEnabled) {
            return;
        }

        const targetElement = getComposedTargetElement(event);
        if (!shouldRecordHoverTarget(targetElement)) {
            return;
        }

        if (event.relatedTarget instanceof Node && targetElement.contains(event.relatedTarget)) {
            return;
        }

        postRecordedStep('hoverEnter', targetElement, {
            pointer: collectPointerData(event, targetElement)
        });
    }

    function handleRecordedHoverLeave(event) {
        if (!recorderEnabled) {
            return;
        }

        const targetElement = getComposedTargetElement(event);
        if (!shouldRecordHoverTarget(targetElement)) {
            return;
        }

        if (event.relatedTarget instanceof Node && targetElement.contains(event.relatedTarget)) {
            return;
        }

        postRecordedStep('hoverLeave', targetElement, {
            pointer: collectPointerData(event, targetElement)
        });
    }

    function handleRecordedDragStart(event) {
        if (!recorderEnabled) {
            return;
        }

        const targetElement = getComposedTargetElement(event);
        if (!(targetElement instanceof HTMLElement)) {
            return;
        }

        lastRecordedDragSource = targetElement;
        postRecordedStep('dragStart', targetElement, {
            pointer: collectPointerData(event, targetElement)
        });
    }

    function handleRecordedDrop(event) {
        if (!recorderEnabled) {
            return;
        }

        const targetElement = getComposedTargetElement(event);
        if (!(targetElement instanceof HTMLElement)) {
            return;
        }

        const sourceTarget = lastRecordedDragSource instanceof HTMLElement ? lastRecordedDragSource : null;
        postRecordedStep('drop', targetElement, {
            pointer: collectPointerData(event, targetElement),
            sourceLocator: sourceTarget ? buildElementLocator(sourceTarget) : null,
            sourceShadowPath: sourceTarget ? buildShadowPath(sourceTarget) : []
        });
        lastRecordedDragSource = null;
    }

    function attachRecorderListeners() {
        document.addEventListener('click', handleRecordedClick, true);
        document.addEventListener('dblclick', handleRecordedDoubleClick, true);
        document.addEventListener('contextmenu', handleRecordedContextMenu, true);
        document.addEventListener('input', handleRecordedInput, true);
        document.addEventListener('change', handleRecordedChange, true);
        document.addEventListener('submit', handleRecordedSubmit, true);
        document.addEventListener('mouseover', handleRecordedHoverEnter, true);
        document.addEventListener('mouseout', handleRecordedHoverLeave, true);
        document.addEventListener('dragstart', handleRecordedDragStart, true);
        document.addEventListener('drop', handleRecordedDrop, true);
        window.addEventListener('pagehide', flushPendingClickRecords, true);
        window.addEventListener('beforeunload', flushPendingClickRecords, true);
    }

    function detachRecorderListeners() {
        document.removeEventListener('click', handleRecordedClick, true);
        document.removeEventListener('dblclick', handleRecordedDoubleClick, true);
        document.removeEventListener('contextmenu', handleRecordedContextMenu, true);
        document.removeEventListener('input', handleRecordedInput, true);
        document.removeEventListener('change', handleRecordedChange, true);
        document.removeEventListener('submit', handleRecordedSubmit, true);
        document.removeEventListener('mouseover', handleRecordedHoverEnter, true);
        document.removeEventListener('mouseout', handleRecordedHoverLeave, true);
        document.removeEventListener('dragstart', handleRecordedDragStart, true);
        document.removeEventListener('drop', handleRecordedDrop, true);
        window.removeEventListener('pagehide', flushPendingClickRecords, true);
        window.removeEventListener('beforeunload', flushPendingClickRecords, true);

        flushPendingInputRecords();
        flushPendingClickRecords();
        pendingInputTimers.clear();
        pendingClickTimers.clear();
        lastRecordedDragSource = null;
        activeReplayDragState = null;
    }

    function setRecorderMode(isRecording) {
        if (recorderEnabled === isRecording) {
            return;
        }

        recorderEnabled = isRecording;
        if (recorderEnabled) {
            attachRecorderListeners();
        } else {
            detachRecorderListeners();
        }
    }

    function syncRecorderMode() {
        safeSendMessage({ type: 'getRecorderModeForSender' }, (response) => {
            const isRecording = Boolean(response && response.isRecording);
            setRecorderMode(isRecording);

            if (!isRecording) {
                lastSyncedRecordingId = '';
                return;
            }

            const nextRecordingId = typeof response.recordingId === 'string' ? response.recordingId : '';
            const lastKnownUrl = typeof response.lastKnownUrl === 'string' ? response.lastKnownUrl : '';
            if (nextRecordingId !== '' && nextRecordingId !== lastSyncedRecordingId) {
                lastSyncedRecordingId = nextRecordingId;
            }

            if (lastKnownUrl !== '' && lastKnownUrl !== window.location.href) {
                postRecordedStep('navigation', document.body || document.documentElement);
            }
        });
    }

    function findElementByLocator(locatorData, rootNode = document) {
        if (!locatorData || typeof locatorData !== 'object' || !rootNode) {
            return null;
        }

        if (locatorData.strategy === 'id') {
            if (rootNode instanceof Document) {
                return rootNode.getElementById(locatorData.value);
            }

            return rootNode.querySelector(`#${CSS.escape(locatorData.value)}`);
        }

        if (locatorData.strategy === 'name') {
            if (rootNode instanceof Document) {
                const namedElements = rootNode.getElementsByName(locatorData.value);
                return namedElements.length > 0 ? namedElements[0] : null;
            }

            return rootNode.querySelector(`[name="${locatorData.value.replace(/"/g, '\\"')}"]`);
        }

        if (locatorData.strategy === 'data' && locatorData.name) {
            return rootNode.querySelector(`[${locatorData.name}="${locatorData.value.replace(/"/g, '\\"')}"]`);
        }

        if (locatorData.strategy === 'css') {
            try {
                return rootNode.querySelector(locatorData.value);
            } catch {
                return null;
            }
        }

        return null;
    }

    function findReplayTarget(stepData = {}) {
        if (!Array.isArray(stepData.shadowPath) || stepData.shadowPath.length === 0) {
            return findElementByLocator(stepData.locator);
        }

        let currentRoot = document;
        for (const hostLocator of stepData.shadowPath) {
            const hostElement = findElementByLocator(hostLocator, currentRoot);
            if (!(hostElement instanceof HTMLElement) || !(hostElement.shadowRoot instanceof ShadowRoot)) {
                return null;
            }

            currentRoot = hostElement.shadowRoot;
        }

        return findElementByLocator(stepData.locator, currentRoot);
    }

    function createReplayMouseEvent(targetElement, eventType, stepData = {}, overrides = {}) {
        const targetRect = targetElement.getBoundingClientRect();
        const pointerData = stepData.pointer || {};
        const clientX = typeof pointerData.clientX === 'number'
            ? pointerData.clientX
            : Math.round(targetRect.left + (typeof pointerData.offsetX === 'number' ? pointerData.offsetX : targetRect.width / 2));
        const clientY = typeof pointerData.clientY === 'number'
            ? pointerData.clientY
            : Math.round(targetRect.top + (typeof pointerData.offsetY === 'number' ? pointerData.offsetY : targetRect.height / 2));

        return new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX,
            clientY,
            button: typeof pointerData.button === 'number' ? pointerData.button : 0,
            ...overrides
        });
    }

    function dispatchReplayMouseSequence(targetElement, stepData, eventTypes, overrides = {}) {
        eventTypes.forEach((eventType) => {
            targetElement.dispatchEvent(createReplayMouseEvent(targetElement, eventType, stepData, overrides));
        });
    }

    function createReplayDataTransfer() {
        if (typeof DataTransfer === 'function') {
            return new DataTransfer();
        }

        return {
            data: {},
            setData(dataType, dataValue) {
                this.data[dataType] = String(dataValue);
            },
            getData(dataType) {
                return this.data[dataType] || '';
            }
        };
    }

    function createReplayDragEvent(targetElement, eventType, stepData = {}, dataTransfer = null) {
        if (typeof DragEvent === 'function') {
            return new DragEvent(eventType, {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: stepData.pointer?.clientX || 0,
                clientY: stepData.pointer?.clientY || 0,
                dataTransfer: dataTransfer || createReplayDataTransfer()
            });
        }

        const fallbackEvent = createReplayMouseEvent(targetElement, eventType, stepData);
        Object.defineProperty(fallbackEvent, 'dataTransfer', {
            configurable: true,
            enumerable: true,
            value: dataTransfer || createReplayDataTransfer()
        });
        return fallbackEvent;
    }

    function dispatchInputEvents(targetElement) {
        targetElement.dispatchEvent(new Event('input', { bubbles: true }));
        targetElement.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function ensureReplayHighlightElement() {
        if (replayHighlightElement) {
            return replayHighlightElement;
        }

        replayHighlightElement = document.createElement('div');
        replayHighlightElement.style.position = 'fixed';
        replayHighlightElement.style.border = '2px solid #6366f1';
        replayHighlightElement.style.boxShadow = '0 0 0 4px rgba(99, 102, 241, 0.18)';
        replayHighlightElement.style.borderRadius = '8px';
        replayHighlightElement.style.pointerEvents = 'none';
        replayHighlightElement.style.zIndex = '2147483647';
        replayHighlightElement.style.display = 'none';
        document.documentElement.appendChild(replayHighlightElement);
        return replayHighlightElement;
    }

    function hideReplayHighlight() {
        if (replayHighlightTimer) {
            clearTimeout(replayHighlightTimer);
            replayHighlightTimer = null;
        }

        if (replayHighlightElement) {
            replayHighlightElement.style.display = 'none';
        }
    }

    function highlightReplayTarget(targetElement) {
        const highlightBox = ensureReplayHighlightElement();
        const elementRect = targetElement.getBoundingClientRect();
        highlightBox.style.top = `${Math.max(elementRect.top - 4, 0)}px`;
        highlightBox.style.left = `${Math.max(elementRect.left - 4, 0)}px`;
        highlightBox.style.width = `${Math.max(elementRect.width + 8, 0)}px`;
        highlightBox.style.height = `${Math.max(elementRect.height + 8, 0)}px`;
        highlightBox.style.display = 'block';

        if (replayHighlightTimer) {
            clearTimeout(replayHighlightTimer);
        }

        replayHighlightTimer = setTimeout(() => {
            hideReplayHighlight();
        }, 1200);
    }

    function applyRecordedValue(targetElement, stepData) {
        const { inputType, value } = stepData;

        if (targetElement.tagName === 'SELECT') {
            targetElement.value = value;
            dispatchInputEvents(targetElement);
            return;
        }

        if (inputType === 'checkbox' || inputType === 'radio') {
            targetElement.checked = value === 'checked';
            targetElement.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }

        if (targetElement.isContentEditable) {
            targetElement.innerText = value;
            dispatchInputEvents(targetElement);
            return;
        }

        targetElement.focus();
        targetElement.value = value;
        dispatchInputEvents(targetElement);
    }

    async function replayStep(stepData) {
        const targetElement = findReplayTarget(stepData);
        if (!targetElement) {
            return {
                success: false,
                reason: 'target-not-found',
                error: getMessage('errorReplayTargetNotFound', ['?'], 'Target element not found.')
            };
        }

        targetElement.scrollIntoView({ block: 'center', inline: 'center' });
        highlightReplayTarget(targetElement);

        if (stepData.type === 'input' || stepData.type === 'change') {
            applyRecordedValue(targetElement, stepData);
            return { success: true };
        }

        if (stepData.type === 'file') {
            return {
                success: true,
                manualStop: true,
                notice: stepData.replayHint || getMessage(
                    'popupRecorderManualFileReplay',
                    undefined,
                    'Replay paused. Choose the file manually to continue.'
                )
            };
        }

        if (stepData.type === 'submit') {
            if (typeof targetElement.requestSubmit === 'function') {
                targetElement.requestSubmit();
            } else {
                targetElement.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }

            return { success: true };
        }

        if (stepData.type === 'click') {
            dispatchReplayMouseSequence(targetElement, stepData, ['mousedown', 'mouseup', 'click']);
            return { success: true };
        }

        if (stepData.type === 'doubleClick') {
            dispatchReplayMouseSequence(targetElement, stepData, ['mousedown', 'mouseup', 'click', 'mousedown', 'mouseup', 'click', 'dblclick']);
            return { success: true };
        }

        if (stepData.type === 'contextMenu') {
            dispatchReplayMouseSequence(targetElement, stepData, ['contextmenu'], { button: 2 });
            return { success: true };
        }

        if (stepData.type === 'hoverEnter') {
            dispatchReplayMouseSequence(targetElement, stepData, ['mouseover', 'mouseenter']);
            return { success: true };
        }

        if (stepData.type === 'hoverLeave') {
            dispatchReplayMouseSequence(targetElement, stepData, ['mouseout', 'mouseleave']);
            return { success: true };
        }

        if (stepData.type === 'dragStart') {
            const dataTransfer = createReplayDataTransfer();
            if (stepData.value) {
                try {
                    dataTransfer.setData('text/plain', stepData.value);
                } catch {
                    // Ignore custom data transfer limitations.
                }
            }

            targetElement.dispatchEvent(createReplayDragEvent(targetElement, 'dragstart', stepData, dataTransfer));
            activeReplayDragState = {
                sourceElement: targetElement,
                dataTransfer
            };
            return { success: true };
        }

        if (stepData.type === 'drop') {
            const sourceElement = activeReplayDragState?.sourceElement
                || findReplayTarget({
                    locator: stepData.sourceLocator,
                    shadowPath: stepData.sourceShadowPath
                });
            const dataTransfer = activeReplayDragState?.dataTransfer || createReplayDataTransfer();
            targetElement.dispatchEvent(createReplayDragEvent(targetElement, 'dragenter', stepData, dataTransfer));
            targetElement.dispatchEvent(createReplayDragEvent(targetElement, 'dragover', stepData, dataTransfer));
            targetElement.dispatchEvent(createReplayDragEvent(targetElement, 'drop', stepData, dataTransfer));
            if (sourceElement instanceof HTMLElement) {
                sourceElement.dispatchEvent(createReplayDragEvent(sourceElement, 'dragend', stepData, dataTransfer));
            }
            activeReplayDragState = null;
            return { success: true };
        }

        return {
            success: false,
            error: `${getMessage('stepTypeUnknown', undefined, 'Action')}: ${stepData.type}.`
        };
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'setRecordingMode') {
            if (!request.isRecording) {
                flushPendingInputRecords();
            }
            setRecorderMode(Boolean(request.isRecording));
            sendResponse({ status: 'ok', isRecording: recorderEnabled });
            return true;
        }

        if (request.type === 'getPageEnvironmentInfo') {
            const colorScheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light';
            const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'reduce'
                : 'no-preference';

            sendResponse({
                status: 'ok',
                pageTitle: document.title || '',
                pageUrl: window.location.href,
                viewportWidth: window.innerWidth || 0,
                viewportHeight: window.innerHeight || 0,
                screenWidth: window.screen?.width || 0,
                screenHeight: window.screen?.height || 0,
                devicePixelRatio: window.devicePixelRatio || 1,
                pageLanguage: document.documentElement?.lang || '',
                colorScheme,
                reducedMotion
            });
            return true;
        }

        if (request.type === 'getCurrentUserInfo') {
            sendResponse({
                status: 'ok',
                currentUser: deriveCurrentUserInfoFromToken()
            });
            return true;
        }

        if (request.type === 'playRecordingStep') {
            replayStep(request.step || {})
                .then((result) => sendResponse(result))
                .catch((error) => {
                    sendResponse({
                        success: false,
                        error: error.message || getMessage('errorReplayActionFailed', ['?'], 'Replay failed.')
                    });
                });
            return true;
        }

        return false;
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            syncRecorderMode();
        }
    });
    window.addEventListener('focus', syncRecorderMode);
    window.addEventListener('pagehide', () => {
        if (recorderEnabled) {
            flushPendingInputRecords();
        }
        hideReplayHighlight();
    });
    syncRecorderMode();
}
