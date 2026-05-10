function getMessage(messageKey, substitutions, fallbackValue = '') {
  try {
    const localizedMessage = chrome?.i18n?.getMessage(messageKey, substitutions);
    if (localizedMessage) {
      return localizedMessage;
    }
  } catch {
    // Ignore localization lookup issues and fall back below.
  }

  return fallbackValue;
}

function isRussianLocale() {
  try {
    return (chrome?.i18n?.getUILanguage?.() || navigator.language || 'en').toLowerCase().startsWith('ru');
  } catch {
    return (navigator.language || 'en').toLowerCase().startsWith('ru');
  }
}

function getPluralCategory(countValue) {
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

function getPluralMessage(messageKeyBase, countValue, fallbackValue = '') {
  const pluralCategory = getPluralCategory(countValue);
  return getMessage(`${messageKeyBase}_${pluralCategory}`, [String(countValue)], fallbackValue);
}

function getAnnotationTypeLabel(typeName) {
  if (typeName === 'Bug') {
    return getMessage('annotationBug', undefined, 'Bug');
  }

  if (typeName === 'Note') {
    return getMessage('annotationNote', undefined, 'Note');
  }

  return typeName;
}

const TYPE_META = {
  Bug: {
    title: getMessage('annotationBug', undefined, 'Bug'),
    draftTitle: getMessage('annotationNewBug', undefined, 'New bug'),
    placeholder: getMessage('annotationDescribeBugPlaceholder', undefined, 'Describe the bug...'),
    actionLabel: getMessage('annotationBugAction', undefined, 'Add bug')
  },
  Note: {
    title: getMessage('annotationNote', undefined, 'Note'),
    draftTitle: getMessage('annotationNewNote', undefined, 'New note'),
    placeholder: getMessage('annotationDescribeNotePlaceholder', undefined, 'Describe the note...'),
    actionLabel: getMessage('annotationNoteAction', undefined, 'Add note')
  }
};

const DEFAULT_TYPE = 'Bug';
const RECORDING_BUTTON_LABELS = {
  record: {
    icon: '●',
    label: getMessage('popupRecordButton', undefined, 'Record')
  },
  stop: {
    icon: '■',
    label: getMessage('popupStopButton', undefined, 'Stop')
  },
  play: {
    icon: '▶',
    label: getMessage('popupPlayButton', undefined, 'Play')
  }
};

let currentDraft = {
  type: 'Bug',
  description: '',
  imageURLs: []
};
let currentRecording = createEmptyRecordingState();
let currentPopupMode = 'action';
let lastScrolledReplayStepId = '';

let persistTimer = null;
let clearDraftArmed = false;
let clearRecordingArmed = false;
let clearSessionArmed = false;
let screenshotCooldownTimer = null;
let recordingStatePollTimer = null;
let hoverPreviewAnchorElement = null;
let armedDraftImageIndex = null;

function getRecordingStateSignature(recordingState) {
  return JSON.stringify({
    id: recordingState?.id || '',
    status: recordingState?.status || '',
    startedAt: recordingState?.startedAt || null,
    stoppedAt: recordingState?.stoppedAt || null,
    lastError: recordingState?.lastError || '',
    activeStepId: recordingState?.activeStepId || '',
    failedStepId: recordingState?.failedStepId || '',
    stepCount: recordingState?.stepCount || 0,
    screenshotCount: recordingState?.screenshotCount || 0,
    canPlay: Boolean(recordingState?.canPlay),
    hasRecording: Boolean(recordingState?.hasRecording),
    steps: Array.isArray(recordingState?.steps) ? recordingState.steps : [],
    screenshots: Array.isArray(recordingState?.screenshots) ? recordingState.screenshots : []
  });
}

function createEmptyRecordingState() {
  return {
    id: null,
    status: 'idle',
    startedAt: null,
    stoppedAt: null,
    lastError: '',
    activeStepId: '',
    failedStepId: '',
    stepCount: 0,
    screenshotCount: 0,
    canPlay: false,
    hasRecording: false,
    steps: [],
    screenshots: []
  };
}

function cancelScheduledDraftPersist() {
  clearTimeout(persistTimer);
  persistTimer = null;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (response && response.status === 'error') {
        reject(new Error(response.error || getMessage('errorUnknown', undefined, 'Unknown error')));
        return;
      }

      resolve(response);
    });
  });
}

