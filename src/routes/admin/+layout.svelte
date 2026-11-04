<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';

	let { children } = $props();

	const tabs = [
		{ href: resolve('/admin'), label: 'Settings', id: '/admin' },
		{ href: resolve('/admin/programs'), label: 'Programs', id: '/admin/programs' },
		{ href: resolve('/admin/users'), label: 'People', id: '/admin/users' },
		{ href: resolve('/admin/data'), label: 'Data', id: '/admin/data' }
	];
</script>

{#if pantry.me?.role !== 'admin'}
	<div class="page">
		<div class="card empty">
			<p>Only coordinators (admins) can change these settings.</p>
			<a class="btn" href={resolve('/')}>Back to check-in</a>
		</div>
	</div>
{:else}
	<div class="page admin">
		<header class="page-header">
			<div>
				<h1>Admin</h1>
				<p>Set up {pantry.orgName || 'your pantry'}: programs, volunteers, data and backups.</p>
			</div>
		</header>
		<nav class="tabs no-print" aria-label="Admin sections">
			{#each tabs as tab (tab.id)}
				<a
					href={tab.href}
					class:active={page.url.pathname === tab.id}
					aria-current={page.url.pathname === tab.id ? 'page' : undefined}>{tab.label}</a
				>
			{/each}
		</nav>
		{#if !pantry.reachable}
			<div class="notice warning">
				<Icon name="cloud-off" />
				<p>Admin changes need a connection to the server.</p>
			</div>
		{/if}
		{@render children()}
	</div>
{/if}

<style>
	.tabs {
		display: flex;
		gap: var(--space-1);
		border-bottom: 1px solid var(--border);
		overflow-x: auto;
	}

	.tabs a {
		padding: var(--space-3) var(--space-4);
		color: var(--text-muted);
		font-weight: 600;
		text-decoration: none;
		border-bottom: 3px solid transparent;
		margin-bottom: -1px;
		white-space: nowrap;
	}

	.tabs a:hover {
		color: var(--text);
	}

	.tabs a.active {
		color: var(--primary);
		border-bottom-color: var(--primary);
	}
</style>
