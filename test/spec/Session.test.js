import { Session } from '../../src/Session';
import { Bug, Note } from '../../src/Annotation';

describe('Exploratory Session', function () {
    describe('when Session starts', function () {
        it('should store starting DateTime and Browser Info', function () {
            const browserInfo = {
                browser: 'TestBrowser',
                browserVersion: '0.987.1',
                os: 'Test Os',
                osVersion: '1.2.3',
                cookies: true,
                flashVersion: 'flash 21'
            };
            const currentDateTime = new Date(2015, 10, 30, 6, 51);

            const session = new Session(currentDateTime, browserInfo);

            expect(session.getBrowserInfo().browser).toEqual('TestBrowser');
            expect(session.getBrowserInfo().os).toEqual('Test Os');
            expect(session.getBrowserInfo().osVersion).toEqual('1.2.3');
            expect(session.getStartDateTime()).toEqual(currentDateTime);
        });
    });

    describe('annotation management', function () {
        let session;

        beforeEach(function () {
            session = new Session(new Date(2015, 10, 30, 6, 51), 'TestBrowser 10.0.1.3');
        });

        it('annotations should be empty at the beginning', function () {
            expect(session.getAnnotations().length).toEqual(0);
        });

        it('should add bug and note annotations', function () {
            const newBug = new Bug('Add a new bug test', 'http://myTestPage.com');
            const newNote = new Note('Add a new note test', 'http://myTestPage.com/note');

            session.addBug(newBug);
            session.addNote(newNote);

            const annotations = session.getAnnotations();
            expect(annotations.length).toEqual(2);
            expect(annotations[0] instanceof Bug).toBeTruthy();
            expect(annotations[1] instanceof Note).toBeTruthy();
        });

        it('should retrieve annotations by type', function () {
            session.addBug(new Bug('Add Bug'));
            session.addNote(new Note('Add Note'));
            session.addBug(new Bug('Add Bug2'));
            session.addNote(new Note('Add Note2'));
            session.addBug(new Bug('Add Bug3'));

            expect(session.getBugs().length).toEqual(3);
            expect(session.getNotes().length).toEqual(2);
        });

        it('should update annotation description by id', function () {
            const firstBug = new Bug('Add Bug');
            const firstNote = new Note('Add Note');
            session.addBug(firstBug);
            session.addNote(firstNote);

            const bugUpdated = session.updateAnnotationName(firstBug.getId(), 'new bug name');
            const noteUpdated = session.updateAnnotationName(firstNote.getId(), 'new note name');

            expect(bugUpdated).toBe(true);
            expect(noteUpdated).toBe(true);
            expect(session.getAnnotations()[0].getName()).toEqual('new bug name');
            expect(session.getAnnotations()[1].getName()).toEqual('new note name');
        });

        it('session annotations can be deleted by id', function () {
            const firstBug = new Bug('Add Bug');
            const firstNote = new Note('Add Note');
            session.addBug(firstBug);
            session.addNote(firstNote);

            expect(session.getAnnotations().length).toEqual(2);

            session.deleteAnnotation(firstBug.getId());

            const annotations = session.getAnnotations();
            expect(annotations.length).toEqual(1);
            expect(annotations[0].getName()).toEqual('Add Note');
        });
    });

    describe('deleteAnnotation edge cases', function () {
        let session;

        beforeEach(function () {
            session = new Session(new Date(), 'TestBrowser');
            session.addBug(new Bug('Bug 1', 'url1'));
            session.addNote(new Note('Note 1', 'url2'));
        });

        it('should not change annotations if index is -1', function () {
            const initialAnnotations = [...session.getAnnotations()];
            session.deleteAnnotation(-1);
            expect(session.getAnnotations()).toEqual(initialAnnotations);
        });

        it('should not change annotations if index is equal to annotations length', function () {
            const initialAnnotations = [...session.getAnnotations()];
            session.deleteAnnotation(initialAnnotations.length);
            expect(session.getAnnotations()).toEqual(initialAnnotations);
        });

        it('should not change annotations if index is greater than annotations length', function () {
            const initialAnnotations = [...session.getAnnotations()];
            session.deleteAnnotation(initialAnnotations.length + 1);
            expect(session.getAnnotations()).toEqual(initialAnnotations);
        });

        it('should not throw an error or change annotations if list is empty and delete is attempted', function () {
            const emptySession = new Session(new Date(), 'EmptyBrowser');
            expect(emptySession.getAnnotations().length).toBe(0);

            expect(() => {
                emptySession.deleteAnnotation(0);
            }).not.toThrow();
            expect(emptySession.getAnnotations().length).toBe(0);

            expect(() => {
                emptySession.deleteAnnotation(-1);
            }).not.toThrow();
            expect(emptySession.getAnnotations().length).toBe(0);
        });
    });
});