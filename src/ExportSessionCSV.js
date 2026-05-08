export class ExportSessionCSV {
    constructor(session) {
        this.session = session;
    }

    getCSVData() {
        let csvData = "TimeStamp,Type,Name,URL,ScreenshotCount\n";
        const annotations = this.session.getAnnotations();

        for (let annotationIndex = 0; annotationIndex < annotations.length; annotationIndex++) {
            const annotation = annotations[annotationIndex];
            const timeStamp = annotation.getTimeStamp().toString('dd-MM-yyyy HH:mm');
            const type = annotation.getType();
            const name = annotation.getName();
            const url = annotation.getURL();
            const screenshotCount = annotation.getImageURLs().length;

            csvData += `${timeStamp},${type},${name},${url},${screenshotCount}\n`;
        }

        return csvData;
    }

    downloadCSVFile() {
        var pom = document.createElement('a');
        var csvContent = this.getCSVData(); //here we load our csv data
        var blob = new Blob([csvContent], {
            type: 'text/csv;charset=utf-8;'
        });
        var url = URL.createObjectURL(blob);
        pom.href = url;
        pom.setAttribute('download', 'foo.csv');
        pom.click();
    }
}