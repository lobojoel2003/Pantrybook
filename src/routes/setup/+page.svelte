<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ApiError, errorMessage } from '#lib/client/api.ts';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';

	let org_name = $state('');
	let display_name = $state('');
	let username = $state('');
	let password = $state('');
	let confirm = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		if (password !== confirm) {
			error = "The two passwords don't match.";
			return;
		}
		busy = true;
		try {
			await pantry.setup({ org_name, display_name, username, password });
			await goto(resolve('/admin/programs?welcome=1'), { replaceState: true });
		} catch (err) {
			error = errorMessage(err);
			if (err instanceof ApiError && err.status === 409) await pantry.checkSession();
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Set up · Pantrybook</title>
</svelte:head>

<div class="setup">
	<form class="card" onsubmit={submit}>
		<div class="head">
			<Logo size={48} />
			<div>
				<h1>Welcome to Pantrybook</h1>
				<p class="muted">Two minutes of setup and you're ready for your first distribution day.</p>
			</div>
		</div>

		<label class="field">
			<span>Your organization's name</span>
			<input
				type="text"
				required
				maxlength="120"
				placeholder="Riverside Food Pantry"
				bind:value={org_name}
			/>
		</label>

		<hr class="divider" />
		<div>
			<h2>Your coordinator account</h2>
			<p class="muted small">
				Coordinators can manage programs, volunteers, reports and backups. You can add volunteer
				accounts next.
			</p>
		</div>

		<label class="field">
			<span>Your name</span>
			<input type="text" required maxlength="80" autocomplete="name" bind:value={display_name} />
		</label>
		<div class="field">
			<label for="setup-username">Username</label>
			<input
				id="setup-username"
				aria-describedby="setup-username-hint"
				type="text"
				required
				minlength="2"
				maxlength="40"
				autocomplete="username"
				autocapitalize="none"
				spellcheck="false"
				pattern="[A-Za-z0-9._\-]+"
				bind:value={username}
			/>
			<span id="setup-username-hint" class="hint"
				>Letters, numbers, dots, dashes and underscores.</span
			>
		</div>
		<div class="form-grid">
			<div class="field">
				<label for="setup-password">Password</label>
				<input
					id="setup-password"
					aria-describedby="setup-password-hint"
					type="password"
					required
					minlength="8"
					autocomplete="new-password"
					bind:value={password}
				/>
				<span id="setup-password-hint" class="hint">At least 8 characters.</span>
			</div>
			<label class="field">
				<span>Password again</span>
				<input
					type="password"
					required
					minlength="8"
					autocomplete="new-password"
					bind:value={confirm}
				/>
			</label>
		</div>

		{#if error}
			<p class="notice danger" role="alert"><Icon name="alert-circle" /><span>{error}</span></p>
		{/if}

		<button type="submit" class="btn primary large block" disabled={busy}>
			{busy ? 'Setting up…' : 'Create my pantry'}
		</button>
	</form>
</div>

<style>
	.setup {
		min-height: 100dvh;
		display: grid;
		place-content: center;
		padding: var(--space-5) var(--space-4);
	}

	form {
		width: min(560px, calc(100vw - 32px));
		display: grid;
		gap: var(--space-4);
	}

	.head {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}
</style>
