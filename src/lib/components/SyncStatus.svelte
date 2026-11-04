<script lang="ts">
	import { resolve } from '$app/paths';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import { formatRelative } from '#lib/shared/dates.ts';
	import Icon, { type IconName } from './Icon.svelte';
	import Modal from './Modal.svelte';

	interface Props {
		compact?: boolean;
	}

	let { compact = false }: Props = $props();
	let open = $state(false);
	let now = $state(Date.now());

	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 20_000);
		return () => clearInterval(timer);
	});

	const offline = $derived(!pantry.online || !pantry.reachable);

	const status = $derived.by((): { tone: string; icon: IconName; text: string } => {
		if (pantry.needsSignIn) return { tone: 'warning', icon: 'key', text: 'Sign in to sync' };
		if (pantry.failedEntries.length > 0)
			return {
				tone: 'danger',
				icon: 'alert-circle',
				text: `${pantry.failedEntries.length} need attention`
			};
		if (offline)
			return {
				tone: 'neutral',
				icon: 'cloud-off',
				text: pantry.pendingCount ? `Offline · ${pantry.pendingCount} waiting` : 'Offline'
			};
		if (pantry.syncing) return { tone: 'info', icon: 'refresh', text: 'Syncing…' };
		if (pantry.pendingCount)
			return { tone: 'info', icon: 'cloud', text: `${pantry.pendingCount} waiting` };
		if (pantry.syncError) return { tone: 'warning', icon: 'alert', text: 'Sync problem' };
		return { tone: 'success', icon: 'check-circle', text: 'Synced' };
	});
</script>

<button
	type="button"
	class="pill {status.tone}"
	class:compact
	onclick={() => (open = true)}
	aria-label={`Sync status: ${status.text}. Open details.`}
>
	<span class:spin={pantry.syncing && !offline}><Icon name={status.icon} size={16} /></span>
	<span class="text" class:sr-only={compact && status.tone === 'success'}>{status.text}</span>
</button>

<Modal {open} title="Sync and offline" onclose={() => (open = false)}>
	<div class="stack">
		{#if pantry.needsSignIn}
			<div class="notice warning">
				<Icon name="key" />
				<div class="stack">
					<p>
						Your sign-in expired. Everything you do is still saved on this device; sign in again to
						send it to the server.
					</p>
					<a
						class="btn primary small"
						href={resolve('/login?reauth=1')}
						onclick={() => (open = false)}>Sign in again</a
					>
				</div>
			</div>
		{/if}

		<dl class="facts">
			<div>
				<dt>Connection</dt>
				<dd>
					{#if !pantry.online}No network on this device{:else if !pantry.reachable}Can't reach the
						server{:else}Online{/if}
				</dd>
			</div>
			<div>
				<dt>Last synced</dt>
				<dd>{formatRelative(pantry.lastSyncAt, now)}</dd>
			</div>
			<div>
				<dt>Waiting to upload</dt>
				<dd>{pantry.pendingCount}</dd>
			</div>
			<div>
				<dt>Households on this device</dt>
				<dd>{pantry.searchIndex.length.toLocaleString()}</dd>
			</div>
		</dl>

		{#if !pantry.persistent}
			<div class="notice warning">
				<Icon name="alert" />
				<p>
					This browser isn't letting Pantrybook save data on the device (private browsing?). Offline
					check-ins will be lost if you close the tab.
				</p>
			</div>
		{:else}
			<p class="muted small">
				Pantrybook keeps a copy of households and recent visits on this device, so you can keep
				checking people in without internet. Changes upload automatically when you're back online.
			</p>
		{/if}

		{#if pantry.syncError && !offline}
			<div class="notice danger">
				<Icon name="alert-circle" />
				<p>{pantry.syncError}</p>
			</div>
		{/if}

		{#if pantry.failedEntries.length > 0}
			<div class="stack">
				<h3>Changes the server didn't accept</h3>
				<ul class="entries">
					{#each pantry.failedEntries as entry (entry.seq)}
						<li>
							<div>
								<strong>{entry.label}</strong>
								<p class="small muted">{entry.error}</p>
							</div>
							<button type="button" class="btn small" onclick={() => pantry.discard(entry)}
								>Discard</button
							>
						</li>
					{/each}
				</ul>
				<button type="button" class="btn small" onclick={() => pantry.retryFailed()}>
					<Icon name="refresh" size={16} /> Try these again
				</button>
			</div>
		{/if}

		{#if pantry.pendingCount > 0}
			<details>
				<summary>Show waiting changes ({pantry.pendingCount})</summary>
				<ul class="entries">
					{#each pantry.myOutbox.filter((e) => e.status === 'pending') as entry (entry.seq)}
						<li><span>{entry.label}</span></li>
					{/each}
				</ul>
			</details>
		{/if}
		{#if pantry.othersWaiting > 0}
			<p class="small muted">
				{pantry.othersWaiting} change{pantry.othersWaiting === 1 ? '' : 's'} from someone who signed out
				on this device will upload when they sign in here again.
			</p>
		{/if}
	</div>

	{#snippet actions()}
		<button
			type="button"
			class="btn primary"
			disabled={pantry.syncing}
			onclick={() => pantry.sync()}
		>
			<Icon name="refresh" size={18} />
			{pantry.syncing ? 'Syncing…' : 'Sync now'}
		</button>
	{/snippet}
</Modal>

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 34px;
		padding: 0 12px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-muted);
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		max-width: 100%;
	}

	/* In the phone top bar, let the organization name shrink instead of the status. */
	.pill.compact {
		flex: none;
		max-width: 62vw;
	}

	.pill .text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pill.success {
		color: var(--success);
	}

	.pill.info {
		color: var(--info);
	}

	.pill.warning {
		color: var(--warning);
		background: var(--warning-soft);
		border-color: var(--warning-border);
	}

	.pill.danger {
		color: var(--danger);
		background: var(--danger-soft);
	}

	.pill.neutral {
		color: var(--text);
		background: var(--surface-sunken);
	}

	.spin :global(svg) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: var(--space-3);
		margin: 0;
	}

	.facts div {
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--space-3);
	}

	dt {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	dd {
		margin: 0;
		font-weight: 650;
	}

	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}

	.entries li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	summary {
		cursor: pointer;
		font-weight: 600;
		margin-bottom: var(--space-2);
	}
</style>