function getElements() {
  return {
    actionPanel: document.getElementById('actionPanel'),
    actionTabButton: document.getElementById('actionTabBtn'),
    addScreenshotButton: document.getElementById('addScreenshotBtn'),
    clearDraftButton: document.getElementById('clearDraftBtn'),
    clearRecordingButton: document.getElementById('clearRecordingBtn'),
    descriptionField: document.getElementById('draftDescription'),
    titleLabel: document.getElementById('draftTitle'),
    counterLabel: document.getElementById('draftImageCount'),
    imagesContainer: document.getElementById('draftImages'),
    playRecordingButton: document.getElementById('playRecordingBtn'),
    popupHoverPreview: document.getElementById('popupImageHoverPreview'),
    recorderPanel: document.getElementById('recorderPanel'),
    recorderTabButton: document.getElementById('recorderTabBtn'),
    recordingScreenshotCountLabel: document.getElementById('recordingScreenshotCount'),
    recordingStatusLabel: document.getElementById('recordingStatus'),
    recordingStepCountLabel: document.getElementById('recordingStepCount'),
    recordingStepsList: document.getElementById('recordingStepsList'),
    recordingToggleButton: document.getElementById('recordingToggleBtn'),
    resetButton: document.getElementById('resetBtn')
  };
}

function getButtonDefaultLabel(typeName) {
  return TYPE_META[typeName]?.title || typeName;
}

function buildRecordingButtonMarkup(buttonKey) {
  const buttonMeta = RECORDING_BUTTON_LABELS[buttonKey];
  if (!buttonMeta) {
    return '';
  }

  return `<span class="recording-button__icon" aria-hidden="true">${buttonMeta.icon}</span><span class="recording-button__label">${buttonMeta.label}</span>`;
}

function renderRecordingButtonMarkup(buttonElement, buttonKey) {
  if (!buttonElement) {
    return;
  }

  buttonElement.innerHTML = buildRecordingButtonMarkup(buttonKey);
}

function renderTypeButtonLabels() {
  const buttonLabelMap = {
    Bug: document.getElementById('bugButtonLabel'),
    Note: document.getElementById('noteButtonLabel')
  };

  Object.entries(buttonLabelMap).forEach(([typeName, labelElement]) => {
    if (!labelElement) {
      return;
    }

    labelElement.textContent = currentDraft.type === typeName
      ? TYPE_META[typeName].actionLabel
      : getButtonDefaultLabel(typeName);
  });
}

function setClearDraftArmed(isArmed) {
  clearDraftArmed = isArmed;
  renderClearDraftButtonState();
}

function renderClearDraftButtonState() {
  const { clearDraftButton } = getElements();
  if (!clearDraftButton) {
    return;
  }

  clearDraftButton.classList.toggle('is-armed', clearDraftArmed);
  const nextTitle = clearDraftArmed
    ? getMessage('popupConfirmClearDraftTitle', undefined, 'Confirm clear draft')
    : getMessage('popupClearDraftTitle', undefined, 'Clear draft');
  clearDraftButton.title = nextTitle;
  clearDraftButton.setAttribute('aria-label', nextTitle);
}

function setClearRecordingArmed(isArmed) {
  clearRecordingArmed = isArmed;
  renderClearRecordingButtonState();
}

function renderClearRecordingButtonState() {
  const { clearRecordingButton } = getElements();
  if (!clearRecordingButton) {
    return;
  }

  clearRecordingButton.classList.toggle('is-armed', clearRecordingArmed);
  const nextTitle = clearRecordingArmed
    ? getMessage('popupConfirmClearRecordingTitle', undefined, 'Confirm clear recording')
    : getMessage('popupClearRecordingTitle', undefined, 'Clear recording');
  clearRecordingButton.title = nextTitle;
  clearRecordingButton.setAttribute('aria-label', nextTitle);
}

function setClearSessionArmed(isArmed) {
  clearSessionArmed = isArmed;
  renderClearSessionButtonState();
}

