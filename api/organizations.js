const handler = require('../server/organizationsHandler.cjs');

module.exports = async (req, res) => handler(req, res, process.env);
