import { Bug, Note } from '../../src/Annotation';
import { ExtensionStateService, hasDraftContent, hasExportableState, hasRecordingContent } from '../../src/ExtensionStateService';
import { Session } from '../../src/Session';

describe('ExtensionStateService', function () {
    let extensionStateService;
    let testSession;
    let draftState;
    let recordingState;

    beforeEach(function () {
        extensionStateService = new ExtensionStateService();
        testSession = new Session(new Date(2026, 4, 8, 21, 41), {
            browser: 'Chrome',
            browserVersion: '1.0',
            os: 'Linux'
        });

        testSession.addBug(new Bug(
            'Тестовый баг',
            'http://example.test/bug',
            new Date(2026, 4, 8, 21, 45),
            [
                {
                    imageURL: 'data:image/png;base64,bug-shot',
                    createdAt: new Date(2026, 4, 8, 21, 45, 10).getTime()
                }
            ],
            'bug-identifier'
        ));

        testSession.addNote(new Note(
            'Тестовая заметка',
            'http://example.test/note',
            new Date(2026, 4, 8, 21, 46),
            [],
            'note-identifier'
        ));

        draftState = {
            type: 'Note',
            description: 'Черновик не должен становиться аннотацией',
            imageEntries: [
                {
                    imageURL: 'data:image/png;base64,draft-shot',
                    createdAt: new Date(2026, 4, 8, 21, 47).getTime()
                }
            ]
        };

        recordingState = {
            id: 'recording-identifier',
            status: 'recording',
            startedAt: new Date(2026, 4, 8, 21, 48).getTime(),
            stoppedAt: new Date(2026, 4, 8, 21, 49).getTime(),
            tabId: 123,
            lastKnownUrl: 'http://example.test/page',
            lastError: 'temporary',
            activeStepId: 'step-2',
            failedStepId: 'step-2',
            steps: [
                {
                    stepId: 'step-1',
                    type: 'input',
                    url: 'http://example.test/page',
                    timestamp: new Date(2026, 4, 8, 21, 48, 10).getTime(),
                    locator: {
                        strategy: 'css',
                        value: '#field',
                        name: 'Field'
                    },
                    value: 'Draft text',
                    inputType: 'text',
                    tagName: 'INPUT',
                    text: '',
                    screenshotRef: ''
                },
                {
                    stepId: 'step-2',
                    type: 'click',
                    url: 'http://example.test/page',
                    timestamp: new Date(2026, 4, 8, 21, 48, 20).getTime(),
                    locator: {
                        strategy: 'text',
                        value: 'Submit'
                    },
                    value: '',
                    inputType: '',
                    tagName: 'BUTTON',
                    text: 'Submit',
                    screenshotRef: 'shot-1'
                }
            ],
            screenshots: [
                {
                    id: 'shot-1',
                    imageURL: 'data:image/png;base64,recording-shot',
                    createdAt: new Date(2026, 4, 8, 21, 48, 21).getTime(),
                    triggerStepId: 'step-2'
                }
            ]
        };
    });

    it('should export a compact full-state JSON without legacy image fields', function () {
        const exportedJson = extensionStateService.getJSON(testSession, draftState, recordingState);
        const exportedState = JSON.parse(exportedJson);

        expect(exportedState.version).toBe(4);
        expect(exportedState.session.annotations).toHaveLength(3);
        expect(exportedState.session.annotations[0].imageEntries).toEqual([
            expect.objectContaining({
                imageURL: 'data:image/png;base64,bug-shot',
                createdAt: expect.any(Number)
            })
        ]);
        expect(exportedState.session.annotations[0].imageURL).toBeUndefined();
        expect(exportedState.session.annotations[0].imageURLs).toBeUndefined();
        expect(exportedState.session.annotations[2]).toEqual(
            expect.objectContaining({
                type: 'Note',
                name: 'Черновик не должен становиться аннотацией',
                imageEntries: [
                    expect.objectContaining({
                        imageURL: 'data:image/png;base64,draft-shot',
                        createdAt: expect.any(Number)
                    })
                ]
            })
        );
        expect(exportedState.draft).toBeUndefined();
        expect(exportedState.recording.status).toBe('idle');
        expect(exportedState.recording.tabId).toBeNull();
        expect(exportedState.recording.activeStepId).toBe('');
        expect(exportedState.recording.failedStepId).toBe('');
        expect(exportedState.recording.lastError).toBe('');
    });

    it('should restore session annotations and recording from exported JSON', function () {
        const exportedJson = extensionStateService.getJSON(testSession, draftState, recordingState);
        const restoredState = extensionStateService.getState(exportedJson);

        expect(restoredState.session.getAnnotations()).toHaveLength(3);
        expect(restoredState.session.getAnnotations()[0].getName()).toBe('Тестовый баг');
        expect(restoredState.session.getAnnotations()[0].getImageEntries()).toEqual([
            expect.objectContaining({
                imageURL: 'data:image/png;base64,bug-shot',
                createdAt: expect.any(Number)
            })
        ]);
        expect(restoredState.session.getAnnotations()[2].getType()).toBe('Note');
        expect(restoredState.session.getAnnotations()[2].getName()).toBe('Черновик не должен становиться аннотацией');
        expect(restoredState.draft).toEqual({
            type: 'Bug',
            description: '',
            imageEntries: [],
            imageURLs: []
        });
        expect(restoredState.recording.status).toBe('idle');
        expect(restoredState.recording.steps).toHaveLength(2);
        expect(restoredState.recording.screenshots).toHaveLength(1);
        expect(restoredState.recording.steps[1].screenshotRef).toBe('shot-1');
    });

    it('should ignore draft field during import because export folds draft into session', function () {
        const importedJson = JSON.stringify({
            version: 4,
            session: {
                startDateTime: new Date(2026, 4, 8, 21, 41).getTime(),
                browserInfo: {
                    browser: 'Chrome',
                    browserVersion: '1.0',
                    os: 'Linux'
                },
                annotations: []
            },
            draft: draftState,
            recording: recordingState
        });

        const restoredState = extensionStateService.getState(importedJson);

        expect(restoredState.session.getAnnotations()).toHaveLength(0);
        expect(restoredState.draft).toEqual({
            type: 'Bug',
            description: '',
            imageEntries: [],
            imageURLs: []
        });
    });

    it('should report when draft, recording or annotations make state exportable', function () {
        const emptySession = new Session(new Date(2026, 4, 8, 21, 41), {
            browser: 'Chrome',
            browserVersion: '1.0',
            os: 'Linux'
        });

        expect(hasExportableState(emptySession, {}, {})).toBe(false);
        expect(hasDraftContent(draftState)).toBe(true);
        expect(hasRecordingContent(recordingState)).toBe(true);
        expect(hasExportableState(emptySession, draftState, {})).toBe(true);
        expect(hasExportableState(emptySession, {}, recordingState)).toBe(true);
        expect(hasExportableState(testSession, {}, {})).toBe(true);
    });
});
