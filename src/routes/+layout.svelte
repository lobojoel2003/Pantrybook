<script lang="ts">
	import '../app.css';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page, updated } from '$app/state';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import { pwa } from '#lib/client/pwa.svelte.ts';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import SyncStatus from '#lib/components/SyncStatus.svelte';
	import Toasts from '#lib/components/Toasts.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	const PUBLIC_ROUTES = new Set(['/login', '/setup']);
	const path = $derived(page.url.pathname);
	// Help is readable before signing in; once signed in it shows inside the app.
	const isPublic = $derived(
		PUBLIC_ROUTES.has(path) || (path === '/help' && pantry.session !== 'signed-in')
	);
	const offline = $derived(!pantry.online || !pantry.reachable);
	const updateAvailable = $derived(pwa.updateReady || updated.current);

	interface NavItem {
		href: string;
		label: string;
		short: string;
		icon: IconName;
		match: (p: string) => boolean;
	}

	const nav = $derived.by((): NavItem[] => {
		const items: NavItem[] = [
			{
				href: resolve('/'),
				label: 'Check in',
				short: 'Check in',
				icon: 'check-circle',
				match: (p) => p === '/'
			},
			{
				href: resolve('/households'),
				label: 'Households',
				short: 'Households',
				icon: 'users',
				match: (p) => p.startsWith('/households')
			},
			{
				href: resolve('/visits'),
				label: "Today's visits",
				short: 'Today',
				icon: 'list',
				match: (p) => p.startsWith('/visits')
			},
			{
				href: resolve('/reports'),
				label: 'Reports',
				short: 'Reports',
				icon: 'chart',
				match: (p) => p.startsWith('/reports')
			}
		];
		if (pantry.me?.role === 'admin') {
			items.push({
				href: resolve('/admin'),
				label: 'Admin',
				short: 'Admin',
				icon: 'settings',
				match: (p) => p.startsWith('/admin')
			});
		}
		return items;
	});

	onMount(() => {
		pwa.start();
		void pantry.boot();
	});

	// Route people to setup, sign-in, or the app depending on their session.
	$effect(() => {
		const session = pantry.session;
		if (session === 'unknown') return;
		const reauth = page.url.searchParams.has('reauth');
		if (session === 'setup' && path !== '/setup') {
			void goto(resolve('/setup'), { replaceState: true });
		} else if (session === 'signed-out' && !isPublic) {
			const next = path === '/' ? '' : `${path}${page.url.search}`;
			const target = next ? resolve(`/login?next=${encodeURIComponent(next)}`) : resolve('/login');
			void goto(target, { replaceState: true });
		} else if (session === 'signed-in' && (path === '/setup' || (path === '/login' && !reauth))) {
			void goto(resolve('/'), { replaceState: true });
		}
	});

	const ready = $derived(
		pantry.loaded && pantry.session !== 'unknown' && (isPublic || pantry.session === 'signed-in')
	);
</script>

<svelte:head>
	<title>{pantry.orgName ? `${pantry.orgName} · Pantrybook` : 'Pantrybook'}</title>
</svelte:head>

<a class="skip no-print" href="#main">Skip to content</a>

