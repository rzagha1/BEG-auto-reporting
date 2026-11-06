const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const fetch = require('node-fetch');
const esri = require('../utils/esriUtils');
const config = require('../config');

let expectedWhere;
let inspectionPoints;
esri.queryEsriFeaturesBasic = async () => [{ firstname: 'Test', lastname: 'Client' }];
esri.queryFeaturesWithAttachments = async (url, fields, where) => {
    assert.equal(url, config.inspectionUrl);
    assert.equal(where, expectedWhere);
    return inspectionPoints;
};
const router = require('../routes/query');
const PandadocService = require('../services/pandaDocService');
const { DocumentsApi } = require('pandadoc-node-client');

test('inspection type reaches the report query through the HTTP endpoint', async (t) => {
    let payload;
    const calls = [];
    t.mock.method(console, 'log', () => {});
    t.mock.method(DocumentsApi.prototype, 'createDocument', async ({ documentCreateRequest }) => {
        payload = documentCreateRequest;
        calls.push('create');
        return { id: 'local-test-document' };
    });
    t.mock.method(PandadocService.prototype, 'ensureDocumentCreated', async () => calls.push('ready'));
    t.mock.method(PandadocService.prototype, 'sendDocument', async () => calls.push('send'));
    const app = express();
    app.use(express.json());
    app.use('/api', router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const post = body => fetch(`http://127.0.0.1:${server.address().port}/api/generate-report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const base = {
        email: 'local-test@example.com', management: 'BioMed Realty',
        clientName: '55 Franklin St - Garage'
    };
    const where = "ClientName='55 Franklin St - Garage' AND Share='Yes'";
    const types = ['Roof Inspection', 'Garage Inspection Points Detailed', 'Garage Pictures',
        'Window Cleaner Pictures', 'Facade Inspection Points', '', null, undefined];

    for (const template of ['Short', 'Long', 'No Issues', 'Everything']) {
        for (const quickcaptureApp of types) {
            await t.test(`${template}: ${quickcaptureApp || 'all inspection types'}`, async () => {
                expectedWhere = where + (quickcaptureApp ? ` AND QuickcaptureApp='${quickcaptureApp}'` : '');
                inspectionPoints = [{
                    objectid: 1, picUrl: 'https://example.com/roof.jpg', Category: 'Roof',
                    Choice: template === 'No Issues' ? 'Good' : 'Bad', Notes: 'Roof membrane needs repair'
                }];
                calls.length = 0;
                const response = await post({ ...base, template, quickcaptureApp });
                assert.equal(response.status, 200);
                assert.equal((await response.json()).data.documentId, 'local-test-document');
                assert.equal(payload.images.length, 1);
                assert.deepEqual(calls, ['create', 'ready', 'send']);
                if (template === 'Everything') {
                    assert.equal(payload.tokens.find(token => token.name === 'e1_notes').value,
                        'Roof membrane needs repair');
                }
            });
        }
    }

    await t.test('date range and roof filter are combined; no matches remain empty', async () => {
        expectedWhere = where + " AND (CreationDate BETWEEN Date '2026-01-01' AND Date '2026-12-31') AND QuickcaptureApp='Roof Inspection'";
        inspectionPoints = [];
        const response = await post({ ...base, template: 'Everything', quickcaptureApp: 'Roof Inspection',
            startDate: '2026-01-01', endDate: '2026-12-31' });
        assert.equal(response.status, 200);
        assert.deepEqual(payload.images, []);
        assert.ok(payload.tokens.filter(token => /_notes$/.test(token.name)).every(token => token.value === ''));
    });

    await t.test('inspection type quotes are escaped in the query', async () => {
        expectedWhere = where + " AND QuickcaptureApp='Roof''s Inspection'";
        const response = await post({ ...base, template: 'Everything', quickcaptureApp: "Roof's Inspection" });
        assert.equal(response.status, 200);
    });

    await t.test('invalid inspection type values fail before creating a document', async () => {
        calls.length = 0;
        for (const quickcaptureApp of [42, false, {}, ['Roof Inspection']]) {
            const response = await post({ ...base, template: 'Everything', quickcaptureApp });
            assert.equal(response.status, 400);
            assert.equal((await response.json()).error, 'Invalid inspection type');
        }
        assert.deepEqual(calls, []);
    });
});
