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
        showSelectionNotification("Click and drag to select an area. Press Esc to cancel.");

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

    function createRecordedStep(stepType, targetElement) {
        return {
            type: stepType,
            url: window.location.href,
            locator: buildElementLocator(targetElement),
            value: normalizeRecordedValue(targetElement),
            inputType: targetElement.type || '',
            tagName: targetElement.tagName || '',
            text: (targetElement.textContent || '').trim().slice(0, 120)
        };
    }

    function postRecordedStep(stepType, targetElement) {
        try {
            safeSendMessage({
                type: 'appendRecordedStep',
                step: createRecordedStep(stepType, targetElement)
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

    function flushPendingInputRecords() {
        for (const [locatorKey, timerData] of pendingInputTimers.entries()) {
            clearTimeout(timerData.timerId);
            postRecordedStep(timerData.stepType, timerData.targetElement);
            pendingInputTimers.delete(locatorKey);
        }
    }

    function getRecordedClickTarget(event) {
        const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const originalTarget = event.target instanceof HTMLElement
            ? event.target
            : eventPath.find((pathItem) => pathItem instanceof HTMLElement) || null;
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

    function handleRecordedClick(event) {
        if (!recorderEnabled) {
            return;
        }

        const targetElement = getRecordedClickTarget(event);
        if (!targetElement) {
            return;
        }

        flushPendingInputRecords();
        postRecordedStep('click', targetElement);
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

        const targetElement = event.target;
        if (!(targetElement instanceof HTMLElement)) {
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

        const targetElement = event.target;
        if (!(targetElement instanceof HTMLElement)) {
            return;
        }

        postRecordedStep('change', targetElement);
    }

    function handleRecordedSubmit(event) {
        if (!recorderEnabled) {
            return;
        }

        const targetElement = event.target;
        if (!(targetElement instanceof HTMLElement)) {
            return;
        }

        postRecordedStep('submit', targetElement);
    }

    function attachRecorderListeners() {
        document.addEventListener('click', handleRecordedClick, true);
        document.addEventListener('input', handleRecordedInput, true);
        document.addEventListener('change', handleRecordedChange, true);
        document.addEventListener('submit', handleRecordedSubmit, true);
    }

    function detachRecorderListeners() {
        document.removeEventListener('click', handleRecordedClick, true);
        document.removeEventListener('input', handleRecordedInput, true);
        document.removeEventListener('change', handleRecordedChange, true);
        document.removeEventListener('submit', handleRecordedSubmit, true);

        for (const timerId of pendingInputTimers.values()) {
            clearTimeout(timerId.timerId);
        }

        pendingInputTimers.clear();
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

    function findElementByLocator(locatorData) {
        if (!locatorData || typeof locatorData !== 'object') {
            return null;
        }

        if (locatorData.strategy === 'id') {
            return document.getElementById(locatorData.value);
        }

        if (locatorData.strategy === 'name') {
            const namedElements = document.getElementsByName(locatorData.value);
            return namedElements.length > 0 ? namedElements[0] : null;
        }

        if (locatorData.strategy === 'data' && locatorData.name) {
            return document.querySelector(`[${locatorData.name}="${locatorData.value.replace(/"/g, '\\"')}"]`);
        }

        if (locatorData.strategy === 'css') {
            try {
                return document.querySelector(locatorData.value);
            } catch {
                return null;
            }
        }

        return null;
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
        const targetElement = findElementByLocator(stepData.locator);
        if (!targetElement) {
            return {
                success: false,
                reason: 'target-not-found',
                error: 'Target element not found.'
            };
        }

        targetElement.scrollIntoView({ block: 'center', inline: 'center' });
        highlightReplayTarget(targetElement);

        if (stepData.type === 'input' || stepData.type === 'change') {
            applyRecordedValue(targetElement, stepData);
            return { success: true };
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
            targetElement.click();
            return { success: true };
        }

        return {
            success: false,
            error: `Unsupported replay step type: ${stepData.type}.`
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
                pageLanguage: document.documentElement?.lang || navigator.language || '',
                colorScheme,
                reducedMotion
            });
            return true;
        }

        if (request.type === 'playRecordingStep') {
            replayStep(request.step || {})
                .then((result) => sendResponse(result))
                .catch((error) => {
                    sendResponse({
                        success: false,
                        error: error.message || 'Replay failed.'
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
