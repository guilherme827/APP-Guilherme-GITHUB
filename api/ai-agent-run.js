const handler = require('../server/aiAgentRunHandler.cjs');

module.exports = async (req, res) => {
    await handler(req, res, process.env);
};
