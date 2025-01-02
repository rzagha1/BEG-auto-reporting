const { queryEsriFeatures,queryEsriFeaturesBasic, queryFeaturesWithAttachments } = require('../utils/esriUtils');
const config = require('../config');
const PandadocService = require('./pandaDocService');

class QueryService {
    constructor() {
        this.pandadocService = new PandadocService();
    }

    async getClientData() {
        try {
            const fields = ['objectid', 'globalid', 'clientname', 'management','firstname','lastname'];
            const clientData = await queryEsriFeatures(config.clientUrl, fields);
            return clientData;
        } catch (error) {
            console.error('Error fetching client data:', error);
            throw new Error('Failed to fetch client data');
        }
    }

    async getReportData(clientName) {
        try {
            const fields = [
                'objectid',
                'globalid',
                'ClientName',
                'management',
                'InspectionDate',
                'Category',
                'Choice'
            ];
            const where = `ClientName='${clientName}' AND Share='Yes'`;
            const reportData = await queryFeaturesWithAttachments(config.inspectionUrl, fields, where);
            return this.organizeCategoryImages(reportData);
        } catch (error) {
            console.error('Error fetching report data:', error);
            throw new Error('Failed to fetch report data');
        }
    }

    organizeCategoryImages(reportData) {
        const categoryImages = {};
        
        // Initialize categories
        Object.keys(CATEGORY_MAPPING).forEach(prefix => {
            categoryImages[prefix] = [];
        });

        // Process each report item
        reportData.forEach(item => {
            const itemCategory = (item.Category || '').toLowerCase();
            const itemChoice = (item.Choice || '').toLowerCase();

            // Find matching category
            let matched = false;
            for (const [prefix, category] of Object.entries(CATEGORY_MAPPING)) {
                if (category.matches.some(([cat, choices]) => 
                    cat === itemCategory && choices.includes(itemChoice)
                )) {
                    matched = true;
                    const imageIndex = categoryImages[prefix].length + 1;
                    if (imageIndex <= 6) {
                        categoryImages[prefix].push({
                            objectid: item.objectid,
                            url: item.picUrl,
                            category: itemCategory,
                            choice: itemChoice,
                            inspectionDate: item.InspectionDate,
                            pageNumber: category.page,
                            block_id: `${prefix}${imageIndex}`
                        });
                    }
                    break;
                }
            }

            // If no match found, add to other issues
            if (!matched && item.picUrl) {
                const imageIndex = categoryImages['oi'].length + 1;
                if (imageIndex <= 6) {
                    categoryImages['oi'].push({
                        objectid: item.objectid,
                        url: item.picUrl,
                        category: itemCategory,
                        choice: itemChoice,
                        inspectionDate: item.InspectionDate,
                        pageNumber: CATEGORY_MAPPING['oi'].page,
                        block_id: `oi${imageIndex}`
                    });
                }
            }
        });

        return categoryImages;
    }

    async generateReport(email,management, clientName) {
        try {
            const clientInfo = await queryEsriFeaturesBasic(config.clientUrl,['firstname','lastname'],`management='${management}' and clientname='${clientName}'`)
            const categoryImages = await this.getReportData(clientName);       
            const fn= clientInfo[0].firstname;
            const ln=clientInfo[0].lastname;
            const document = await this.pandadocService.createDocumentFromTemplate({
                email,
                clientName,
                management,
                categoryImages,
                fn,
                ln
            });

            await this.pandadocService.ensureDocumentCreated(document);
            await this.pandadocService.sendDocument(document);

            return {
                documentId: document.id,
                status: 'completed'
            };
        } catch (error) {
            console.error('Error generating report:', error);
            throw new Error(`Failed to generate report: ${error.message}`);
        }
    }
}

// Simplified category mapping using blockIdPrefix as key
const CATEGORY_MAPPING = {
    'djsc': {
        page: 4,
        matches: [
            ['caulking', ['bad', 'failed', 'large gaps', 'missing', 'old/poor condition', 'deteriorated']]
        ]
    },
    'wg': {
        page: 6,
        matches: [
            ['window glazing', ['deteriorated', 'missing']]
        ]
    },
    'csmc': {
        page: 8,
        matches: [
            ['brick', ['broken brick']],
            ['concrete', ['cracking', 'cracks', 'falling apart', 'something wrong']],
            ['stone', ['bad', 'broken', 'cracking']],
            ['facade surface', ['damaged']]
        ]
    },
    'sbsmc': {
        page: 10,
        matches: [
            ['concrete', ['spalling']],
            ['stone', ['spalling']]
        ]
    },
    'mhi': {
        page: 12,
        matches: [
            ['brick', ['bad mortar']]
        ]
    },
    'pfci': {
        page: 14,
        matches: [
            ['coating', ['needed', 'peeling', 'worn out']],
            ['paint', ['bad']]
        ]
    },
    'fs': {
        page: 16,
        matches: [
            ['concrete', ['staining']],
            ['façade surface', ['dirty', 'needs powerwash']],
            ['walls', ['dirty']]
        ]
    },
    'ws': {
        page: 18,
        matches: [
            ['glass', ['stained']]
        ]
    },
    'oi': {
        page: 20,
        matches: []  // Catches all unmatched categories
    },
    'ni': {
        page: 22,
        matches: [
            ['caulking', ['good']],
            ['glass', ['good']],
            ['window glazing', ['good']],
            ['coating', ['good']],
            ['concrete', ['good']],
            ['façade surface', ['good']],
            ['paint', ['good']],
            ['stone', ['good']],
            ['walls', ['good']]
        ]
    }
};

module.exports = QueryService;