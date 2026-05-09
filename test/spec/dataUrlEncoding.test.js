import { createBase64DataUrl, encodeUtf8TextToBase64 } from '../../src/dataUrlEncoding';

function decodeBase64ToUtf8(base64Content) {
    return Buffer.from(base64Content, 'base64').toString('utf-8');
}

describe('dataUrlEncoding', function () {
    describe('encodeUtf8TextToBase64', function () {
        it('should encode unicode text without throwing', function () {
            const unicodeText = 'Привет, мир! Тест JSON export with emoji: 🚀';
            const encodedContent = encodeUtf8TextToBase64(unicodeText);

            expect(decodeBase64ToUtf8(encodedContent)).toBe(unicodeText);
        });
    });

    describe('createBase64DataUrl', function () {
        it('should create a utf-8 data url for json content', function () {
            const jsonContent = JSON.stringify({
                title: 'Сессия',
                description: 'Проверка экспорта',
                emoji: '✅'
            });

            const dataUrl = createBase64DataUrl('application/json', jsonContent);

            expect(dataUrl.startsWith('data:application/json;charset=utf-8;base64,')).toBe(true);

            const base64Content = dataUrl.split(',')[1];
            expect(decodeBase64ToUtf8(base64Content)).toBe(jsonContent);
        });
    });
});
