const { test, expect } = require('@playwright/test');
const {
  launchBrowserWithExtension,
  openExtensionPopup,
  clearExtensionStorage,
  getRecordingData,
  waitForStorageUpdate,
} = require('./helpers/extension-helper');

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
    await sendRuntimeMessage(popupPage, { type: 'startRecordingFlow' });
    await expect(popupPage.locator('#recordingToggleBtn')).toHaveText('Stop');

    await testPage.fill('#testInput', 'Replay target value');
    await testPage.click('button:has-text("Ir a Página 1")');
    await testPage.waitForURL('**/page1.html');

    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, { type: 'syncRecordingNavigation' });
    await sendRuntimeMessage(popupPage, { type: 'stopRecordingFlow' });
    await expect(popupPage.locator('#recordingToggleBtn')).toHaveText('Record');
    await waitForStorageUpdate(popupPage, 700);

    const recordingData = await getRecordingData(popupPage);
    expect(recordingData).toBeTruthy();
    expect(recordingData.steps.some((stepItem) => stepItem.type === 'input' || stepItem.type === 'change')).toBeTruthy();
    expect(recordingData.steps.some((stepItem) => stepItem.type === 'click')).toBeTruthy();
    expect(recordingData.steps.some((stepItem) => stepItem.type === 'navigation')).toBeTruthy();

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

  test('should require confirmation before clearing recorded steps', async () => {
    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, { type: 'startRecordingFlow' });
    await testPage.fill('#testInput', 'Disposable recording');
    await testPage.click('button:has-text("Añadir Contenido")');
    await waitForStorageUpdate(popupPage, 700);
    await sendRuntimeMessage(popupPage, { type: 'stopRecordingFlow' });
    await waitForStorageUpdate(popupPage, 500);

    const recordingBeforeClear = await sendRuntimeMessage(popupPage, { type: 'getRecordingState' });
    expect(recordingBeforeClear.recording.stepCount).toBeGreaterThan(0);

    await popupPage.click('#recorderTabBtn');

    const clearRecordingButton = popupPage.locator('#clearRecordingBtn');
    await clearRecordingButton.click();

    await expect(clearRecordingButton).toHaveClass(/is-armed/);
    await expect(popupPage.locator('#recordingStepsList')).not.toContainText('No recorded steps yet.');

    await popupPage.click('#recordingStatus');
    await expect(clearRecordingButton).not.toHaveClass(/is-armed/);

    await clearRecordingButton.click();
    await expect(clearRecordingButton).toHaveClass(/is-armed/);

    await clearRecordingButton.click();
    await waitForStorageUpdate(popupPage, 500);

    const recordingData = await sendRuntimeMessage(popupPage, { type: 'getRecordingState' });
    expect(recordingData.recording.stepCount).toBe(0);
    expect(recordingData.recording.screenshotCount).toBe(0);
    await expect(popupPage.locator('#recordingStepsList')).toContainText('No recorded steps yet.');
  });
});
