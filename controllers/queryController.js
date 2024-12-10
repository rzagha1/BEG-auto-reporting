const QueryService = require('../services/queryService');

class QueryController {
  constructor() {
    this.queryService = new QueryService();
  }

  async getFormData(req, res) {
    try {
        const features = await this.queryService.getClientData();
        
        // Create clean, organized data structure
        const managementData = features.reduce((acc, curr) => {
            const { management, clientname } = curr;
            if (management && clientname) {
                const cleanManagement = management.trim();
                const cleanClientname = clientname.trim();
                
                if (!acc[cleanManagement]) {
                    acc[cleanManagement] = {
                        management: cleanManagement,
                        clientnames: []
                    };
                }
                if (!acc[cleanManagement].clientnames.includes(cleanClientname)) {
                    acc[cleanManagement].clientnames.push(cleanClientname);
                }
            }
            return acc;
        }, {});

        // Convert to array and sort
        const sortedData = Object.values(managementData).sort((a, b) => 
            a.management.localeCompare(b.management)
        );

        // Sort client names within each management
        sortedData.forEach(item => {
            item.clientnames.sort();
        });

        // Pass the array directly to the template
        res.render('index', { 
            managementData: sortedData,  // Pass the array directly
            managementDataJson: JSON.stringify(sortedData) // For the JavaScript part
        });
    } catch (error) {
        console.error('Error fetching form data:', error);
        res.status(500).send('Error fetching form data');
    }
}

  async generateReport(req, res) {
    try {
      const { email, management, clientName, template } = req.body;
      const result = await this.queryService.generateReport(management, clientName, template);
      res.json({ message: 'Report data fetched successfully', data: result });
    } catch (error) {
      console.error('Error generating report:', error);
      res.status(500).json({ error: 'Error generating report' });
    }
  }
}

module.exports = QueryController;