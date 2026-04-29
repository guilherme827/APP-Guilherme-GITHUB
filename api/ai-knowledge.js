const handler = require('../server/aiKnowledgeHandler.cjs');

module.exports = async (req, res) => {
    await handler(req, res, process.env);
};
