const { defineConfig, loadEnv } = require('vite');
const accountHandler = require('./server/accountHandler.cjs');
const aiAnalyzeHandler = require('./server/aiAnalyzeHandler.cjs');
const loginSupportHandler = require('./server/loginSupportHandler.cjs');
const organizationsHandler = require('./server/organizationsHandler.cjs');
const teamMembersHandler = require('./server/teamMembersHandler.cjs');

function teamMembersPlugin(env) {
    return {
        name: 'team-members-api',
        configureServer(server) {
            server.middlewares.use('/api/account', async (req, res) => {
                await accountHandler(req, res, env);
            });
            server.middlewares.use('/api/team-members', async (req, res) => {
                await teamMembersHandler(req, res, env);
            });
            server.middlewares.use('/api/organizations', async (req, res) => {
                await organizationsHandler(req, res, env);
            });
            server.middlewares.use('/api/ai-analyze', async (req, res) => {
                await aiAnalyzeHandler(req, res, env);
            });
            server.middlewares.use('/api/login-support', async (req, res) => {
                await loginSupportHandler(req, res, env);
            });
        }
    };
}

module.exports = defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
        plugins: [teamMembersPlugin(env)]
    };
});