function renderClearSessionButtonState() {
  const { resetButton } = getElements();
  if (!resetButton) {
    return;
  }

  resetButton.classList.toggle('is-armed', clearSessionArmed);
  const nextTitle = clearSessionArmed
    ? getMessage('popupConfirmResetAllTitle', undefined, 'Confirm reset all session data')
    : getMessage('popupResetAllTitle', undefined, 'Reset all session data');
  resetButton.title = nextTitle;
  resetButton.setAttribute('aria-label', nextTitle);
}

function setScreenshotButtonCooldown() {
  const { addScreenshotButton } = getElements();
  if (!addScreenshotButton) {
    return;
  }

  addScreenshotButton.disabled = true;

  if (screenshotCooldownTimer) {
    clearTimeout(screenshotCooldownTimer);
  }

  screenshotCooldownTimer = setTimeout(() => {
    screenshotCooldownTimer = null;
    renderRecordingControls();
  }, 1000);
}

function formatScreenshotCount(imageCount) {
  return getPluralMessage('countScreenshot', imageCount, `${imageCount} screenshots`);
}

function formatStepCount(stepCount) {
  return getPluralMessage('countStep', stepCount, `${stepCount} steps`);
}

function setPopupMode(nextMode) {
  currentPopupMode = nextMode === 'recorder' ? 'recorder' : 'action';
  renderModeTabs();
}

function renderModeTabs() {
  const {
    actionPanel,
    actionTabButton,
    recorderPanel,
    recorderTabButton
  } = getElements();
  const isActionMode = currentPopupMode === 'action';

  actionPanel.hidden = !isActionMode;
  recorderPanel.hidden = isActionMode;
  actionTabButton.classList.toggle('is-active', isActionMode);
  recorderTabButton.classList.toggle('is-active', !isActionMode);
  actionTabButton.setAttribute('aria-selected', String(isActionMode));
  recorderTabButton.setAttribute('aria-selected', String(!isActionMode));
}

function getRecordingStepSummary(stepItem) {
  if (stepItem.type === 'navigation') {
    return getMessage('popupRecorderNavigateTo', [stepItem.url || ''], `Go to ${stepItem.url || ''}`);
  }

  if (stepItem.type === 'click') {
    return stepItem.text
      ? getMessage('popupRecorderClickText', [stepItem.text], `Click ${stepItem.text}`)
      : getMessage('popupRecorderClickElement', undefined, 'Click element');
  }

  if (stepItem.type === 'submit') {
    return getMessage('popupRecorderSubmitForm', undefined, 'Submit form');
  }

  if (stepItem.type === 'input' || stepItem.type === 'change') {
    return stepItem.value
      ? getMessage('popupRecorderTypeValue', [stepItem.value], `Type ${stepItem.value}`)
      : getMessage('popupRecorderUpdateField', undefined, 'Update field');
  }

  return getAnnotationTypeLabel(stepItem.type);
}

function getHighlightedRecordingStepId() {
  if (currentRecording.status === 'replaying' && currentRecording.activeStepId !== '') {
    return currentRecording.activeStepId;
  }

  if (currentRecording.failedStepId) {
    return currentRecording.failedStepId;
  }

  return '';
}

