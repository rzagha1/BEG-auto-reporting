const { queryEsriFeatures, queryFeaturesWithAttachments } = require('../utils/esriUtils');
const config = require('../config');
const PandadocService = require('./pandaDocService');

class QueryService {
    constructor() {
        this.pandadocService = new PandadocService();
    }

    async getClientData() {
        try {
            const fields = ['objectid', 'globalid', 'clientname', 'management'];
            const clientData = await queryEsriFeatures(config.clientUrl, fields);
            return clientData;
        } catch (error) {
            console.error('Error fetching client data:', error);
            throw new Error('Failed to fetch client data');
        }
    }

    async getReportData(management, clientName) {
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
        Object.keys(REPORT_CATEGORIES).forEach(category => {
            categoryImages[category] = [];
        });

        // Process each report item
        reportData.forEach(item => {
            const itemCategory = (item.Category || '').toLowerCase();
            const itemChoice = (item.Choice || '').toLowerCase();

            // Check each report category
            Object.entries(REPORT_CATEGORIES).forEach(([key, reportCategory]) => {
                const matches = reportCategory.conditions.some(condition => 
                    condition.category.toLowerCase() === itemCategory &&
                    condition.choices.includes(itemChoice)
                );

                if (matches && item.picUrl) {
                    // Get current count of images in this category
                    const imageIndex = categoryImages[key].length + 1;
                    
                    // Only add if we haven't reached 6 images yet
                    if (imageIndex <= 6) {
                        categoryImages[key].push({
                            objectid: item.objectid,
                            url: item.picUrl,
                            category: itemCategory,
                            choice: itemChoice,
                            inspectionDate: item.InspectionDate,
                            pageNumber: reportCategory.pageNumber,
                            block_id: `${reportCategory.blockIdPrefix}${imageIndex}`
                        });
                    }
                }
            });
        });
        return categoryImages;
    }

    async generateReport(management, clientName) {
        try {
            const categoryImages = await this.getReportData(management, clientName);
  
            const document = await this.pandadocService.createDocumentFromTemplate({
                clientName,
                management,
                categoryImages
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

const REPORT_CATEGORIES = {
    'deterioratedJointSealants': {
        pageNumber: 4,
        title: 'DETERIORATED JOINT SEALANTS (CAULKING)',
        blockIdPrefix: 'djsc',
        conditions: [
            { 
                category: 'caulking', 
                choices: ['bad', 'failed', 'large gaps', 'missing', 'old/poor condition', 'deteriorated']
            }
        ]
    },
    'windowGlazing': {
        pageNumber: 6,
        title: 'WINDOW GLAZING',
        blockIdPrefix: 'wg',
        conditions: [
            { 
                category: 'window glazing', 
                choices: ['deteriorated', 'missing']
            }
        ]
    },
    'crackedMasonry': {
        pageNumber: 8,
        title: 'CRACKED BRICK, STONE, MASONRY, OR CONCRETE',
        blockIdPrefix: 'csmc',
        conditions: [
            { category: 'brick', choices: ['broken brick'] },
            { category: 'concrete', choices: ['cracking', 'cracks', 'falling apart', 'something wrong'] },
            { category: 'stone', choices: ['bad', 'broken', 'cracking'] },
            { category: 'facade surface', choices: ['damaged'] }
        ]
    },
    'spalledMasonry': {
        pageNumber: 10,
        title: 'SPALLED BRICK, STONE, MASONRY, CONCRETE',
        blockIdPrefix: 'sbsmc',
        conditions: [
            { category: 'concrete', choices: ['spalling'] },
            { category: 'stone', choices: ['spalling'] }
        ]
    },
    'mortarJoints': {
        pageNumber: 12,
        title: 'MORTAR JOINTS ISSUES',
        blockIdPrefix: 'mhi',
        conditions: [
            { category: 'brick', choices: ['bad mortar'] }
        ]
    },
    'paintCoating': {
        pageNumber: 14,
        title: 'PAINT / FACADE COATING ISSUES',
        blockIdPrefix: 'pfci',
        conditions: [
            { category: 'coating', choices: ['needed', 'peeling', 'worn out'] },
            { category: 'paint', choices: ['bad'] }
        ]
    },
    'facadeStaining': {
        pageNumber: 16,
        title: 'FACADE STAINING',
        blockIdPrefix: 'fs',
        conditions: [
            { category: 'concrete', choices: ['staining'] },
            { category: 'façade surface', choices: ['dirty', 'needs powerwash'] },
            { category: 'walls', choices: ['dirty'] }
        ]
    },
    'windowStaining': {
        pageNumber: 18,
        title: 'WINDOW STAINING',
        blockIdPrefix: 'ws',
        conditions: [
            { category: 'glass', choices: ['stained'] }
        ]
    },
    'noIssues': {
        pageNumber: 22,
        title: 'NO ISSUES',
        blockIdPrefix: 'ni',
        conditions: [
            { category: 'caulking', choices: ['good'] },
            { category: 'glass', choices: ['good'] },
            { category: 'window glazing', choices: ['good'] },
            { category: 'coating', choices: ['good'] },
            { category: 'concrete', choices: ['good'] },
            { category: 'façade surface', choices: ['good'] },
            { category: 'paint', choices: ['good'] },
            { category: 'stone', choices: ['good'] },
            { category: 'walls', choices: ['good'] }
        ]
    }
};

module.exports = QueryService;