const handler = require('../server/aiAnalyzeHandler.cjs');

module.exports = async (req, res) => {
    await handler(req, res, process.env);
};