function escapeHtml(textValue) {
  return String(textValue)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderRecordingSteps() {
  const {
    recordingScreenshotCountLabel,
    recordingStepsList
  } = getElements();
  const screenshotMap = new Map(
    currentRecording.screenshots.map((screenshotItem) => [screenshotItem.id, screenshotItem])
  );

  recordingScreenshotCountLabel.textContent = formatScreenshotCount(currentRecording.screenshotCount);

  if (!currentRecording.steps || currentRecording.steps.length === 0) {
    if (clearRecordingArmed) {
      clearRecordingArmed = false;
    }
    recordingStepsList.className = 'recording-steps-list recording-steps-list--empty';
    recordingStepsList.innerHTML = `<p class="recording-steps-list__empty">${escapeHtml(getMessage('popupNoRecordedStepsYet', undefined, 'No recorded steps yet.'))}</p>`;
    renderClearRecordingButtonState();
    return;
  }

  recordingStepsList.className = 'recording-steps-list';
  hidePopupHoverPreview();
  recordingStepsList.innerHTML = currentRecording.steps.map((stepItem, stepIndex) => {
    const linkedScreenshot = stepItem.screenshotRef ? screenshotMap.get(stepItem.screenshotRef) : null;
    const isActiveStep = currentRecording.status === 'replaying' && currentRecording.activeStepId === stepItem.stepId;
    const isFailedStep = currentRecording.failedStepId === stepItem.stepId;
    const stepStateClassName = isFailedStep ? ' is-failed' : (isActiveStep ? ' is-active' : '');
    const failureDetailsMarkup = isFailedStep && currentRecording.lastError
      ? `<p class="recording-step-card__error">${escapeHtml(currentRecording.lastError)}</p>`
      : '';
    return `
      <article class="recording-step-card${stepStateClassName}" data-step-id="${escapeHtml(stepItem.stepId)}">
        <div class="recording-step-card__meta">
          <span class="recording-step-card__index">${escapeHtml(getMessage('popupStepLabel', [String(stepIndex + 1)], `Step ${stepIndex + 1}`))}</span>
          <span class="recording-step-card__type">${escapeHtml(getMessage(`stepType${stepItem.type.charAt(0).toUpperCase()}${stepItem.type.slice(1)}`, undefined, stepItem.type))}</span>
        </div>
        ${linkedScreenshot ? `<img src="${linkedScreenshot.imageURL}" alt="${escapeHtml(getMessage('popupStepScreenshotAlt', [String(stepIndex + 1)], `Screenshot for step ${stepIndex + 1}`))}" class="recording-step-card__preview popup-preview-image" data-preview="${linkedScreenshot.imageURL}">` : ''}
        <p class="recording-step-card__summary">${escapeHtml(getRecordingStepSummary(stepItem))}</p>
        ${failureDetailsMarkup}
      </article>
    `;
  }).join('');

  const highlightedStepId = getHighlightedRecordingStepId();
  if (highlightedStepId === '') {
    lastScrolledReplayStepId = '';
    return;
  }

  if (currentPopupMode !== 'recorder' || highlightedStepId === lastScrolledReplayStepId) {
    return;
  }

  const activeStepCard = recordingStepsList.querySelector(`[data-step-id="${CSS.escape(highlightedStepId)}"]`);
  if (!activeStepCard) {
    return;
  }

  activeStepCard.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: 'smooth'
  });
  lastScrolledReplayStepId = highlightedStepId;
}

function getRecordingStatusText() {
  if (currentRecording.status === 'recording') {
    return getMessage('popupRecorderStatusRecording', undefined, 'Recording actions on the current tab');
  }

  if (currentRecording.status === 'replaying') {
    return getMessage('popupRecorderStatusReplaying', undefined, 'Replaying the last recorded flow');
  }

  if (currentRecording.lastError) {
    return currentRecording.lastError;
  }

  if (currentRecording.hasRecording) {
    return getMessage('popupRecorderStatusReady', undefined, 'Recording is ready to replay');
  }

  return getMessage('popupRecorderStatusIdle', undefined, 'Recorder idle');
}

function renderRecordingControls() {
  const {
    addScreenshotButton,
    clearDraftButton,
    clearRecordingButton,
    descriptionField,
    playRecordingButton,
    recordingStatusLabel,
    recordingStepCountLabel,
    recordingToggleButton
  } = getElements();
  const isRecordingActive = currentRecording.status === 'recording';
  const isReplayActive = currentRecording.status === 'replaying';

  renderRecordingButtonMarkup(
    recordingToggleButton,
    isRecordingActive ? 'stop' : 'record'
  );
  recordingToggleButton.classList.toggle('is-recording', isRecordingActive);
  recordingToggleButton.disabled = isReplayActive;

  playRecordingButton.classList.toggle('is-replaying', isReplayActive);
  renderRecordingButtonMarkup(playRecordingButton, 'play');
  playRecordingButton.disabled = !currentRecording.canPlay || isReplayActive || isRecordingActive;

  recordingStatusLabel.textContent = getRecordingStatusText();
  recordingStepCountLabel.textContent = formatStepCount(currentRecording.stepCount);
  renderRecordingSteps();
  renderClearRecordingButtonState();
  renderClearSessionButtonState();
  renderModeTabs();

  document.querySelectorAll('.type-button').forEach((button) => {
    button.disabled = isReplayActive;
  });
  descriptionField.disabled = isReplayActive;
  clearDraftButton.disabled = isReplayActive;
  document.getElementById('addCropScreenshotBtn').disabled = isReplayActive;
  document.getElementById('exportJsonBtn').disabled = isReplayActive;
  document.getElementById('importJsonBtn').disabled = isReplayActive;
  document.getElementById('previewBtn').disabled = isReplayActive;
  document.getElementById('resetBtn').disabled = isReplayActive;

  addScreenshotButton.disabled = isReplayActive || screenshotCooldownTimer !== null;
  clearRecordingButton.disabled = isReplayActive || isRecordingActive;
}

