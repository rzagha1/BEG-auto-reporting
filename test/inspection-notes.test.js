const assert = require('node:assert/strict');
const { test } = require('node:test');
const esri = require('../utils/esriUtils');
const config = require('../config');

let requestedFields;
let inspectionPoints;
// Keep the report flow offline while exercising the real image grouping and payload.
esri.queryFeaturesWithAttachments = async (url, fields) => {
    assert.equal(url, config.inspectionUrl);
    requestedFields = fields;
    return inspectionPoints;
};
esri.queryEsriFeaturesBasic = async () => [{ firstname: 'Test', lastname: 'Client' }];
const QueryService = require('../services/queryService');

function captureDocument(service, t) {
    let request;
    t.mock.method(console, 'log', () => {});
    t.mock.method(service.pandadocService.apiInstance, 'createDocument', async (data) => {
        request = data.documentCreateRequest;
        return { id: 'test-draft' };
    });
    return () => request;
}

test('Condition Assessment pairs each note with its image and blanks unused slots', async (t) => {
    const service = new QueryService();
    const request = captureDocument(service, t);
    inspectionPoints = [
        { objectid: 1, picUrl: null, Notes: 'Must not shift the captions' },
        { objectid: 2, picUrl: 'https://example.com/2.jpg', Notes: 'Crack < 2 mm & [north]\nFollow up.' },
        { objectid: 3, picUrl: 'https://example.com/3.jpg', Notes: null },
        { objectid: 4, picUrl: 'https://example.com/4.jpg' },
        ...Array.from({ length: 11 }, (_, i) => ({
            objectid: i + 5, picUrl: `https://example.com/${i + 5}.jpg`, Notes: `Note ${i + 5}`
        }))
    ];
    const categoryImages = await service.getReportData('Test Building', 'Everything');
    assert.ok(requestedFields.includes('Notes'));
    assert.equal(categoryImages.e.length, 12);
    assert.deepEqual(categoryImages.e.map(image => image.objectid), Array.from({ length: 12 }, (_, i) => i + 2));
    // Payload mapping uses block IDs rather than relying on array order.
    categoryImages.e.reverse();
    await service.pandadocService.createDocumentFromTemplate({
        panddocid: config.pandaTemplateIDEverything, categoryImages
    });
    const notes = Object.fromEntries(request().tokens.filter(token => token.name.endsWith('_notes')).map(token => [token.name, token.value]));
    assert.equal(Object.keys(notes).length, 12);
    assert.equal(notes.e1_notes, inspectionPoints[1].Notes);
    assert.equal(notes.e2_notes, '');
    assert.equal(notes.e3_notes, '');
    assert.equal(notes.e12_notes, 'Note 13');
    assert.deepEqual(request().images.find(image => image.name === 'e1').urls, ['https://example.com/2.jpg?w=450']);

    await service.pandadocService.createDocumentFromTemplate({
        panddocid: config.pandaTemplateIDEverything, categoryImages: { e: [categoryImages.e.at(-1)] }
    });
    assert.equal(request().tokens.find(token => token.name === 'e1_notes').value, inspectionPoints[1].Notes);
    assert.ok(request().tokens.filter(token => /^e(?:[2-9]|1[0-2])_notes$/.test(token.name)).every(token => token.value === ''));
});

test('other report types retain their categories, limits and payloads', async (t) => {
    const service = new QueryService();
    const request = captureDocument(service, t);
    for (const [template, choice, prefix, limit, templateId] of [
        ['Short', 'bad', 'fs', 6, config.pandaTemplateIDShort],
        ['Long', 'bad', 'fs', 14, config.pandaTemplateIDLong],
        ['No Issues', 'good', 'ni', 12, config.pandaTemplateIDNoIssues]
    ]) {
        inspectionPoints = Array.from({ length: 16 }, (_, i) => ({
            objectid: i, picUrl: `https://example.com/${i}.jpg`, Category: 'Facade Surface', Choice: choice, Notes: 'Not requested'
        }));
        const categoryImages = await service.getReportData('Test Building', template);
        assert.ok(!requestedFields.includes('Notes'));
        assert.equal(categoryImages[prefix].length, limit);
        assert.equal(categoryImages[prefix][0].block_id, `${prefix}1`);
        await service.pandadocService.createDocumentFromTemplate({ panddocid: templateId, categoryImages });
        assert.ok(!request().tokens.some(token => token.name.endsWith('_notes')));
        assert.equal(request().images.length, limit);
    }
});

test('generateReport uses the Condition Assessment template and preserves draft-before-send order', async (t) => {
    const service = new QueryService();
    const request = captureDocument(service, t);
    inspectionPoints = [{ objectid: 1, picUrl: 'https://example.com/1.jpg', Notes: 'North elevation' }];
    const calls = [];
    t.mock.method(service.pandadocService, 'ensureDocumentCreated', async () => calls.push('ready'));
    t.mock.method(service.pandadocService, 'sendDocument', async () => calls.push('send'));
    await service.generateReport('test@example.com', 'Test Management', 'Test Building', 'Everything');
    assert.equal(request().templateUuid, 'ErPr5h4EdjXD6GRfVBKYHa');
    assert.equal(request().tokens.find(token => token.name === 'e1_notes').value, 'North elevation');
    assert.deepEqual(calls, ['ready', 'send']);
});
