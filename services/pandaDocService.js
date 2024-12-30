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
            for (const [category, categoryImages] of Object.entries(data.categoryImages)) {
                if (!categoryImages || categoryImages.length === 0) continue;

                categoryImages.forEach((image, index) => {
                    images.push({
                        name: image.block_id,
                        urls: [image.url]
                    });
                });
            }

            // Create document request
            const documentCreateRequest = {
                name: `Building Inspection Report - ${data.clientName}`,
                templateUuid: config.pandaTemplateID,
                recipients: [
                    {
                        email: "ralph@ziggyspatial.com",
                        firstName: "Ralph",
                        lastName: "Zagha"
                    }
                ],
                tokens: [
                    { name: "Client.Name", value: data.clientName },
                    { name: "Management.Company", value: data.management },
                    { name: "Report.Month", value: new Date().toLocaleString('en-US', { month: 'long' }) },
                    { name: "Report.Year", value: new Date().getFullYear().toString() }
                ],
                metadata: {
                    clientName: data.clientName,
                    management: data.management
                },
                tags: ["inspection_report", "building_maintenance"],
                images: images  // Add images at root level
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