function renderDraft() {
  const elements = getElements();
  if (!TYPE_META[currentDraft.type]) {
    currentDraft.type = DEFAULT_TYPE;
  }
  const typeMeta = TYPE_META[currentDraft.type];
  const isEditingDescription = document.activeElement === elements.descriptionField;

  document.body.dataset.type = currentDraft.type.toLowerCase();
  elements.titleLabel.textContent = typeMeta.draftTitle;
  elements.descriptionField.placeholder = typeMeta.placeholder;
  if (!isEditingDescription) {
    elements.descriptionField.value = currentDraft.description;
  }
  elements.counterLabel.textContent = formatScreenshotCount(currentDraft.imageURLs.length);

  document.querySelectorAll('.type-button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.type === currentDraft.type);
  });

  if (currentDraft.description === '' && currentDraft.imageURLs.length === 0 && clearDraftArmed) {
    clearDraftArmed = false;
  }

  renderTypeButtonLabels();
  renderClearDraftButtonState();
  renderDraftImages();
  renderRecordingControls();
  renderModeTabs();
}

function renderDraftImages() {
  const { imagesContainer } = getElements();
  hidePopupHoverPreview();

  if (currentDraft.imageURLs.length === 0) {
    imagesContainer.className = 'draft-images draft-images--empty';
    imagesContainer.innerHTML = `<p class="draft-images__empty">${escapeHtml(getMessage('popupNoScreenshotsYet', undefined, 'No screenshots yet.'))}</p>`;
    return;
  }

  imagesContainer.className = 'draft-images';
  imagesContainer.innerHTML = currentDraft.imageURLs.map((imageURL, imageIndex) => `
    <div class="draft-image-card__preview-shell">
      <img src="${imageURL}" alt="${escapeHtml(getMessage('reportScreenshotAlt', [String(imageIndex + 1)], `Screenshot ${imageIndex + 1}`))}" class="draft-image-card__preview popup-preview-image" data-preview="${imageURL}">
      <button
        class="draft-image-card__remove${armedDraftImageIndex === imageIndex ? ' is-armed' : ''}"
        data-image-index="${imageIndex}"
        title="${escapeHtml(armedDraftImageIndex === imageIndex ? getMessage('popupConfirmRemoveScreenshotTitle', undefined, 'Confirm remove screenshot') : getMessage('popupRemoveScreenshotTitle', undefined, 'Remove screenshot'))}"
        aria-label="${escapeHtml(armedDraftImageIndex === imageIndex ? getMessage('popupConfirmRemoveScreenshotTitle', undefined, 'Confirm remove screenshot') : getMessage('popupRemoveScreenshotTitle', undefined, 'Remove screenshot'))}">
        <span class="visually-hidden">${escapeHtml(armedDraftImageIndex === imageIndex ? getMessage('popupConfirmRemoveScreenshotTitle', undefined, 'Confirm remove screenshot') : getMessage('popupRemoveScreenshotTitle', undefined, 'Remove screenshot'))}</span>
      </button>
    </div>
  `).join('');
}

function renderCounters(summary) {
  const badges = {
    bugCounter: summary?.bugs || 0,
    noteCounter: summary?.notes || 0
  };

  Object.entries(badges).forEach(([elementId, value]) => {
    const target = document.getElementById(elementId);
    target.textContent = value > 0 ? ` ${value} ` : '';
  });
}

async function loadDraft() {
  const response = await sendRuntimeMessage({ type: 'getDraft' });
  currentDraft = response?.draft || currentDraft;
  renderDraft();
}

