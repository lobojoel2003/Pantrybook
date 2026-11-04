import { expect, test, type Page } from '@playwright/test';

/**
 * One continuous story, in order: a new pantry sets up Pantrybook, registers
 * families, checks them in (online and offline), enforces limits and reports.
 */
test.describe.configure({ mode: 'serial' });

const ADMIN = { username: 'coordinator', password: 'correct-horse-42', name: 'Jo Coordinator' };
const VOLUNTEER = { username: 'sam', password: 'volunteer-pass-1', name: 'Sam Volunteer' };

let page: Page;

test.beforeAll(async ({ browser }) => {
	const context = await browser.newContext();
	page = await context.newPage();
});

test.afterAll(async () => {
	await page.context().close();
});

async function search(text: string) {
	await page.goto('/');
	const box = page.getByPlaceholder('Name, phone, or household number');
	await box.fill(text);
	return box;
}

async function signIn(username: string, password: string) {
	await page.goto('/login');
	await page.getByLabel('Username').fill(username);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Check in', level: 1 })).toBeVisible();
}

async function signOut() {
	await page.goto('/account');
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/login/);
}

async function waitForSynced() {
	await expect(page.getByRole('button', { name: /Sync status: Synced/ }).first()).toBeAttached({
		timeout: 20_000
	});
}

test('API rejects anonymous and non-JSON requests', async ({ request }) => {
	expect((await request.get('/api/sync?since=0')).status()).toBe(401);
	// Cross-site form posts are blocked (by SvelteKit's CSRF check or our JSON-only rule).
	const form = await request.post('/api/auth/login', { form: { username: 'x', password: 'y' } });
	expect([403, 415]).toContain(form.status());
	const text = await request.post('/api/auth/login', {
		headers: { 'Content-Type': 'text/plain' },
		data: '{"username":"x","password":"y"}'
	});
	expect([403, 415]).toContain(text.status());
	const health = await (await request.get('/api/health')).json();
	expect(health).toMatchObject({ status: 'ok', database: 'ok' });
	expect(health.version).toMatch(/^\d+\.\d+\.\d+/);
});

test('first run sets up the organization and a coordinator', async () => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/setup/);
	await page.getByLabel("Your organization's name").fill('Hope Street Pantry');
	await page.getByLabel('Your name').fill(ADMIN.name);
	await page.getByLabel('Username').fill(ADMIN.username);
	await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
	await page.getByLabel('Password again').fill(ADMIN.password);
	await page.getByRole('button', { name: 'Create my pantry' }).click();
	await expect(page.getByText('Your pantry is set up.')).toBeVisible();
	await expect(page.getByRole('cell', { name: 'Food Pantry' })).toBeVisible();
	await expect(page.getByRole('cell', { name: '4 visits per month' })).toBeVisible();
});

test('registers a household and checks them in', async () => {
	await page.goto('/households/new');
	await page.getByLabel('First name').fill('Maria');
	await page.getByLabel('Last name').fill('Garcia');
	await page.getByLabel('Phone (optional)').fill('555 201 3344');
	await page.getByRole('button', { name: 'More children' }).click();
	await page.getByRole('button', { name: 'More children' }).click();
	await page.getByLabel('ZIP / postal code').fill('40121');
	await expect(page.getByText('3 people')).toBeVisible();
	await page.getByRole('button', { name: 'Save and check in' }).click();

	await expect(page.getByRole('heading', { name: 'Maria Garcia' })).toBeVisible();
	await expect(page.getByText('0 of 4 this month')).toBeVisible();
	await page.getByLabel('Amount for Food Pantry (lbs)').fill('32');
	await page.getByRole('button', { name: 'Check in', exact: true }).click();
	await expect(page.getByText('Maria Garcia checked in for Food Pantry.')).toBeVisible();

	// Back on the search screen, today's totals include the visit.
	await expect(page.getByText('Check-ins today')).toBeVisible();
	await expect(page.locator('.tile', { hasText: 'Check-ins today' })).toContainText('1');
	await waitForSynced();
});

test('finds households by name, phone and number', async () => {
	await search('garc');
	await expect(page.getByRole('option', { name: /Maria Garcia/ })).toBeVisible();
	await search('3344');
	await expect(page.getByRole('option', { name: /Maria Garcia/ })).toBeVisible();
	await search('#1001');
	await expect(page.getByRole('option', { name: /Maria Garcia/ })).toBeVisible();
	await search('zzzz');
	await expect(page.getByText('No household matches')).toBeVisible();
});

test('warns about possible duplicates', async () => {
	await page.goto('/households/new');
	await page.getByLabel('Phone (optional)').fill('(555) 201-3344');
	await expect(page.getByText('This might already be registered.')).toBeVisible();
	await expect(page.getByRole('link', { name: /Maria Garcia/ })).toBeVisible();
});

test('enforces visit limits and records overrides with a reason', async () => {
	// Tighten the limit to one visit per month.
	await page.goto('/admin/programs');
	await page.getByRole('button', { name: 'Edit' }).first().click();
	await page.getByLabel('Number of visits').fill('1');
	await page.getByRole('button', { name: 'Save program' }).click();
	await expect(page.getByRole('cell', { name: '1 visit per month' })).toBeVisible();

	await search('Maria');
	await page.keyboard.press('Enter');
	await expect(page.getByText('Limit reached')).toBeVisible();
	await expect(page.getByText(/Next eligible/)).toBeVisible();
	await page.getByRole('button', { name: 'Check in anyway…' }).click();
	await page.getByLabel('Why are you going over the limit?').fill('Emergency: house fire');
	await page.getByRole('button', { name: 'Confirm check-in' }).click();
	await expect(page.getByText('Maria Garcia checked in for Food Pantry.')).toBeVisible();
	await waitForSynced();
});

