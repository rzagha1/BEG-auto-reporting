const pd_api = require("pandadoc-node-client");
const config = require('../config');

class PandadocService {
    constructor() {
        this.cfg = pd_api.createConfiguration({
            authMethods: { apiKey: `API-Key ${config.pandaDocAPIKey}` },
            baseServer: new pd_api.ServerConfiguration("https://api.pandadoc.com", {})
        });
        this.apiInstance = new pd_api.DocumentsApi(this.cfg);
    }

    async createDocumentFromTemplate(data) {
        try {
            // Collect all images first
            const images = [];
            
            // Create a mapping of categories to their template variables
            const categoryVariables = {
                djsc: 'delete_page_djsc',
                wg: 'delete_page_wg',
                csmc: 'delete_page_csmc',
                sbsmc: 'delete_page_sbsmc',
                mhi: 'delete_page_mhi',
                pfci: 'delete_page_pfci',
                fs: 'delete_page_fs',
                ws: 'delete_page_ws',
                oi: 'delete_page_oi',
                ni: 'delete_page_ni'
            };
    
            // Initialize delete tokens array
            const deleteTokens = [];
    
            for (const [category, categoryImages] of Object.entries(data.categoryImages)) {
                // If category has no images, add DELETE token
                if (!categoryImages || categoryImages.length === 0) {
                    deleteTokens.push({
                        name: categoryVariables[category],
                        value: 'DELETE'
                    });
                }
    
                // Continue with existing image processing
                if (!categoryImages || categoryImages.length === 0) continue;
                categoryImages.forEach((image, index) => {
                    if (image.block_id)
                    images.push({
                        name: image.block_id,
                        urls: [image.url+'?w=200'],
                    });
                });
            }
    
            // Create document request
            const documentCreateRequest = {
                name: `Building Inspection Report - ${data.clientName}`,
                templateUuid: data.panddocid,
                recipients: [
                    {
                        email: data.email,
                        firstName: data.fn,
                        lastName: data.ln
                    }
                ],
                tokens: [
                    { name: "Client.StreetAddress", value: data.clientName },
                    { name: "Client.Company", value: data.management },
                    { name: "Client.FirstName", value: data.fn },
                    { name: "Client.LastName", value: data.ln },
                    { name: "bspec_type", value: data.bspec_type },
                    { name: "bspec_height", value: data.bspec_height },
                    { name: "bspec_material", value: data.bspec_materials },
                    { name: "Report.Month", value: new Date().toLocaleString('en-US', { month: 'long' }) },
                    { name: "Report.Year", value: new Date().getFullYear().toString() },
                    ...deleteTokens  // Add the delete tokens to the existing tokens array
                ],
                metadata: {
                    clientName: data.clientName,
                    management: data.management
                },
                tags: ["inspection_report", "building_maintenance"],
                images: images
            };
    
            console.log('Document Request:', JSON.stringify(documentCreateRequest, null, 2));
            return await this.apiInstance.createDocument({
                documentCreateRequest
            });
        } catch (error) {
            console.error('Error creating document:', error);
            throw error;
        }
    }

    async ensureDocumentCreated(document) {
        const MAX_CHECK_RETRIES = 5;
        let retries = 0;

        while (retries < MAX_CHECK_RETRIES) {
            await new Promise(r => setTimeout(r, 2000));
            retries++;

            try {
                let response = await this.apiInstance.statusDocument({
                    id: String(document.id),
                });
                if (response.status === "document.draft") {
                    return;
                }
            } catch (error) {
                console.error(`Error checking document status (attempt ${retries}):`, error);
            }
        }

        throw Error("Document was not created in time");
    }

    async sendDocument(document) {
        try {
            // Send the document
            await this.apiInstance.sendDocument({
                id: String(document.id),
                documentSendRequest: {
                    silent: false,
                    subject: "Your Building Inspection Report",
                    message: "Your building inspection report is ready for review.",
                },
            });
        } catch (error) {
            console.error('Error sending document:', error);
            throw error;
        }
    }
    
}

module.exports = PandadocService;