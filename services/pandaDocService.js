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
        const documentCreateRequest = {
            name: `Report for ${data.clientName}`,
            templateUuid: config.pandaTemplateID,
            recipients: [
                {
                    email: "ralph@ziggyspatial.com",
                    firstName: "Recipient",
                    lastName: "Name"
                }
            ],
            fields: {
                "Conditions.IsHighPriority": {
                    value: data.isHighPriority ? "true" : "false",
                    title: "High Priority Flag"
                },
                "Conditions.HasSpecialRequirements": {
                    value: data.specialRequirements ? "true" : "false",
                    title: "Special Requirements Flag"
                },
                "Conditions.NeedsExtraReview": {
                    value: data.needsExtraReview ? "true" : "false",
                    title: "Needs Review Flag"
                },
                "Conditions.HasInspectionData": {
                    value: data.inspectionData?.length > 0 ? "true" : "false",
                    title: "Has Inspection Data Flag"
                },
                "Content.RequirementsNote": {
                    value: data.specialRequirements || "N/A",
                    title: "Requirements Note"
                },
                "Content.ReviewLevel": {
                    value: data.reviewLevel || "Standard Review",
                    title: "Review Level"
                },
                "InspectionData.Summary": {
                    value: this.generateInspectionSummary(data.inspectionData),
                    title: "Inspection Summary"
                }
            },
            tokens: [
                { name: "Sender.Company", value: "Ziggy Spatial" },
                { name: "Client.FirstName", value: data.clientName.split(' ')[0] },
                { name: "Client.LastName", value: data.clientName.split(' ')[1] || '' },
                { name: "Document.CreatedDate", value: new Date().toLocaleDateString() }
            ],
            metadata: {
                clientName: data.clientName,
                management: data.management
            },
            tags: ["created_via_api", "management_report"]
        };

        return await this.apiInstance.createDocument({
            documentCreateRequest: documentCreateRequest,
        });
    }

    generateInspectionSummary(inspectionData) {
        if (!inspectionData || inspectionData.length === 0) {
            return "No inspection data available";
        }

        return `Number of Inspections: ${inspectionData.length}\n` +
               `Latest Inspection Date: ${inspectionData[0].inspectiondate || 'N/A'}\n` +
               `Inspector: ${inspectionData[0].inspector || 'N/A'}`;
    }

    async ensureDocumentCreated(document) {
        const MAX_CHECK_RETRIES = 5;
        let retries = 0;

        while (retries < MAX_CHECK_RETRIES) {
            await new Promise(r => setTimeout(r, 2000));
            retries++;

            let response = await this.apiInstance.statusDocument({
                id: String(document.id),
            });
            if (response.status === "document.draft") {
                return;
            }
        }

        throw Error("Document was not created in time");
    }

    async sendDocument(document) {
        await this.apiInstance.sendDocument({
            id: String(document.id),
            documentSendRequest: {
                silent: false,
                subject: "Your Property Management Report",
                message: "Your property management report is ready for review.",
            },
        });
    }
}

module.exports = PandadocService;