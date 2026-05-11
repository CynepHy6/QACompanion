const { test, expect } = require('@playwright/test');
const {
  launchBrowserWithExtension,
  openExtensionPopup,
  clearExtensionStorage,
  getSessionData,
  getRecordingData,
  waitForStorageUpdate,
} = require('./helpers/extension-helper');

const RECORD_LABEL = /Record|Запись/;
const STOP_LABEL = /Stop|Стоп/;
const PLAY_LABEL = /Play|Повтор/;
const NO_RECORDED_STEPS_LABEL = /No recorded steps yet\.|Записанных шагов пока нет\./;
const REPLAY_TARGET_NOT_FOUND_MESSAGE = /Step 1 failed: target element not found\.|Шаг 1: целевой элемент не найден\./;
const RECORDING_ALREADY_EXISTS_MESSAGE = /Clear the existing recording before starting a new one\.|Сначала удали существующую запись, потом начинай новую\./;

async function installReplayProbe(page) {
  await page.evaluate(() => {
    localStorage.removeItem('qaReplayInput');
    const inputElement = document.getElementById('testInput');
    if (!inputElement) {
      return;
    }

    inputElement.addEventListener('input', (event) => {
      localStorage.setItem('qaReplayInput', event.target.value);
    });
  });
}

async function sendRuntimeMessage(popupPage, message) {
  return popupPage.evaluate((payload) => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(payload, (response) => resolve(response));
    });
  }, message);
}