async function updateCounters() {
  const response = await sendRuntimeMessage({ type: 'getSessionData' });
  renderCounters(response);
  return response;
}

async function loadRecordingState() {
  const response = await sendRuntimeMessage({ type: 'getRecordingState' });
  const nextRecordingState = response?.recording || createEmptyRecordingState();
  const previousSignature = getRecordingStateSignature(currentRecording);
  const nextSignature = getRecordingStateSignature(nextRecordingState);

  if (previousSignature === nextSignature) {
    return;
  }

  currentRecording = nextRecordingState;
  if (
    currentRecording.status === 'recording' ||
    currentRecording.status === 'replaying' ||
    currentRecording.failedStepId
  ) {
    currentPopupMode = 'recorder';
  }
  renderRecordingControls();
}

async function persistDraft() {
  cancelScheduledDraftPersist();
  const response = await sendRuntimeMessage({
    type: 'updateDraft',
    draft: currentDraft
  });

  currentDraft = response.draft;
  renderDraft();
}

function scheduleDraftPersist() {
  cancelScheduledDraftPersist();
  persistTimer = setTimeout(() => {
    persistDraft().catch((error) => alert(error.message));
  }, 250);
}

async function selectType(typeName) {
  if (!TYPE_META[typeName]) {
    return;
  }

  setClearDraftArmed(false);

  if (currentDraft.type === typeName) {
    await saveDraftAnnotation();
    return;
  }

  currentDraft.type = typeName;
  await persistDraft();
}

async function addScreenshot() {
  setClearDraftArmed(false);
  cancelScheduledDraftPersist();
  await persistDraft();
  const response = await sendRuntimeMessage({ type: 'addDraftScreenshot' });
  currentDraft = response.draft;
  renderDraft();
}

async function addCropScreenshot() {
  setClearDraftArmed(false);
  cancelScheduledDraftPersist();
  await persistDraft();
  await sendRuntimeMessage({
    type: 'initiateCropSelection',
    draft: currentDraft
  });
  window.close();
}

async function clearDraft() {
  setClearDraftArmed(false);
  cancelScheduledDraftPersist();
  const response = await sendRuntimeMessage({
    type: 'clearDraft',
    typeName: currentDraft.type
  });

  currentDraft = response.draft;
  renderDraft();
  getElements().descriptionField.focus();
}

async function saveDraftAnnotation() {
  setClearDraftArmed(false);
  cancelScheduledDraftPersist();
  currentDraft.description = getElements().descriptionField.value;
  await persistDraft();

  const response = await sendRuntimeMessage({ type: 'createAnnotationFromDraft' });
  currentDraft = response.draft;
  renderDraft();
  renderCounters(response.summary);
  getElements().descriptionField.focus();
}

async function removeDraftImage(imageIndex) {
  setClearDraftArmed(false);
  armedDraftImageIndex = null;
  const response = await sendRuntimeMessage({
    type: 'removeDraftImage',
    imageIndex
  });

  currentDraft = response.draft;
  renderDraft();
}

async function clearRecording() {
  setClearRecordingArmed(false);
  const response = await sendRuntimeMessage({ type: 'clearRecordingData' });
  currentRecording = response.recording || createEmptyRecordingState();
  renderRecordingControls();
}

async function toggleRecording() {
  let response = null;
  if (currentRecording.status === 'recording') {
    response = await sendRuntimeMessage({
      type: 'stopRecordingFlow',
      options: {
        suppressSyntheticNavigationOnStop: true
      }
    });
  } else {
    response = await sendRuntimeMessage({ type: 'startRecordingFlow' });
  }

  currentRecording = response.recording || createEmptyRecordingState();
  if (currentRecording.status === 'recording' || currentRecording.hasRecording) {
    currentPopupMode = 'recorder';
  }
  renderRecordingControls();
}

async function playRecording() {
  currentRecording = {
    ...currentRecording,
    status: 'replaying',
    lastError: '',
    activeStepId: '',
    failedStepId: ''
  };
  renderRecordingControls();

  const response = await sendRuntimeMessage({ type: 'playRecordingFlow' });
  currentRecording = response.recording || createEmptyRecordingState();
  currentPopupMode = 'recorder';
  renderRecordingControls();
}

