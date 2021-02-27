const winston = require('winston');
const lw = require('@google-cloud/logging-winston');

// Create a Winston logger that streams to Stackdriver Logging
// Logs will be written to: "projects/YOUR_PROJECT_ID/logs/winston_log"
const logger = winston.createLogger({
    level: 'info',
    transports: [ ]
});

if (process.env.NODE_ENV === 'production') {
    // Add Stackdriver Logging
    const loggingWinston = new lw.LoggingWinston({
        serviceContext: {
            // required to report logged errors to the Google Cloud Error Reporting console
            service: 'api-photosub'
        },
        prefix: 'api-photosub'
    });
    logger.add(loggingWinston);
} else {
    logger.add(new winston.transports.Console());
}

module.exports = logger;