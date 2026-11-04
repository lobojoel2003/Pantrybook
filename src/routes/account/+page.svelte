<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import { pwa } from '#lib/client/pwa.svelte.ts';
	import { toast } from '#lib/client/toast.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import { BUILD, versionLabel } from '#lib/shared/build.ts';

	let current = $state('');
	let next = $state('');
	let saving = $state(false);
	let confirmSignOut = $state(false);

	async function changePassword(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		try {
			await api.post('/api/auth/password', { current_password: current, new_password: next });
			current = '';
			next = '';
			toast.success('Password changed. Other devices have been signed out.');
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			saving = false;
		}
	}

	async function signOut() {
		if (pantry.pendingCount > 0 && !confirmSignOut) {
			await pantry.sync();
			if (pantry.pendingCount > 0) {
				confirmSignOut = true;
				return;
			}
		}
		confirmSignOut = false;
		await pantry.logout();
		await goto(resolve('/login'), { replaceState: true });
	}
</script>

<svelte:head>
	<title>Account · Pantrybook</title>
</svelte:head>

<div class="page narrow">
	<header class="page-header">
		<div>
			<h1>{pantry.me?.display_name}</h1>
			<p>
				Signed in as <strong>{pantry.me?.username}</strong> ·
				{pantry.me?.role === 'admin' ? 'Coordinator (admin)' : 'Volunteer'}
			</p>
		</div>
		<button type="button" class="btn" onclick={signOut}><Icon name="logout" /> Sign out</button>
	</header>

	<nav class="links" aria-label="More">
		{#if pantry.me?.role === 'admin'}
			<a class="card tight" href={resolve('/admin')}><Icon name="settings" /> Admin settings</a>
		{/if}
		<a class="card tight" href={resolve('/help')}><Icon name="help" /> Volunteer guide</a>
		<a class="card tight" href={resolve('/intake-form')}><Icon name="file" /> Paper intake form</a>
		{#if pwa.canInstall}
			<button type="button" class="card tight" onclick={() => pwa.install()}>
				<Icon name="install" /> Install Pantrybook on this device
			</button>
		{/if}
	</nav>

	<section class="card">
		<h2 class="section-title">This device</h2>
		<dl class="facts">
			<div>
				<dt>Households saved here</dt>
				<dd>{pantry.searchIndex.length.toLocaleString()}</dd>
			</div>
			<div>
				<dt>Visits saved here</dt>
				<dd>{pantry.visits.size.toLocaleString()}</dd>
			</div>
			<div>
				<dt>Changes waiting</dt>
				<dd>{pantry.pendingCount}</dd>
			</div>
			<div>
				<dt>Works offline</dt>
				<dd>{pwa.offlineReady && pantry.persistent ? 'Yes' : 'Not yet'}</dd>
			</div>
		</dl>
		{#if !pwa.offlineReady}
			<p class="small muted note">
				Offline mode turns on after the first visit over HTTPS. Plain-HTTP addresses (other than
				localhost) can't save the app for offline use.
			</p>
		{/if}
		<div class="row note">
			<button
				type="button"
				class="btn small"
				onclick={() => pantry.sync()}
				disabled={pantry.syncing}
			>
				<Icon name="refresh" size={16} /> Sync now
			</button>
			<button
				type="button"
				class="btn small ghost"
				disabled={pantry.pendingCount > 0 || !pantry.reachable}
				onclick={async () => {
					await pantry.redownload();
					toast.success('Downloaded a fresh copy of the data.');
				}}
			>
				Re-download all data
			</button>
		</div>
	</section>

	<section class="card">
		<h2 class="section-title">Change password</h2>
		<form class="form-grid" onsubmit={changePassword}>
			<label class="field">
				<span>Current password</span>
				<input type="password" autocomplete="current-password" required bind:value={current} />
			</label>
			<label class="field">
				<span>New password</span>
				<input
					type="password"
					autocomplete="new-password"
					minlength="8"
					required
					bind:value={next}
				/>
				<span class="hint">At least 8 characters.</span>
			</label>
			<div class="span-all form-actions">
				<button type="submit" class="btn primary" disabled={saving || !pantry.reachable}>
					Change password
				</button>
			</div>
		</form>
	</section>

	<p class="small faint">
		Pantrybook {versionLabel(BUILD)} ·
		<a href="https://github.com/lobojoel2003/Pantrybook" rel="noopener" target="_blank"
			>Source code</a
		>
	</p>
</div>

<Modal
	open={confirmSignOut}
	title="Changes haven't uploaded yet"
	size="small"
	onclose={() => (confirmSignOut = false)}
>
	<p>
		{pantry.pendingCount} change{pantry.pendingCount === 1 ? '' : 's'} from this device haven't reached
		the server yet. If you sign out now they stay saved on this device and upload the next time you sign
		in here. It's safer to wait until you're back online.
	</p>
	{#snippet actions()}
		<button type="button" class="btn" onclick={() => (confirmSignOut = false)}
			>Stay signed in</button
		>
		<button type="button" class="btn danger" onclick={signOut}>Sign out anyway</button>
	{/snippet}
</Modal>

<style>
	.narrow {
		max-width: 860px;
	}

	.links {
		display: grid;
		gap: var(--space-3);
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	}

	.links a,
	.links button {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font: inherit;
		font-weight: 600;
		color: var(--text);
		text-decoration: none;
		cursor: pointer;
		text-align: left;
	}

	.links a:hover,
	.links button:hover {
		border-color: var(--primary);
	}

	.section-title {
		margin-bottom: var(--space-4);
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--space-3);
		margin: 0;
	}

	dt {
		font-size: 0.82rem;
		color: var(--text-muted);
	}

	dd {
		margin: 0;
		font-weight: 650;
		font-size: 1.1rem;
	}

	.note {
		margin-top: var(--space-4);
	}
</style>
