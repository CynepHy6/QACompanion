import { JSonSessionService } from '../../src/JSonSessionService';
import { Session } from '../../src/Session';
import { Bug, Note } from '../../src/Annotation';

describe('JSonSessionService', function () {
    let jsonService;
    let testSession;

    beforeEach(function () {
        jsonService = new JSonSessionService();
        testSession = new Session(new Date(2015, 10, 30, 6, 51), {
            browser: "Chrome",
            browserVersion: "1.0.0",
            os: "TestPlatform"
        });

        testSession.addBug(new Bug("Test Bug", "http://test.com/bug", new Date(2015, 9, 30, 8, 0, 0), [
            "http://test.com/bug-1.jpg",
            "http://test.com/bug-2.jpg"
        ]));
        testSession.addNote(new Note("Test Note", "http://test.com/note", new Date(2015, 9, 30, 8, 10, 0), "http://test.com/note.jpg"));
    });

    describe('getJSon', function () {
        it('should convert session to JSON string with ids and imageURLs', function () {
            const jsonString = jsonService.getJSon(testSession);
            const parsedJson = JSON.parse(jsonString);

            expect(parsedJson.BrowserInfo).toEqual({
                browser: "Chrome",
                browserVersion: "1.0.0",
                os: "TestPlatform"
            });
            expect(typeof parsedJson.StartDateTime).toBe('number');
            expect(parsedJson.annotations).toHaveLength(2);
            expect(parsedJson.annotations[0].type).toBe('Bug');
            expect(parsedJson.annotations[0].id).toEqual(expect.any(String));
            expect(parsedJson.annotations[0].imageURLs).toEqual([
                "http://test.com/bug-1.jpg",
                "http://test.com/bug-2.jpg"
            ]);
            expect(parsedJson.annotations[0].imageURL).toBe("http://test.com/bug-1.jpg");
        });

        it('should export session with no annotations', function () {
            const emptySession = new Session(new Date(2015, 10, 30, 6, 51), {
                browser: "Chrome",
                browserVersion: "1.0.0",
                os: "TestPlatform"
            });

            const parsedJson = JSON.parse(jsonService.getJSon(emptySession));
            expect(parsedJson.annotations).toEqual([]);
        });
    });

    describe('getSession', function () {
        it('should recreate session from exported json', function () {
            const restoredSession = jsonService.getSession(jsonService.getJSon(testSession));
            const restoredAnnotations = restoredSession.getAnnotations();

            expect(restoredSession.getBrowserInfo()).toEqual(testSession.getBrowserInfo());
            expect(restoredSession.getStartDateTime().getTime()).toBe(testSession.getStartDateTime().getTime());
            expect(restoredAnnotations).toHaveLength(2);
            expect(restoredAnnotations[0].getImageURLs()).toEqual([
                "http://test.com/bug-1.jpg",
                "http://test.com/bug-2.jpg"
            ]);
            expect(restoredAnnotations[0].getId()).toEqual(expect.any(String));
        });

        it('should keep compatibility with legacy imageURL field', function () {
            const legacyJson = JSON.stringify({
                BrowserInfo: { browser: "Chrome", browserVersion: "1.0.0", os: "TestPlatform" },
                StartDateTime: new Date(2015, 10, 30, 6, 51).getTime(),
                annotations: [
                    {
                        type: "Bug",
                        name: "Legacy Bug",
                        url: "http://test.com/legacy",
                        timestamp: new Date(2015, 9, 30, 8, 0, 0).getTime(),
                        imageURL: "http://test.com/legacy.jpg"
                    }
                ]
            });

            const restoredSession = jsonService.getSession(legacyJson);
            expect(restoredSession.getAnnotations()).toHaveLength(1);
            expect(restoredSession.getAnnotations()[0].getImageURLs()).toEqual(["http://test.com/legacy.jpg"]);
        });

        it('should handle empty annotations array', function () {
            const emptySession = new Session(new Date(), "Chrome");
            const restoredSession = jsonService.getSession(jsonService.getJSon(emptySession));

            expect(restoredSession.getAnnotations()).toHaveLength(0);
        });

        it('should normalize unexpected structures instead of throwing for valid JSON', function () {
            const emptyObjectSession = jsonService.getSession("{}");
            const emptyArraySession = jsonService.getSession("[]");
            const customObjectSession = jsonService.getSession('{ "foo": "bar" }');

            expect(emptyObjectSession.getAnnotations()).toEqual([]);
            expect(emptyArraySession.getAnnotations()).toEqual([]);
            expect(customObjectSession.getAnnotations()).toEqual([]);
        });

        it('should throw error for invalid JSON string', function () {
            expect(() => {
                jsonService.getSession("this is not json");
            }).toThrow(SyntaxError);
        });
    });

    describe('getAnnotaionFromType', function () {
        it('should create correct annotation type from JSON', function () {
            const bugJson = {
                type: "Bug",
                name: "Test Bug",
                url: "http://test.com",
                timestamp: new Date().getTime(),
                imageURLs: ["http://test.com/bug.jpg"]
            };

            const noteJson = {
                type: "Note",
                name: "Test Note",
                url: "http://test.com",
                timestamp: new Date().getTime(),
                imageURL: "http://test.com/note.jpg"
            };

            const unknownJson = {
                type: "Unsupported",
                name: "Unsupported Type",
                url: "http://test.com",
                timestamp: new Date().getTime()
            };

            expect(jsonService.getAnnotaionFromType(bugJson) instanceof Bug).toBe(true);
            expect(jsonService.getAnnotaionFromType(noteJson) instanceof Note).toBe(true);
            expect(jsonService.getAnnotaionFromType(unknownJson)).toBeNull();
        });
    });
});