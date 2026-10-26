const { queryEsriFeatures, queryEsriFeaturesBasic, queryFeaturesWithAttachments } = require('../utils/esriUtils');
const config = require('../config');
const PandadocService = require('./pandaDocService');

// Category mappings
const SHORT_LONG_CATEGORY_MAPPING = {
    'fs': {
        page: 1,
        matches: [
            ['facade surface', ['bad']]
        ]
    },
    'djsc': {
        page: 2,
        matches: [
            ['caulking', ['bad']],
            ['glazing', ['bad']],
            ['window glazing', ['bad']]
        ]
    },
    'cbsmc': {
        page: 3,
        matches: [
            ['brick', ['bad']],
            ['stone', ['bad']],
            ['concrete', ['bad']],
        ]
    },
    'oi': {
        page: 4,
        matches: [
            ['anchor', ['bad']],
            ['coating', ['bad']],  
            ['drains', ['bad']],
            ['glass', ['bad']],
            ['metal', ['bad']],
            ['other', ['bad']],
            ['roof', ['bad']]
        ]
    }
};

const NO_ISSUES_MAPPING = {
    'ni': {
        page: 1,
        matches: [
            ['anchor', ['good']],
            ['brick', ['good']],
            ['caulking', ['good']],
            ['coating', ['good']],
            ['concrete', ['good']],
            ['drains', ['good']],
            ['facade surface', ['good']],
            ['glass', ['good']],
            ['glazing', ['good']],
            ['metal', ['good']],
            ['other', ['good']],
            ['roof', ['good']],
            ['stone', ['good']],
            ['window glazing', ['good']]
        ]
    }
};

const EVERYTHING_MAPPING = {
    'e': {}
    
};

class QueryService {
    constructor() {
        this.pandadocService = new PandadocService();
    }

    async getClientData() {
        try {
            const fields = ['objectid', 'globalid', 'clientname', 'management', 'firstname', 'lastname'];
            return await queryEsriFeatures(config.clientUrl, fields);
        } catch (error) {
            console.error('Error fetching client data:', error);
            throw error;
        }
    }

    async getReportData(clientName, template, startDate, endDate, quickcaptureApp) {
        try {
            const fields = [
                'objectid', 'globalid', 'ClientName', 'management',
                'InspectionDate', 'Category', 'Choice'
            ];
    
            if (template === 'Everything') fields.push('Notes');

            let where = `ClientName='${clientName}' AND Share='Yes'`;
            
            if (startDate && endDate) {
                where += ` AND (CreationDate BETWEEN Date '${startDate}' AND Date '${endDate}')`;
            }
            if (quickcaptureApp && quickcaptureApp !== "") {
                where += ` AND QuickcaptureApp='${quickcaptureApp}'`;
            }
            
            const reportData = await queryFeaturesWithAttachments(config.inspectionUrl, fields, where);
            
            // Handle "Everything" template specially
            if (template === 'Everything') {
                return this.organizeEverythingImages(reportData, 12);
            }
            
            // Select mapping based on template
            const mapping = template === 'No Issues' ? NO_ISSUES_MAPPING : SHORT_LONG_CATEGORY_MAPPING;
            const maxImages = template === 'Long' ? 14 : template === 'Short' ? 6 : 12;
            
            return this.organizeCategoryImages(reportData, maxImages, mapping);
        } catch (error) {
            console.error('Error fetching report data:', error);
            throw error;
        }
    }
    
    organizeEverythingImages(reportData, maxImages) {
        const result = { 'e': [] };
        
        // Just take the first maxImages items with pictures
        let count = 0;
        for (const item of reportData) {
            if (!item.picUrl) continue;
            if (count >= maxImages) break;
            
            result.e.push({
                objectid: item.objectid,
                url: item.picUrl,
                notes: item.Notes ?? '',
                category: item.Category || '',
                choice: item.Choice || '',
                inspectionDate: item.InspectionDate,
                pageNumber: 1,
                block_id: `e${count + 1}`
            });
            
            count++;
        }
        
        return result;
    }
            

    organizeCategoryImages(reportData, maxImages, categoryMapping) {
        const categoryImages = {};
        
        // Initialize categories
        Object.keys(categoryMapping).forEach(prefix => {
            categoryImages[prefix] = [];
        });
        
        // Process each report item
        for (const item of reportData) {
            if (!item.picUrl) continue;
            
            const itemCategory = (item.Category || '').toLowerCase();
            const itemChoice = (item.Choice || '').toLowerCase();
            
            for (const [prefix, category] of Object.entries(categoryMapping)) {
                if (category.matches.some(([cat, choices]) => 
                    cat === itemCategory && choices.includes(itemChoice)
                )) {
                    const imageIndex = categoryImages[prefix].length + 1;
                    
                    if (imageIndex <= maxImages) {
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
        }
        
        return categoryImages;
    }

    async generateReport(email, management, clientName, template, startDate, endDate) {
        try {
            // Get client info
            const clientFields = ['firstname', 'lastname', 'Bspec_Type', 'BSpec_Height', 'BSpec_Materials'];
            const clientWhere = `management='${management}' AND clientname='${clientName}'`;
            const clientInfo = await queryEsriFeaturesBasic(config.clientUrl, clientFields, clientWhere);
            
            if (!clientInfo.length) throw new Error(`Client not found: ${clientName}`);
            
            const client = clientInfo[0];
            const categoryImages = await this.getReportData(clientName, template, startDate, endDate);
            
            // Determine template ID
            let templateId;
            if (template === 'Long') templateId = config.pandaTemplateIDLong;
            else if (template === 'Short') templateId = config.pandaTemplateIDShort;
            else if (template === 'No Issues') templateId = config.pandaTemplateIDNoIssues;
            else if (template === 'Everything') templateId = config.pandaTemplateIDEverything;
            else throw new Error(`Invalid template: ${template}`);
            
            // Create and send document
            const document = await this.pandadocService.createDocumentFromTemplate({
                email,
                clientName,
                management,
                categoryImages,
                fn: client.firstname,
                ln: client.lastname,
                bspec_height: client.BSpec_Height,
                bspec_materials: client.BSpec_Materials,
                bspec_type: client.Bspec_Type,
                panddocid: templateId
            });
            
            await this.pandadocService.ensureDocumentCreated(document);
            await this.pandadocService.sendDocument(document);
            
            return { documentId: document.id, status: 'completed' };
        } catch (error) {
            console.error('Error generating report:', error);
            throw error;
        }
    }
}

module.exports = QueryService;

// Simplified category mapping using blockIdPrefix as key
/*
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
*/