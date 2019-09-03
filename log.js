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

const config = {
  logGroupName: 'commissar',
  logStreamName: 'prod',
  createLogGroup: false,
  createLogStream: true,
  awsConfig: {
    accessKeyId: 'AKIAWWNOV3REMTLG53GM',
    secretAccessKey: '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',
    region: 'us-west-2',
  },
  formatLog: function (item) {
    return item.level + ': ' + item.message + ' ' + JSON.stringify(item.meta);
  }
}

logger.add(CloudWatchTransport, config);
logger.level = 'info';

logger.stream = {
  write: function(message, encoding) {
    logger.info(message);
  }
};

module.exports = logger;
