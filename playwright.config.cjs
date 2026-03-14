const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;

module.exports = defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },
    webServer: {
        command: `npm run dev -- --host ${HOST} --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120 * 1000
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome']
            }
        }
    ]
});
