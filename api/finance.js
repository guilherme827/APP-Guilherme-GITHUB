const handler = require('../server/financeHandler.cjs');

module.exports = async (req, res) => handler(req, res, process.env);