test('keeps working offline and syncs when the connection returns', async () => {
	const context = page.context();
	// Make sure the service worker has saved the app for offline use.
	await page.goto('/');
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	await page.reload();
	await expect
		.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
		.toBe(true);

	await context.setOffline(true);
	await expect(page.getByText('Offline.', { exact: false }).first()).toBeVisible();

	// Register a new family and check them in with no connection at all.
	await page.getByRole('link', { name: 'New household' }).first().click();
	await page.getByLabel('First name').fill('Wei');
	await page.getByLabel('Last name').fill('Chen');
	await page.getByRole('button', { name: 'Save and check in' }).click();
	await expect(page.getByText('Not synced yet')).toBeVisible();
	await page.getByRole('button', { name: 'Check in', exact: true }).click();
	await expect(page.getByText('Wei Chen checked in for Food Pantry.')).toBeVisible();
	await expect(page.getByRole('button', { name: /Offline · 2 waiting/ }).first()).toBeAttached();

	// Reloading while offline still opens the app from the device, on any page.
	await page.reload();
	await search('Wei');
	await expect(page.getByRole('option', { name: /Wei Chen/ })).toBeVisible();
	await page.getByRole('option', { name: /Wei Chen/ }).click();
	await page.getByRole('link', { name: /Household details/ }).click();
	await expect(page).toHaveURL(/\/households\/[0-9a-f-]+$/);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Wei Chen', level: 1 })).toBeVisible();
	await page.goto('/households/new');
	await expect(page.getByRole('heading', { name: 'Register a household' })).toBeVisible();

	await context.setOffline(false);
	await page.evaluate(() => window.dispatchEvent(new Event('online')));
	await waitForSynced();

	const stats = await page.evaluate(async () => {
		const today = new Date();
		const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		const res = await fetch(`/api/reports?from=${d}&to=${d}`, {
			headers: { Accept: 'application/json' }
		});
		return (await res.json()).totals;
	});
	expect(stats).toMatchObject({ visits: 3, households: 2, over_limit_visits: 1 });

	// The offline household now has a server-assigned number.
	await search('Wei');
	await expect(page.getByRole('option', { name: /Wei Chen/ })).toContainText('#1002');
});

test('reports totals and exports CSV', async () => {
	await page.goto('/reports');
	await expect(page.locator('.tile', { hasText: 'Households served' })).toContainText('2');
	await expect(page.locator('.tile', { hasText: 'Visits' }).first()).toContainText('3');
	await expect(page.getByRole('cell', { name: 'Emergency: house fire' })).toBeVisible();

	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Summary CSV' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/^pantrybook-report-.*\.csv$/);
});

test('imports households from a spreadsheet', async () => {
	await page.goto('/admin/data');
	const csv = [
		'Last Name,First Name,Phone,Zip,Household Size',
		'Okafor,Ade,555-777-1111,40130,4',
		'"Nguyen, Jr.",Linh,,40121,2',
		'Garcia,Maria,555 201 3344,40121,3'
	].join('\n');
	await page.locator('input[type=file]').setInputFiles({
		name: 'clients.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(csv)
	});
	await expect(page.getByText('clients.csv')).toBeVisible();
	await page.getByRole('button', { name: /Import 3 households/ }).click();
	await expect(page.getByText('2 households imported.')).toBeVisible();
	await expect(page.getByText('1 skipped because they looked like duplicates.')).toBeVisible();
});

test('coordinators add volunteers, who cannot open admin screens', async () => {
	await page.goto('/admin/users');
	await page.getByRole('button', { name: 'Add person' }).click();
	await page.getByLabel('Name', { exact: true }).fill(VOLUNTEER.name);
	await page.getByLabel('Username').fill(VOLUNTEER.username);
	await page.getByLabel('Password').fill(VOLUNTEER.password);
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByRole('cell', { name: VOLUNTEER.username, exact: true })).toBeVisible();

	await signOut();
	await signIn(VOLUNTEER.username, VOLUNTEER.password);
	await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
	await page.goto('/admin');
	await expect(
		page.getByText('Only coordinators (admins) can change these settings.')
	).toBeVisible();
	const status = await page.evaluate(async () => (await fetch('/api/admin/users')).status);
	expect(status).toBe(403);

	// Volunteers still see households after signing in (downloaded fresh).
	await search('Okafor');
	await expect(page.getByRole('option', { name: /Ade Okafor/ })).toBeVisible();
});

test('rejects a wrong password', async () => {
	await signOut();
	await page.getByLabel('Username').fill(ADMIN.username);
	await page.getByLabel('Password').fill('not-the-password');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByText('That username and password do not match.')).toBeVisible();
});

test('works on a phone-sized screen', async ({ browser }) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		isMobile: true,
		hasTouch: true
	});
	const phone = await context.newPage();
	await phone.goto('/login');
	await phone.getByLabel('Username').fill(ADMIN.username);
	await phone.getByLabel('Password').fill(ADMIN.password);
	await phone.getByRole('button', { name: 'Sign in', exact: true }).click();
	const tabs = phone.getByRole('navigation', { name: 'Main navigation' }).last();
	await expect(tabs.getByRole('link', { name: 'Households' })).toBeVisible();
	await tabs.getByRole('link', { name: 'Households' }).click();
	await expect(phone.getByRole('heading', { name: 'Households' })).toBeVisible();
	const overflow = await phone.evaluate(
		() => document.documentElement.scrollWidth > window.innerWidth
	);
	expect(overflow).toBe(false);
	await context.close();
});
