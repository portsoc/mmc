// Cloud Functions entry point. Split by work package below.
const { initializeApp } = require('firebase-admin/app');

initializeApp();

module.exports = {
  ...require('./invites'),
  ...require('./snapshots'),
  ...require('./canvases'),
  ...require('./errors'),
  createApiToken: require('./api-tokens').createApiToken,
  listApiTokens: require('./api-tokens').listApiTokens,
  revokeApiToken: require('./api-tokens').revokeApiToken,
  mcp: require('./mcp').mcp,
  mirrorCanvasAccess: require('./access').mirrorCanvasAccess
};

