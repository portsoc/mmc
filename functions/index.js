// Cloud Functions entry point. Split by work package below.
const { initializeApp } = require('firebase-admin/app');

initializeApp();

module.exports = {
  ...require('./invites'),
  ...require('./snapshots'),
  ...require('./canvases'),
  ...require('./errors')
};

