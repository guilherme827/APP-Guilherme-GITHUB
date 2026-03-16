const handler = require('../server/aiAnalyzeHandler.cjs');

module.exports = async (req, res) => {
    try { await handler(req, res, process.env); } catch(error) { res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "[Crash Fatal] " + (error.message || "Erro Interno") })); }
};
