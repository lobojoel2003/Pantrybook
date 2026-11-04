<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { errorMessage } from '#lib/client/api.ts';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	const reauth = $derived(page.url.searchParams.has('reauth'));

	function nextPath(): string {
		const next = page.url.searchParams.get('next') ?? '';
		// Only follow same-site paths.
		return next.startsWith('/') && !next.startsWith('//') ? next : '/';
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		busy = true;
		try {
			await pantry.login(username, password);
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- validated same-site path
			await goto(nextPath() === '/' ? resolve('/') : nextPath(), { replaceState: true });
		} catch (err) {
			error = errorMessage(err);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in · Pantrybook</title>
</svelte:head>

<div class="auth">
	<form class="card" onsubmit={submit}>
		<div class="head">
			<Logo size={48} />
			<div>
				<h1>{reauth ? 'Sign in again' : 'Sign in'}</h1>
				<p class="muted">{pantry.orgName || 'Pantrybook'}</p>
			</div>
		</div>

		{#if reauth}
			<p class="notice info">
				<Icon name="info" />
				<span>Your work is saved on this device and will upload after you sign in.</span>
			</p>
		{/if}

		{#if !pantry.online || !pantry.reachable}
			<p class="notice warning">
				<Icon name="cloud-off" />
				<span>
					You're offline. Signing in needs a connection the first time on each device.
					{#if pantry.me}<a href={resolve('/')}>Keep working offline</a>{/if}
				</span>
			</p>
		{/if}

		<label class="field">
			<span>Username</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="text"
				name="username"
				autocomplete="username"
				autocapitalize="none"
				spellcheck="false"
				required
				autofocus
				bind:value={username}
			/>
		</label>
		<label class="field">
			<span>Password</span>
			<input
				type="password"
				name="password"
				autocomplete="current-password"
				required
				bind:value={password}
			/>
		</label>

		{#if error}
			<p class="notice danger" role="alert"><Icon name="alert-circle" /><span>{error}</span></p>
		{/if}

		<button type="submit" class="btn primary large block" disabled={busy}>
			{busy ? 'Signing in…' : 'Sign in'}
		</button>

		{#if pantry.demo}
			<div class="notice info">
				<Icon name="info" />
				<div class="stack">
					<p>
						<strong>This is a demo with made-up data.</strong> Sign in as a coordinator or a volunteer:
					</p>
					<div class="row">
						<button
							type="button"
							class="btn small"
							onclick={() => {
								username = 'admin';
								password = 'pantrybook';
							}}>Coordinator (admin)</button
						>
						<button
							type="button"
							class="btn small"
							onclick={() => {
								username = 'volunteer';
								password = 'pantrybook';
							}}>Volunteer</button
						>
					</div>
				</div>
			</div>
		{:else}
			<p class="small muted center">
				Forgot your password? Ask a coordinator to reset it from the Admin screen.
			</p>
		{/if}
	</form>
	<p class="small faint center">
		<a href={resolve('/help')}>Help</a> · Pantrybook is free and open source.
	</p>
</div>

<style>
	.auth {
		min-height: 100dvh;
		display: grid;
		place-content: center;
		gap: var(--space-4);
		padding: var(--space-5) var(--space-4);
	}

	form {
		width: min(420px, calc(100vw - 32px));
		display: grid;
		gap: var(--space-4);
	}

	.head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-2);
	}

	.center {
		text-align: center;
	}
</style>