{#if !ready}
	<div class="splash" aria-busy="true">
		<Logo size={56} />
		<p class="muted">Opening Pantrybook…</p>
	</div>
{:else if isPublic}
	<main id="main">{@render children()}</main>
{:else}
	<div class="shell">
		<aside class="sidebar no-print" aria-label="Main navigation">
			<a class="brand" href={resolve('/')}>
				<Logo size={36} />
				<span>
					<strong>Pantrybook</strong>
					<small>{pantry.orgName}</small>
				</span>
			</a>
			<nav>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- nav hrefs come from resolve() -->
				{#each nav as item (item.href)}
					<a
						href={item.href}
						class:active={item.match(path)}
						aria-current={item.match(path) ? 'page' : undefined}
					>
						<Icon name={item.icon} />
						{item.label}
					</a>
				{/each}
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</nav>
			<div class="sidebar-foot">
				<SyncStatus />
				<a href={resolve('/help')} class:active={path === '/help'}><Icon name="help" /> Help</a>
				<a href={resolve('/account')} class:active={path === '/account'}>
					<Icon name="user" />
					<span class="who">
						{pantry.me?.display_name}
						<small>{pantry.me?.role === 'admin' ? 'Coordinator' : 'Volunteer'}</small>
					</span>
				</a>
			</div>
		</aside>

		<header class="topbar no-print">
			<a class="brand" href={resolve('/')}>
				<Logo size={30} />
				<span><strong>{pantry.orgName || 'Pantrybook'}</strong></span>
			</a>
			<SyncStatus compact />
		</header>

		<div class="content">
			<div class="banners no-print">
				{#if pantry.demo}
					<div class="banner demo">
						<Icon name="info" size={18} />
						<p>
							<strong>Demo.</strong> Everything here is made up and resets every day. Try signing in
							as
							<span class="kbd">admin</span> or <span class="kbd">volunteer</span> (password
							<span class="kbd">pantrybook</span>).
						</p>
					</div>
				{/if}
				{#if pantry.needsSignIn}
					<div class="banner warning">
						<Icon name="key" size={18} />
						<p>Your sign-in expired. Keep working — changes are saved on this device.</p>
						<a class="btn small" href={resolve('/login?reauth=1')}>Sign in to sync</a>
					</div>
				{:else if offline}
					<div class="banner offline" role="status">
						<Icon name="cloud-off" size={18} />
						<p>
							<strong>Offline.</strong> Keep checking people in — {pantry.pendingCount > 0
								? `${pantry.pendingCount} change${pantry.pendingCount === 1 ? '' : 's'} will upload`
								: 'changes will upload'} when the connection is back.
						</p>
					</div>
				{/if}
				{#if updateAvailable}
					<div class="banner info">
						<Icon name="refresh" size={18} />
						<p>A new version of Pantrybook is ready.</p>
						<button type="button" class="btn small" onclick={() => pwa.applyUpdate()}
							>Update now</button
						>
					</div>
				{/if}
			</div>
			<main id="main" tabindex="-1">
				{@render children()}
			</main>
		</div>

		<nav class="tabbar no-print" aria-label="Main navigation">
			<!-- eslint-disable svelte/no-navigation-without-resolve -- nav hrefs come from resolve() -->
			{#each nav.slice(0, 4) as item (item.href)}
				<a
					href={item.href}
					class:active={item.match(path)}
					aria-current={item.match(path) ? 'page' : undefined}
				>
					<Icon name={item.icon} size={22} />
					<span>{item.short}</span>
				</a>
			{/each}
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
			<a
				href={resolve('/account')}
				class:active={path === '/account' || path === '/help' || path.startsWith('/admin')}
			>
				<Icon name="more" size={22} />
				<span>More</span>
			</a>
		</nav>
	</div>
{/if}

<Toasts />

<style>
	.skip {
		position: absolute;
		left: -9999px;
		top: 8px;
		z-index: 100;
		background: var(--surface);
		padding: 8px 12px;
		border-radius: var(--radius);
	}

	.skip:focus {
		left: 8px;
	}

	.splash {
		min-height: 100dvh;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: var(--space-3);
	}

	.shell {
		min-height: 100dvh;
	}

	.content {
		min-width: 0;
		padding-bottom: calc(72px + env(safe-area-inset-bottom));
	}

	main {
		outline: none;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		color: var(--text);
		text-decoration: none;
		min-width: 0;
	}

	.brand span {
		display: grid;
		min-width: 0;
	}

	.brand strong {
		font-size: 1.05rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.brand small {
		color: var(--text-muted);
		font-size: 0.8rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Mobile: top bar + bottom tabs */
	.sidebar {
		display: none;
	}

	.topbar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
		padding-top: calc(var(--space-2) + env(safe-area-inset-top));
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--border);
	}

	.tabbar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 20;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		background: var(--surface);
		border-top: 1px solid var(--border);
		padding-bottom: env(safe-area-inset-bottom);
	}

	.tabbar a {
		display: grid;
		justify-items: center;
		gap: 2px;
		padding: 8px 2px 6px;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.72rem;
		font-weight: 600;
		min-height: 58px;
	}

	.tabbar a.active {
		color: var(--primary);
	}

	/* Desktop: sidebar */
	@media (min-width: 900px) {
		.shell {
			display: grid;
			grid-template-columns: var(--sidebar) 1fr;
		}

		.topbar,
		.tabbar {
			display: none;
		}

		.content {
			padding-bottom: 0;
		}

		.sidebar {
			display: flex;
			flex-direction: column;
			gap: var(--space-5);
			position: sticky;
			top: 0;
			height: 100dvh;
			padding: var(--space-5) var(--space-3);
			background: var(--surface);
			border-right: 1px solid var(--border);
		}

		.sidebar .brand {
			padding: 0 var(--space-2);
		}

		.sidebar nav,
		.sidebar-foot {
			display: grid;
			gap: 2px;
		}

		.sidebar-foot {
			margin-top: auto;
			gap: var(--space-2);
		}

		.sidebar nav a,
		.sidebar-foot a {
			display: flex;
			align-items: center;
			gap: var(--space-3);
			min-height: var(--tap);
			padding: 0 var(--space-3);
			border-radius: var(--radius);
			color: var(--text-muted);
			text-decoration: none;
			font-weight: 600;
		}

		.sidebar nav a:hover,
		.sidebar-foot a:hover {
			background: var(--surface-sunken);
			color: var(--text);
		}

		.sidebar nav a.active,
		.sidebar-foot a.active {
			background: var(--primary-soft);
			color: var(--primary-soft-text);
		}

		.who {
			display: grid;
			line-height: 1.25;
			min-width: 0;
		}

		.who small {
			font-weight: 500;
			color: var(--text-faint);
		}
	}

	.banners {
		display: grid;
	}

	.banner {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
		font-size: 0.92rem;
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
	}

	.banner p {
		flex: 1 1 240px;
	}

	.banner.demo {
		background: var(--info-soft);
	}

	.banner.warning {
		background: var(--warning-soft);
	}

	.banner.offline {
		background: var(--surface-sunken);
	}

	.banner.info {
		background: var(--primary-soft);
	}

	@media print {
		.shell {
			display: block;
		}
		.content {
			padding: 0;
		}
	}
</style>
