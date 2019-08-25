// Useful time-related functions.

function UtcTimeStamp() {
  return new Date().toJSON().substring(0, 19)
    .split('-').join('')
    .split('T').join('')
    .split(':').join('');
}

function UtcDateStamp() {
  return UtcTimeStamp().substring(0, 8);
}

function YesterdayDateStamp() {
  let d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toJSON().substring(0, 10).split('-').join('');
}

module.exports = {
  UtcDateStamp,
  UtcTimeStamp,
  YesterdayDateStamp,
};
