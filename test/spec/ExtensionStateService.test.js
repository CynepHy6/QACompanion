import { Bug, Note } from '../../src/Annotation';
import { ExtensionStateService, hasAnnotationRecordings, hasDraftContent, hasExportableState, hasRecordingContent } from '../../src/ExtensionStateService';
import { Session } from '../../src/Session';

describe('ExtensionStateService', function () {
    let extensionStateService;
    let testSession;
    let draftState;
    let draftRecordingState;
    let annotationRecordingsById;

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

        draftRecordingState = {
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

        annotationRecordingsById = {
            'bug-identifier': {
                id: 'bug-recording',
                status: 'idle',
                startedAt: new Date(2026, 4, 8, 21, 50).getTime(),
                stoppedAt: new Date(2026, 4, 8, 21, 51).getTime(),
                tabId: null,
                lastKnownUrl: 'http://example.test/bug',
                lastError: '',
                activeStepId: '',
                failedStepId: '',
                steps: [
                    {
                        stepId: 'bug-step-1',
                        type: 'click',
                        url: 'http://example.test/bug',
                        timestamp: new Date(2026, 4, 8, 21, 50, 10).getTime(),
                        locator: {
                            strategy: 'css',
                            value: '.submit'
                        },
                        value: '',
                        inputType: '',
                        tagName: 'BUTTON',
                        text: 'Save',
                        screenshotRef: 'bug-shot-1'
                    }
                ],
                screenshots: [
                    {
                        id: 'bug-shot-1',
                        imageURL: 'data:image/jpeg;base64,bug-recording-shot',
                        createdAt: new Date(2026, 4, 8, 21, 50, 11).getTime(),
                        triggerStepId: 'bug-step-1'
                    }
                ]
            }
        };
    });

    it('should export a compact full-state JSON without legacy image fields', function () {
        const exportedJson = extensionStateService.getJSON(testSession, draftState, draftRecordingState, annotationRecordingsById);
        const exportedState = JSON.parse(exportedJson);

        expect(exportedState.version).toBe(5);
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
        expect(exportedState.draftRecording.status).toBe('idle');
        expect(exportedState.draftRecording.tabId).toBeNull();
        expect(exportedState.draftRecording.activeStepId).toBe('');
        expect(exportedState.draftRecording.failedStepId).toBe('');
        expect(exportedState.draftRecording.lastError).toBe('');
        expect(exportedState.annotationRecordingsById['bug-identifier']).toEqual(
            expect.objectContaining({
                status: 'idle',
                steps: expect.any(Array),
                screenshots: expect.any(Array)
            })
        );
        expect(exportedState.annotationRecordingsById[exportedState.draftAnnotationId]).toEqual(
            expect.objectContaining({
                status: 'idle',
                steps: expect.any(Array)
            })
        );
    });

    it('should restore session annotations, draft replay and per-annotation recordings from exported JSON', function () {
        const exportedJson = extensionStateService.getJSON(testSession, draftState, draftRecordingState, annotationRecordingsById);
        const restoredState = extensionStateService.getState(exportedJson);

        expect(restoredState.session.getAnnotations()).toHaveLength(2);
        expect(restoredState.session.getAnnotations()[0].getName()).toBe('Тестовый баг');
        expect(restoredState.session.getAnnotations()[0].getImageEntries()).toEqual([
            expect.objectContaining({
                imageURL: 'data:image/png;base64,bug-shot',
                createdAt: expect.any(Number)
            })
        ]);
        expect(restoredState.draft).toEqual({
            type: 'Note',
            description: 'Черновик не должен становиться аннотацией',
            imageEntries: [
                expect.objectContaining({
                    imageURL: 'data:image/png;base64,draft-shot',
                    createdAt: expect.any(Number)
                })
            ],
            imageURLs: ['data:image/png;base64,draft-shot']
        });
        expect(restoredState.draftRecording.status).toBe('idle');
        expect(restoredState.draftRecording.steps).toHaveLength(2);
        expect(restoredState.draftRecording.screenshots).toHaveLength(1);
        expect(restoredState.draftRecording.steps[1].screenshotRef).toBe('shot-1');
        expect(restoredState.annotationRecordingsById['bug-identifier'].steps).toHaveLength(1);
    });

    it('should map legacy global recording to a saved annotation on import', function () {
        const importedJson = JSON.stringify({
            version: 4,
            session: {
                startDateTime: new Date(2026, 4, 8, 21, 41).getTime(),
                browserInfo: {
                    browser: 'Chrome',
                    browserVersion: '1.0',
                    os: 'Linux'
                },
                annotations: [
                    {
                        id: 'legacy-annotation',
                        type: 'Bug',
                        name: 'Legacy bug',
                        url: 'http://example.test/legacy',
                        timestamp: new Date(2026, 4, 8, 21, 41).getTime(),
                        imageEntries: []
                    }
                ]
            },
            recording: draftRecordingState
        });

        const restoredState = extensionStateService.getState(importedJson);

        expect(restoredState.session.getAnnotations()).toHaveLength(1);
        expect(restoredState.draft).toEqual({
            type: 'Bug',
            description: '',
            imageEntries: [],
            imageURLs: []
        });
        expect(restoredState.annotationRecordingsById['legacy-annotation'].steps).toHaveLength(2);
    });

    it('should report when draft, replays or annotations make state exportable', function () {
        const emptySession = new Session(new Date(2026, 4, 8, 21, 41), {
            browser: 'Chrome',
            browserVersion: '1.0',
            os: 'Linux'
        });

        expect(hasExportableState(emptySession, {}, {})).toBe(false);
        expect(hasDraftContent(draftState)).toBe(true);
        expect(hasRecordingContent(draftRecordingState)).toBe(true);
        expect(hasAnnotationRecordings(annotationRecordingsById)).toBe(true);
        expect(hasExportableState(emptySession, draftState, {}, {})).toBe(true);
        expect(hasExportableState(emptySession, {}, draftRecordingState, {})).toBe(true);
        expect(hasExportableState(emptySession, {}, {}, annotationRecordingsById)).toBe(true);
        expect(hasExportableState(testSession, {}, {})).toBe(true);
    });
});