function startRecordingStatePolling() {
  clearInterval(recordingStatePollTimer);
  recordingStatePollTimer = setInterval(() => {
    loadRecordingState().catch(() => {});
  }, 1000);
}

async function exportSessionJSON() {
  await sendRuntimeMessage({ type: 'exportSessionJSon' });
}

async function openPreviewReport() {
  const summary = await sendRuntimeMessage({ type: 'getSessionData' });
  if (!summary?.hasExportableState) {
    return;
  }

  chrome.tabs.create({
    url: chrome.runtime.getURL('HTMLReport/preview.html'),
    active: true
  });
}

function openImportSessionPage() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('import-session.html'),
    active: true
  });
}

async function resetSession() {
  await sendRuntimeMessage({ type: 'clearSession' });
  currentDraft = {
    type: DEFAULT_TYPE,
    description: '',
    imageEntries: [],
    imageURLs: []
  };
  currentRecording = createEmptyRecordingState();
  currentPopupMode = 'action';
  lastScrolledReplayStepId = '';
  armedDraftImageIndex = null;
  setClearDraftArmed(false);
  setClearRecordingArmed(false);
  setClearSessionArmed(false);
  renderDraft();
  renderRecordingControls();
  await updateCounters();
}

function bindEvents() {
  const elements = getElements();

  document.querySelectorAll('.type-button').forEach((button) => {
    button.addEventListener('click', () => {
      selectType(button.dataset.type).catch((error) => alert(error.message));
    });
  });

  elements.descriptionField.addEventListener('input', (event) => {
    setClearDraftArmed(false);
    currentDraft.description = event.target.value;
    scheduleDraftPersist();
  });

  elements.descriptionField.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      saveDraftAnnotation().catch((error) => alert(error.message));
    }
  });

  document.getElementById('addScreenshotBtn').addEventListener('click', () => {
    setScreenshotButtonCooldown();
    addScreenshot().catch((error) => alert(error.message));
  });

  document.getElementById('addCropScreenshotBtn').addEventListener('click', () => {
    addCropScreenshot().catch((error) => alert(error.message));
  });

  document.getElementById('clearDraftBtn').addEventListener('click', () => {
    if (!clearDraftArmed) {
      setClearDraftArmed(true);
      return;
    }

    clearDraft().catch((error) => alert(error.message));
  });

  document.getElementById('clearRecordingBtn').addEventListener('click', () => {
    if (!clearRecordingArmed) {
      setClearRecordingArmed(true);
      return;
    }

    clearRecording().catch((error) => alert(error.message));
  });

  document.getElementById('draftImages').addEventListener('click', (event) => {
    const removeButton = event.target.closest('.draft-image-card__remove');
    if (!removeButton) {
      return;
    }

    const imageIndex = Number(removeButton.dataset.imageIndex);
    if (armedDraftImageIndex !== imageIndex) {
      armedDraftImageIndex = imageIndex;
      renderDraftImages();
      return;
    }

    removeDraftImage(imageIndex).catch((error) => alert(error.message));
  });

  document.addEventListener('mouseover', (event) => {
    const previewImage = event.target.closest('.popup-preview-image');
    if (!previewImage) {
      return;
    }

    showPopupHoverPreview(previewImage);
  });

  document.addEventListener('mousemove', (event) => {
    const previewImage = event.target.closest('.popup-preview-image');
    if (!previewImage || previewImage !== hoverPreviewAnchorElement) {
      return;
    }

    updatePopupHoverPreviewPosition(previewImage);
  });

  document.addEventListener('mouseout', (event) => {
    const previewImage = event.target.closest('.popup-preview-image');
    if (!previewImage || previewImage.contains(event.relatedTarget)) {
      return;
    }

    hidePopupHoverPreview();
  });

  document.getElementById('exportJsonBtn').addEventListener('click', () => {
    exportSessionJSON().catch((error) => alert(error.message));
  });

  document.getElementById('importJsonBtn').addEventListener('click', () => {
    openImportSessionPage();
  });

  document.getElementById('previewBtn').addEventListener('click', () => {
    openPreviewReport().catch((error) => alert(error.message));
  });

  elements.actionTabButton.addEventListener('click', () => {
    setPopupMode('action');
  });

  elements.recorderTabButton.addEventListener('click', () => {
    setPopupMode('recorder');
  });

  elements.recordingToggleButton.addEventListener('click', () => {
    toggleRecording().catch((error) => {
      loadRecordingState().catch(() => {});
      alert(error.message);
    });
  });

  elements.playRecordingButton.addEventListener('click', () => {
    playRecording().catch((error) => {
      console.warn('Replay failed:', error.message);
      loadRecordingState().catch(() => {});
    });
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!clearSessionArmed) {
      setClearSessionArmed(true);
      return;
    }

    resetSession().catch((error) => alert(error.message));
  });

  document.addEventListener('click', (event) => {
    if (!clearDraftArmed) {
      return;
    }

    if (event.target.closest('#clearDraftBtn')) {
      return;
    }

    setClearDraftArmed(false);
  });

  document.addEventListener('click', (event) => {
    if (!clearRecordingArmed) {
      return;
    }

    if (event.target.closest('#clearRecordingBtn')) {
      return;
    }

    setClearRecordingArmed(false);
  });

  document.addEventListener('click', (event) => {
    if (!clearSessionArmed) {
      return;
    }

    if (event.target.closest('#resetBtn')) {
      return;
    }

    setClearSessionArmed(false);
  });

  document.addEventListener('click', (event) => {
    if (armedDraftImageIndex === null) {
      return;
    }

    if (event.target.closest('.draft-image-card__remove')) {
      return;
    }

    armedDraftImageIndex = null;
    renderDraftImages();
  });

  window.addEventListener('blur', hidePopupHoverPreview);
  window.addEventListener('resize', () => {
    if (!hoverPreviewAnchorElement) {
      return;
    }

    updatePopupHoverPreviewPosition(hoverPreviewAnchorElement);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hidePopupHoverPreview();
    }
  });
}

