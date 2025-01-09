const QueryService = require('../services/queryService');

class QueryController {
    constructor() {
        this.queryService = new QueryService();
    }

    async getFormData(req, res) {
        try {
            const features = await this.queryService.getClientData();
            
            if (!features || !Array.isArray(features)) {
                throw new Error('Invalid client data received');
            }

            // Process and organize management data
            const managementData = this.processManagementData(features);

            // Render the view with processed data
            res.render('index', { 
                managementData: managementData,
                managementDataJson: JSON.stringify(managementData),
                error: null
            });
        } catch (error) {
            console.error('Error in getFormData:', error);
            res.render('index', {
                managementData: [],
                managementDataJson: '[]',
                error: 'Unable to load form data. Please try again later.'
            });
        }
    }

    processManagementData(features) {
        try {
            // Create organized data structure
            const managementMap = features.reduce((acc, curr) => {
                const { management, clientname } = curr;
                
                if (!management || !clientname) {
                    return acc;
                }

                const cleanManagement = this.sanitizeString(management);
                const cleanClientname = this.sanitizeString(clientname);
                
                if (!cleanManagement || !cleanClientname) {
                    return acc;
                }

                if (!acc[cleanManagement]) {
                    acc[cleanManagement] = {
                        management: cleanManagement,
                        clientnames: new Set(),
                    };
                }

                acc[cleanManagement].clientnames.add(cleanClientname);
                return acc;
            }, {});

            // Convert to sorted array
            return Object.values(managementMap)
                .map(item => ({
                    ...item,
                    clientnames: Array.from(item.clientnames).sort()
                }))
                .sort((a, b) => a.management.localeCompare(b.management));

        } catch (error) {
            console.error('Error processing management data:', error);
            return [];
        }
    }

    sanitizeString(str) {
        if (!str || typeof str !== 'string') {
            return '';
        }
        return str.trim()
            .replace(/[<>]/g, '') // Basic XSS prevention
            .replace(/\s+/g, ' '); // Normalize whitespace
    }

    async inputToGenerateReport(req, res) {
        try {
            // Validate request body
            const validationError = this.validateReportRequest(req.body);
            if (validationError) {
                return res.status(400).json({ 
                    error: validationError 
                });
            }
            const { email, management, clientName,startDate,endDate } = req.body;
            // Generate report
            const result = await this.queryService.generateReport(
                email,
                management, 
                clientName,
                startDate,
                endDate
            );

            // Send success response
            res.json({
                success: true,
                message: 'Report generated successfully',
                data: result,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error in generateReport:', error);
            
            // Send appropriate error response
            const statusCode = this.determineErrorStatus(error);
            res.status(statusCode).json({
                success: false,
                error: this.formatErrorMessage(error),
                timestamp: new Date().toISOString()
            });
        }
    }

    validateReportRequest(body) {
        const { email, management, clientName, template } = body;

        if (!management || typeof management !== 'string') {
            return 'Invalid management value';
        }

        if (!clientName || typeof clientName !== 'string') {
            return 'Invalid client name';
        }

        if (email && !this.isValidEmail(email)) {
            return 'Invalid email format';
        }

        return null;
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    determineErrorStatus(error) {
        if (error.message.includes('Invalid')) {
            return 400; // Bad Request
        }
        if (error.message.includes('Not found')) {
            return 404; // Not Found
        }
        if (error.message.includes('Unauthorized')) {
            return 401; // Unauthorized
        }
        return 500; // Internal Server Error
    }

    formatErrorMessage(error) {
        return {
            message: 'Error generating report',
            details: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'An unexpected error occurred'
        };
    }
}

module.exports = QueryController;