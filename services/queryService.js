const { queryEsriFeatures } = require('../utils/esriUtils');
const config = require('../config');
const PandadocService = require('./pandaDocService');

class QueryService {
  constructor() {
    this.pandadocService = new PandadocService();
  }

  async getClientData() {
    const fields = ['objectid', 'globalid', 'clientname', 'management'];
    return await queryEsriFeatures(config.clientUrl, fields);
  }

  async getReportData(management, clientName) {
    const fields = ['objectid', 'globalid', 'clientname', 'management', 'inspectiondate', 'inspector', 'details'];
    const where = `management='${management}' AND clientname='${clientName}'`;
    return {'management': management, 'clientName': clientName} //await queryEsriFeatures(config.inspectionUrl, fields, where);
  }

  async generateReport(management, clientName) {
    const reportData = await this.getReportData(management, clientName);
    
    // Prepare the data with all necessary fields for conditionals
    const processedData = {
      clientName: reportData.clientName,
      management: reportData.management,
      isHighPriority: true,  // You can make this dynamic based on your business logic
      specialRequirements: "Special handling required for this client",  // Example text
      needsExtraReview: true,  // You can make this dynamic
      reviewLevel: "Detailed Technical Review",
      inspectionData: [
        {
          inspectiondate: new Date().toISOString().split('T')[0],
          inspector: "John Doe",
          details: "Initial inspection completed"
        }
      ]
    };

    // Call createDocumentFromTemplate instead of createAndSendDocument
    const document = await this.pandadocService.createDocumentFromTemplate(processedData);
    
    // After creating the document, you can optionally send it
    await this.pandadocService.ensureDocumentCreated(document);
    await this.pandadocService.sendDocument(document);

    return { 
      documentId: document.id, 
      processedData 
    };
  }
}

module.exports = QueryService;