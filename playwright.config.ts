import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * End-to-end tests run against the production build (`npm run build`) with a
 * fresh, empty database, exactly like a new pantry installing Pantrybook.
 */
export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
	use: {
		baseURL: `http://localhost:${PORT}`,
		serviceWorkers: 'allow',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		command: 'node tests/e2e/start-server.ts',
		url: `http://localhost:${PORT}/api/health`,
		reuseExistingServer: false,
		timeout: 60_000,
		env: { PORT: String(PORT), PANTRYBOOK_DATA_DIR: 'tests/.tmp/data' }
	}
});
