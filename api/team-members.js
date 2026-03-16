const handler = require('../server/teamMembersHandler.cjs');

module.exports = async (req, res) => {
    try {
        try { await handler(req, res, process.env); } catch(error) { res.statusCode = 500; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "[Crash Fatal] " + (error.message || "Erro Interno") })); }
    } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: '[Crash no Servidor] ' + (error.message || 'Erro desconhecido interno.') }));
    }
};
