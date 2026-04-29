const handler = require('../server/aiControlHandler.cjs');

module.exports = async (req, res) => {
    await handler(req, res, process.env);
};
