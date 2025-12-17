const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    let log = `${timestamp} [${service || 'app'}] ${level.toUpperCase()}: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    return log;
  })
);

// Create logger
const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { service: 'jira-testrail-integration' },
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({ filename: path.join(logsDir, 'combined.log') }),
    // Write errors to error.log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error' 
    }),
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service }) => {
          return `${timestamp} [${service || 'app'}] ${level}: ${message}`;
        })
      )
    })
  ]
});

module.exports = logger;
