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

    async getReportData(clientName, template,startDate, endDate) {
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
    
            let where = `ClientName='${clientName}' AND Share='Yes'`;
            
            // Add date filters only if both dates are provided
            if (startDate && endDate) {
                where += ` AND (CreationDate BETWEEN  Date '${startDate}' and Date '${endDate}')`;
                
            }  
            const reportData = await queryFeaturesWithAttachments(config.inspectionUrl, fields, where);
            if (template ==='Long'){
                return this.organizeCategoryImages(reportData,14);
            }
            else {return this.organizeCategoryImages(reportData,6) }

        } catch (error) {
            console.error('Error fetching report data:', error);
            throw new Error('Failed to fetch report data');
        }
    }

    organizeCategoryImages(reportData,shortlong) {
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
                    if (imageIndex <= shortlong) {
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
                if (imageIndex <= shortlong) {
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

    async generateReport(email,management, clientName,template,startdate,enddate) {
        try {
            const basicFieldsClient=['firstname','lastname','Bspec_Type','BSpec_Height','BSpec_Materials'];
            const clientInfo = await queryEsriFeaturesBasic(config.clientUrl,basicFieldsClient,`management='${management}' and clientname='${clientName}'`);
            const ci=clientInfo[0];
            const categoryImages = await this.getReportData(clientName,template,startdate,enddate);     
            const fn= ci.firstname;
            const ln=ci.lastname;
            const bspec_type=ci.Bspec_Type;
            const bspec_height=ci.BSpec_Height;
            const bspec_materials=ci.BSpec_Materials;

            let panddocid;
            if (template ==='Long'){
                panddocid=config.pandaTemplateIDLong;
            }
            else if(template==='Short'){
                panddocid=config.pandaTemplateIDShort;
            }

            const document = await this.pandadocService.createDocumentFromTemplate({
                email,
                clientName,
                management,
                categoryImages,
                fn,
                ln,
                bspec_height,
                bspec_materials,
                bspec_type,
                panddocid
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
        matches: [
            ['caulking', ['bad', 'failed', 'large gaps', 'missing', 'old/poor condition', 'deteriorated']]
        ]
    },
    'wg': {
        matches: [
            ['window glazing', ['deteriorated', 'missing']]
        ]
    },
    'cbsmc': {
        matches: [
            ['brick', ['broken brick']],
            ['concrete', ['cracking', 'cracks', 'falling apart', 'something wrong']],
            ['stone', ['bad', 'broken', 'cracking']],
            ['facade surface', ['damaged']]
        ]
    },
    'sbsmc': {
        matches: [
            ['concrete', ['spalling']],
            ['stone', ['spalling']]
        ]
    },
    'mji': {
        matches: [
            ['brick', ['bad mortar']]
        ]
    },
    'pfci': {
        matches: [
            ['coating', ['needed', 'peeling', 'worn out']],
            ['paint', ['bad']]
        ]
    },
    'fs': {
        matches: [
            ['concrete', ['staining']],
            ['façade surface', ['dirty', 'needs powerwash']],
            ['walls', ['dirty']]
        ]
    },
    'ws': {
        matches: [
            ['glass', ['stained']]
        ]
    },
    'oi': {
        matches: []  // Catches all unmatched categories
    },
    'ni': {
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