test.describe('Recording and Replay', () => {
  let context;
  let extensionId;
  let popupPage;
  let testPage;

  test.beforeAll(async () => {
    const result = await launchBrowserWithExtension();
    context = result.context;
    extensionId = result.extensionId;
  });

  test.beforeEach(async () => {
    testPage = await context.newPage();
    await testPage.goto('http://localhost:8000/test/e2e/test-pages/index.html');
    await installReplayProbe(testPage);

    popupPage = await openExtensionPopup(context, extensionId);
    await clearExtensionStorage(popupPage);
    await popupPage.reload();
    await popupPage.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    if (testPage) await testPage.close();
    if (popupPage) await popupPage.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should record and replay a flow with navigation', async () => {
    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, {
      type: 'startRecordingFlow',
      target: { kind: 'draft', annotationId: '' }
    });
    await expect(popupPage.locator('#recordingToggleBtn')).toHaveText(STOP_LABEL);

    await testPage.fill('#testInput', 'Replay target value');
    await testPage.click('button:has-text("Go to page 1")');
    await testPage.waitForURL('**/page1.html');

    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, { type: 'syncRecordingNavigation' });
    await sendRuntimeMessage(popupPage, { type: 'stopRecordingFlow' });
    await expect(popupPage.locator('#recordingToggleBtn')).toHaveText(RECORD_LABEL);
    await waitForStorageUpdate(popupPage, 700);

    const recordingData = await getRecordingData(popupPage);
    expect(recordingData).toBeTruthy();
    expect(recordingData.steps.some((stepItem) => stepItem.type === 'input' || stepItem.type === 'change')).toBeTruthy();
    expect(recordingData.steps.some((stepItem) => stepItem.type === 'click')).toBeTruthy();
    expect(recordingData.steps.some((stepItem) => stepItem.type === 'navigation')).toBeTruthy();
    const clickStepIndex = recordingData.steps.findIndex((stepItem) => stepItem.type === 'click');
    const navigationStepIndex = recordingData.steps.findIndex((stepItem) => stepItem.type === 'navigation');
    expect(clickStepIndex).toBeGreaterThanOrEqual(0);
    expect(navigationStepIndex).toBeGreaterThan(clickStepIndex);
    expect(
      recordingData.steps
        .filter((stepItem) => stepItem.type === 'navigation')
        .every((stepItem) => !stepItem.screenshotRef)
    ).toBeTruthy();

    await testPage.goto('http://localhost:8000/test/e2e/test-pages/index.html');
    await installReplayProbe(testPage);
    await testPage.fill('#testInput', '');
    await expect(testPage.locator('#testInput')).toHaveValue('');

    await testPage.bringToFront();
    const playbackPromise = sendRuntimeMessage(popupPage, { type: 'playRecordingFlow' });
    await testPage.waitForURL('**/page1.html');
    await playbackPromise;

    const replayedInputValue = await testPage.evaluate(() => {
      return localStorage.getItem('qaReplayInput');
    });

    expect(replayedInputValue).toBe('Replay target value');
  });

  test('should record and replay clicks on custom clickable elements', async () => {
    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, {
      type: 'startRecordingFlow',
      target: { kind: 'draft', annotationId: '' }
    });

    await testPage.click('#customChip');
    await waitForStorageUpdate(popupPage, 700);
    await sendRuntimeMessage(popupPage, { type: 'stopRecordingFlow' });
    await waitForStorageUpdate(popupPage, 500);

    const recordingData = await getRecordingData(popupPage);
    const recordedClickStep = recordingData.steps.find((stepItem) => stepItem.type === 'click');

    expect(recordedClickStep).toBeTruthy();
    expect(recordedClickStep.tagName).toBe('DIV');
    expect(recordedClickStep.text).toContain('Interactive chip');

    await testPage.evaluate(() => {
      const chipElement = document.getElementById('customChip');
      const chipStateElement = document.getElementById('customChipState');
      chipElement.dataset.selected = 'false';
      chipElement.classList.remove('is-selected');
      chipStateElement.textContent = 'OFF';
    });

    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, { type: 'playRecordingFlow' });
    await waitForStorageUpdate(popupPage, 700);

    await expect(testPage.locator('#customChip')).toHaveAttribute('data-selected', 'true');
    await expect(testPage.locator('#customChipState')).toHaveText('ON');
  });

  test('should stop replay and highlight the failed step when the target element is missing', async () => {
    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, { type: 'startRecordingFlow' });

    await testPage.click('#customChip');
    await waitForStorageUpdate(popupPage, 700);
    await sendRuntimeMessage(popupPage, { type: 'stopRecordingFlow' });
    await waitForStorageUpdate(popupPage, 500);

    const recordingData = await getRecordingData(popupPage);
    const recordedClickStep = recordingData.steps.find((stepItem) => stepItem.type === 'click');

    expect(recordedClickStep).toBeTruthy();

    await testPage.evaluate(() => {
      const chipElement = document.getElementById('customChip');
      if (!chipElement) {
        return;
      }

      chipElement.removeAttribute('id');
    });

    const playbackResponse = await sendRuntimeMessage(popupPage, { type: 'playRecordingFlow' });
    expect(playbackResponse.status).toBe('error');
    expect(playbackResponse.error).toMatch(REPLAY_TARGET_NOT_FOUND_MESSAGE);

    await expect.poll(async () => {
      const latestRecordingState = await sendRuntimeMessage(popupPage, { type: 'getRecordingState' });
      return latestRecordingState.recording;
    }).toMatchObject({
      status: 'idle',
      lastError: expect.stringMatching(REPLAY_TARGET_NOT_FOUND_MESSAGE),
      failedStepId: recordedClickStep.stepId
    });

    await popupPage.click('#recorderTabBtn');
    await expect(popupPage.locator('#recordingStatus')).toContainText(REPLAY_TARGET_NOT_FOUND_MESSAGE, {
      timeout: 4000
    });
    await expect(popupPage.locator('#recordingStepsList .recording-step-card.is-failed')).toHaveCount(1);

    await popupPage.click('#actionTabBtn');
    await expect(popupPage.locator('#actionTabBtn')).toHaveAttribute('aria-selected', 'true');
    await popupPage.waitForTimeout(1300);
    await expect(popupPage.locator('#actionTabBtn')).toHaveAttribute('aria-selected', 'true');
  });

  test('should require confirmation before clearing recorded steps', async () => {
    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, {
      type: 'startRecordingFlow',
      target: { kind: 'draft', annotationId: '' }
    });
    await testPage.fill('#testInput', 'Disposable recording');
    await testPage.click('button:has-text("Add content block")');
    await waitForStorageUpdate(popupPage, 700);
    await sendRuntimeMessage(popupPage, { type: 'stopRecordingFlow' });
    await waitForStorageUpdate(popupPage, 500);

    const recordingBeforeClear = await sendRuntimeMessage(popupPage, { type: 'getRecordingState' });
    expect(recordingBeforeClear.recording.stepCount).toBeGreaterThan(0);

    await popupPage.click('#recorderTabBtn');

    const clearRecordingButton = popupPage.locator('#clearRecordingBtn');
    await clearRecordingButton.click();

    await expect(clearRecordingButton).toHaveClass(/is-armed/);
    await expect(popupPage.locator('#recordingStepsList')).not.toContainText(NO_RECORDED_STEPS_LABEL);

    await popupPage.click('#recordingStatus');
    await expect(clearRecordingButton).not.toHaveClass(/is-armed/);

    await clearRecordingButton.click();
    await expect(clearRecordingButton).toHaveClass(/is-armed/);

    await clearRecordingButton.click();
    await waitForStorageUpdate(popupPage, 500);

    const recordingData = await sendRuntimeMessage(popupPage, { type: 'getRecordingState' });
    expect(recordingData.recording.stepCount).toBe(0);
    expect(recordingData.recording.screenshotCount).toBe(0);
    await expect(popupPage.locator('#recordingStepsList')).toContainText(NO_RECORDED_STEPS_LABEL);
  });

  test('should expose a single primary recorder action and keep saved steps without replay inactive', async () => {
    await popupPage.click('#recorderTabBtn');
    await expect(popupPage.locator('#recordingToggleBtn')).toBeVisible();
    await expect(popupPage.locator('#recordingToggleBtn')).toHaveText(RECORD_LABEL);
    await expect(popupPage.locator('#playRecordingBtn')).toBeHidden();
    await expect(popupPage.locator('#clearRecordingBtn')).toBeHidden();

    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, { type: 'startRecordingFlow' });
    await waitForStorageUpdate(popupPage, 500);
    await popupPage.bringToFront();
    await expect(popupPage.locator('#recordingToggleBtn')).toBeVisible();
    await expect(popupPage.locator('#recordingToggleBtn')).toHaveText(STOP_LABEL);
    await expect(popupPage.locator('#playRecordingBtn')).toBeHidden();

    await testPage.bringToFront();
    await testPage.fill('#testInput', 'Single primary action');
    await waitForStorageUpdate(popupPage, 700);

    await popupPage.bringToFront();
    await sendRuntimeMessage(popupPage, {
      type: 'stopRecordingFlow',
      options: { suppressSyntheticNavigationOnStop: true }
    });
    await waitForStorageUpdate(popupPage, 700);
    await expect(popupPage.locator('#recordingToggleBtn')).toBeHidden();
    await expect(popupPage.locator('#playRecordingBtn')).toBeVisible();
    await expect(popupPage.locator('#playRecordingBtn')).toHaveText(PLAY_LABEL);
    await expect(popupPage.locator('#clearRecordingBtn')).toBeVisible();

    const duplicateDraftRecordingResponse = await sendRuntimeMessage(popupPage, {
      type: 'startRecordingFlow',
      target: { kind: 'draft', annotationId: '' }
    });
    expect(duplicateDraftRecordingResponse.status).toBe('error');
    expect(duplicateDraftRecordingResponse.error).toMatch(RECORDING_ALREADY_EXISTS_MESSAGE);

    await popupPage.click('#actionTabBtn');
    await popupPage.fill('#draftDescription', 'Saved with replay');
    await popupPage.click('#BugBtn');
    await waitForStorageUpdate(popupPage, 700);

    await popupPage.fill('#draftDescription', 'Saved without replay');
    await popupPage.click('#BugBtn');
    await waitForStorageUpdate(popupPage, 700);

    await popupPage.click('#recorderTabBtn');
    const replayableAnnotationCard = popupPage.locator('[data-annotation-id]').filter({ hasText: 'Saved with replay' });
    const inactiveAnnotationCard = popupPage.locator('.saved-annotation-card--inactive').filter({ hasText: 'Saved without replay' });

    await expect(replayableAnnotationCard).toHaveCount(1);
    await expect(inactiveAnnotationCard).toHaveCount(1);

    await replayableAnnotationCard.evaluate((element) => element.click());
    await expect(replayableAnnotationCard).toHaveClass(/is-selected/);
    await expect(popupPage.locator('#recordingToggleBtn')).toBeHidden();
    await expect(popupPage.locator('#playRecordingBtn')).toBeVisible();
    await expect(popupPage.locator('#clearRecordingBtn')).toBeVisible();

    const selectedCaptionBeforeInactiveClick = await popupPage.locator('#selectedRecordingCaption').textContent();
    await inactiveAnnotationCard.evaluate((element) => element.click());
    await expect(replayableAnnotationCard).toHaveClass(/is-selected/);
    await expect(popupPage.locator('#selectedRecordingCaption')).toHaveText(selectedCaptionBeforeInactiveClick || '');

    const sessionData = await getSessionData(popupPage);
    const replayableAnnotation = sessionData.annotations.find((annotationItem) => annotationItem.name === 'Saved with replay');
    expect(replayableAnnotation).toBeTruthy();

    const duplicateAnnotationRecordingResponse = await sendRuntimeMessage(popupPage, {
      type: 'startRecordingFlow',
      target: { kind: 'annotation', annotationId: replayableAnnotation.id }
    });
    expect(duplicateAnnotationRecordingResponse.status).toBe('error');
    expect(duplicateAnnotationRecordingResponse.error).toMatch(RECORDING_ALREADY_EXISTS_MESSAGE);
  });

  test('should capture environment info when recording starts without actions', async () => {
    await testPage.goto('http://localhost:8000/test/e2e/test-pages/index.html');
    await testPage.bringToFront();

    await sendRuntimeMessage(popupPage, { type: 'startRecordingFlow' });
    await waitForStorageUpdate(popupPage, 500);
    await sendRuntimeMessage(popupPage, { type: 'stopRecordingFlow' });

    const sessionData = await getSessionData(popupPage);
    expect(sessionData).toBeTruthy();
    expect(sessionData.BrowserInfo.browser).toBeTruthy();
    expect(sessionData.BrowserInfo.browserVersion).toBeTruthy();
    expect(sessionData.BrowserInfo.os).toBeTruthy();
    expect(sessionData.BrowserInfo.viewport).toMatch(/^\d+x\d+$/);
    expect(sessionData.BrowserInfo.screenResolution).toMatch(/^\d+x\d+$/);
    expect(sessionData.BrowserInfo.devicePixelRatio).toBeTruthy();
    expect(sessionData.BrowserInfo.pageTitle).toBeTruthy();
  });

  test('should move draft replay to the saved annotation', async () => {
    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, { type: 'startRecordingFlow' });
    await testPage.fill('#testInput', 'Draft replay value');
    await waitForStorageUpdate(popupPage, 700);
    await sendRuntimeMessage(popupPage, {
      type: 'stopRecordingFlow',
      options: { suppressSyntheticNavigationOnStop: true }
    });

    await popupPage.click('#actionTabBtn');
    await popupPage.fill('#draftDescription', 'Bug with replay');
    await popupPage.click('#BugBtn');
    await waitForStorageUpdate(popupPage, 700);

    const sessionData = await getSessionData(popupPage);
    const savedAnnotation = sessionData.annotations.find((annotationItem) => annotationItem.name === 'Bug with replay');
    expect(savedAnnotation).toBeTruthy();

    const draftRecordingData = await getRecordingData(popupPage, 'draft');
    expect(draftRecordingData.steps).toHaveLength(0);

    const annotationRecordingData = await getRecordingData(popupPage, savedAnnotation.id);
    expect(annotationRecordingData.steps.length).toBeGreaterThan(0);
    expect(annotationRecordingData.steps.some((stepItem) => stepItem.type === 'input' || stepItem.type === 'change')).toBeTruthy();
  });

  test('should switch replay target back to draft when clicking the draft panel', async () => {
    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, { type: 'startRecordingFlow' });
    await testPage.fill('#testInput', 'Replay linked to saved bug');
    await waitForStorageUpdate(popupPage, 700);
    await sendRuntimeMessage(popupPage, {
      type: 'stopRecordingFlow',
      options: { suppressSyntheticNavigationOnStop: true }
    });

    await popupPage.click('#actionTabBtn');
    await popupPage.fill('#draftDescription', 'Saved bug with replay');
    await popupPage.click('#BugBtn');
    await waitForStorageUpdate(popupPage, 700);

    await popupPage.click('#recorderTabBtn');
    const replayableAnnotationCard = popupPage.locator('[data-annotation-id]').filter({ hasText: 'Saved bug with replay' });
    await replayableAnnotationCard.evaluate((element) => element.click());
    await expect(replayableAnnotationCard).toHaveClass(/is-selected/);
    await expect(popupPage.locator('#playRecordingBtn')).toBeVisible();

    await popupPage.click('#actionTabBtn');
    await popupPage.click('#draftPanel');

    await expect(replayableAnnotationCard).not.toHaveClass(/is-selected/);
    const popupStateResponse = await sendRuntimeMessage(popupPage, { type: 'getPopupState' });
    expect(popupStateResponse.popupState.selectedRecordingTarget).toEqual({
      kind: 'draft',
      annotationId: ''
    });

    await popupPage.click('#recorderTabBtn');
    await expect(popupPage.locator('#recordingToggleBtn')).toBeVisible();
    await expect(popupPage.locator('#playRecordingBtn')).toBeHidden();
  });

  test('should keep separate recordings for different saved annotations', async () => {
    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, { type: 'startRecordingFlow' });
    await testPage.fill('#testInput', 'First replay');
    await waitForStorageUpdate(popupPage, 700);
    await sendRuntimeMessage(popupPage, {
      type: 'stopRecordingFlow',
      options: { suppressSyntheticNavigationOnStop: true }
    });

    await popupPage.fill('#draftDescription', 'First bug');
    await popupPage.click('#BugBtn');
    await waitForStorageUpdate(popupPage, 700);

    await popupPage.fill('#draftDescription', 'Second bug');
    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, {
      type: 'startRecordingFlow',
      target: { kind: 'draft', annotationId: '' }
    });
    await testPage.click('#customChip');
    await waitForStorageUpdate(popupPage, 700);
    await sendRuntimeMessage(popupPage, {
      type: 'stopRecordingFlow',
      options: { suppressSyntheticNavigationOnStop: true }
    });
    await popupPage.bringToFront();
    await popupPage.click('#actionTabBtn');
    await popupPage.click('#BugBtn');
    await waitForStorageUpdate(popupPage, 700);

    const sessionData = await getSessionData(popupPage);
    const firstAnnotation = sessionData.annotations.find((annotationItem) => annotationItem.name === 'First bug');
    const secondAnnotation = sessionData.annotations.find((annotationItem) => annotationItem.name === 'Second bug');

    const firstRecording = await getRecordingData(popupPage, firstAnnotation.id);
    const secondRecording = await getRecordingData(popupPage, secondAnnotation.id);
    expect(firstRecording.steps.some((stepItem) => stepItem.type === 'input' || stepItem.type === 'change')).toBeTruthy();
    expect(secondRecording.steps.some((stepItem) => stepItem.type === 'click')).toBeTruthy();

    await sendRuntimeMessage(popupPage, {
      type: 'clearRecordingData',
      target: { kind: 'annotation', annotationId: secondAnnotation.id }
    });
    await waitForStorageUpdate(popupPage, 500);

    const firstRecordingAfterClear = await getRecordingData(popupPage, firstAnnotation.id);
    const secondRecordingAfterClear = await getRecordingData(popupPage, secondAnnotation.id);
    expect(firstRecordingAfterClear.steps.length).toBeGreaterThan(0);
    expect(secondRecordingAfterClear.steps).toHaveLength(0);
  });
});
