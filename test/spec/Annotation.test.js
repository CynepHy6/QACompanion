import { Annotation, Bug, Note } from '../../src/Annotation';

describe('Annotation Classes', function () {
    let testName = "Test Annotation";
    let testUrl = "http://test.com";
    let testTimestamp = new Date().getTime();
    let testImageUrl = "http://test.com/image.jpg";

    describe('Base Annotation Class', function () {
        let annotation;

        beforeEach(function () {
            annotation = new Annotation(testName, testUrl, testTimestamp, testImageUrl);
        });

        it('should create an annotation with correct properties', function () {
            expect(typeof annotation.getId()).toBe('string');
            expect(annotation.getName()).toBe(testName);
            expect(annotation.getURL()).toBe(testUrl);
            expect(annotation.getTimeStamp().getTime()).toBe(testTimestamp);
            expect(annotation.getImageURL()).toBe(testImageUrl);
            expect(annotation.getImageURLs()).toEqual([testImageUrl]);
            expect(annotation.getImageEntries()).toEqual([
                expect.objectContaining({
                    imageURL: testImageUrl,
                    createdAt: expect.any(Number)
                })
            ]);
        });

        it('should allow changing the name', function () {
            const newName = "New Name";
            annotation.setName(newName);
            expect(annotation.getName()).toBe(newName);
        });

        it('should allow changing the image URL', function () {
            const newImageUrl = "http://test.com/new-image.jpg";
            annotation.setImageURL(newImageUrl);
            expect(annotation.getImageURL()).toBe(newImageUrl);
            expect(annotation.getImageURLs()).toEqual([newImageUrl]);
        });

        it('should support multiple image URLs', function () {
            annotation.addImages([
                "http://test.com/second-image.jpg",
                "http://test.com/third-image.jpg"
            ]);

            expect(annotation.getImageURLs()).toEqual([
                testImageUrl,
                "http://test.com/second-image.jpg",
                "http://test.com/third-image.jpg"
            ]);
            expect(annotation.getImageEntries()).toHaveLength(3);
        });
    });

    describe('Bug Class', function () {
        let bug;

        beforeEach(function () {
            bug = new Bug(testName, testUrl, testTimestamp, testImageUrl);
        });

        it('should create a bug with correct type', function () {
            expect(bug.getType()).toBe("Bug");
        });

        it('should inherit from Annotation', function () {
            expect(bug instanceof Annotation).toBe(true);
        });
    });

    describe('Note Class', function () {
        let note;

        beforeEach(function () {
            note = new Note(testName, testUrl, testTimestamp, testImageUrl);
        });

        it('should create a note with correct type', function () {
            expect(note.getType()).toBe("Note");
        });

        it('should inherit from Annotation', function () {
            expect(note instanceof Annotation).toBe(true);
        });
    });
}); 