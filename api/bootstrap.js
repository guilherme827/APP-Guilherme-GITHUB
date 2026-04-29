const handler = require('../server/bootstrapHandler.cjs');

module.exports = async (req, res) => handler(req, res, process.env);
