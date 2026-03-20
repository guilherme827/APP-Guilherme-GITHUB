const handler = require('../server/adminBackupHandler.cjs');

module.exports = async (req, res) => {
    await handler(req, res, process.env);
};
