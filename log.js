const config = require('./config');
const winston = require('winston');
const CloudWatchTransport = require('winston-aws-cloudwatch');

const logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      timestamp: true,
      colorize: true,
    })
  ]
});

logger.add(CloudWatchTransport, config.winstonConfig);
logger.level = 'info';

logger.stream = {
  write: function(message, encoding) {
    logger.info(message);
  }
};

module.exports = logger;
