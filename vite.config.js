const { defineConfig, loadEnv } = require('vite');
const accountHandler = require('./server/accountHandler.cjs');
const bootstrapHandler = require('./server/bootstrapHandler.cjs');
const financeHandler = require('./server/financeHandler.cjs');
const adminBackupHandler = require('./server/adminBackupHandler.cjs');
const activityLogsHandler = require('./server/activityLogsHandler.cjs');
const aiAgentRunHandler = require('./server/aiAgentRunHandler.cjs');
const aiControlHandler = require('./server/aiControlHandler.cjs');
const aiKnowledgeHandler = require('./server/aiKnowledgeHandler.cjs');
const aiAnalyzeHandler = require('./server/aiAnalyzeHandler.cjs');
const clientsHandler = require('./server/clientsHandler.cjs');
const loginSupportHandler = require('./server/loginSupportHandler.cjs');
const organizationsHandler = require('./server/organizationsHandler.cjs');
const processesHandler = require('./server/processesHandler.cjs');
const projectsHandler = require('./server/projectsHandler.cjs');
const teamMembersHandler = require('./server/teamMembersHandler.cjs');
const trashHandler = require('./server/trashHandler.cjs');

function teamMembersPlugin(env) {
    return {
        name: 'team-members-api',
        configureServer(server) {
            server.middlewares.use('/api/account', async (req, res) => {
                await accountHandler(req, res, env);
            });
            server.middlewares.use('/api/bootstrap', async (req, res) => {
                await bootstrapHandler(req, res, env);
            });
            server.middlewares.use('/api/finance', async (req, res) => {
                await financeHandler(req, res, env);
            });
            server.middlewares.use('/api/admin-backup', async (req, res) => {
                await adminBackupHandler(req, res, env);
            });
            server.middlewares.use('/api/activity-logs', async (req, res) => {
                await activityLogsHandler(req, res, env);
            });
            server.middlewares.use('/api/ai-agent-run', async (req, res) => {
                await aiAgentRunHandler(req, res, env);
            });
            server.middlewares.use('/api/ai-control', async (req, res) => {
                await aiControlHandler(req, res, env);
            });
            server.middlewares.use('/api/ai-knowledge', async (req, res) => {
                await aiKnowledgeHandler(req, res, env);
            });
            server.middlewares.use('/api/clients', async (req, res) => {
                await clientsHandler(req, res, env);
            });
            server.middlewares.use('/api/team-members', async (req, res) => {
                await teamMembersHandler(req, res, env);
            });
            server.middlewares.use('/api/organizations', async (req, res) => {
                await organizationsHandler(req, res, env);
            });
            server.middlewares.use('/api/processes', async (req, res) => {
                await processesHandler(req, res, env);
            });
            server.middlewares.use('/api/projects', async (req, res) => {
                await projectsHandler(req, res, env);
            });
            server.middlewares.use('/api/trash', async (req, res) => {
                await trashHandler(req, res, env);
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