function showPopupHoverPreview(previewImage) {
  const { popupHoverPreview } = getElements();
  const previewSource = previewImage?.dataset.preview || previewImage?.getAttribute('src') || '';
  if (!popupHoverPreview || previewSource === '') {
    return;
  }

  popupHoverPreview.querySelector('img').src = previewSource;
  popupHoverPreview.classList.add('is-active');
  popupHoverPreview.setAttribute('aria-hidden', 'false');
  hoverPreviewAnchorElement = previewImage;
  updatePopupHoverPreviewPosition(previewImage);
}

function updatePopupHoverPreviewPosition(previewImage) {
  const { popupHoverPreview } = getElements();
  if (!popupHoverPreview || !popupHoverPreview.classList.contains('is-active') || !previewImage?.isConnected) {
    return;
  }

  const anchorRect = previewImage.getBoundingClientRect();
  const previewRect = popupHoverPreview.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const gapSize = 10;
  const edgePadding = 8;
  let previewLeft = anchorRect.left + ((anchorRect.width - previewRect.width) / 2);
  let previewTop = anchorRect.top - previewRect.height - gapSize;

  if (previewTop < edgePadding) {
    previewTop = anchorRect.bottom + gapSize;
  }

  if (previewTop + previewRect.height > viewportHeight - edgePadding) {
    previewTop = Math.max(edgePadding, viewportHeight - previewRect.height - edgePadding);
  }

  if (previewLeft < edgePadding) {
    previewLeft = edgePadding;
  }

  if (previewLeft + previewRect.width > viewportWidth - edgePadding) {
    previewLeft = viewportWidth - previewRect.width - edgePadding;
  }

  popupHoverPreview.style.left = `${previewLeft}px`;
  popupHoverPreview.style.top = `${previewTop}px`;
}

function hidePopupHoverPreview() {
  const { popupHoverPreview } = getElements();
  if (!popupHoverPreview) {
    return;
  }

  popupHoverPreview.classList.remove('is-active');
  popupHoverPreview.setAttribute('aria-hidden', 'true');
  popupHoverPreview.querySelector('img').src = '';
  hoverPreviewAnchorElement = null;
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  startRecordingStatePolling();
  window.addEventListener('beforeunload', () => {
    clearInterval(recordingStatePollTimer);
  });
  renderModeTabs();
  await Promise.all([loadDraft(), updateCounters(), loadRecordingState()]);
});
