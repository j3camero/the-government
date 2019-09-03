const log = require('./log');

log.info('What what');
log.info('[BLAH] Testing 1 2 3', {
  abc: 'def',
  more: {
    numbers: [3, 5, 7],
  },
});
