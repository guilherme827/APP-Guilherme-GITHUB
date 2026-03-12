const handler = require('../server/teamMembersHandler.cjs');

module.exports = async (req, res) => {
    await handler(req, res, process.env);
};
