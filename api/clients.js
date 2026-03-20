const handler = require('../server/clientsHandler.cjs');

module.exports = async (req, res) => {
    try {
        await handler(req, res, process.env);
    } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: '[Crash Fatal] ' + (error.message || 'Erro Interno') }));
    }
};
