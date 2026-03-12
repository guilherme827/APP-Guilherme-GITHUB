const handler = require('../server/accountHandler.cjs');

module.exports = async (req, res) => {
    await handler(req, res, process.env);
};
