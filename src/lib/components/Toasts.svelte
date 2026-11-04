<script lang="ts">
	import { toasts } from '#lib/client/toast.svelte.ts';
	import Icon, { type IconName } from './Icon.svelte';

	const ICONS: Record<string, IconName> = {
		success: 'check-circle',
		info: 'info',
		warning: 'alert',
		error: 'alert-circle'
	};
</script>

<div class="toasts no-print" aria-live="polite" aria-relevant="additions">
	{#each toasts.items as t (t.id)}
		<div class="toast {t.kind}" role={t.kind === 'error' ? 'alert' : 'status'}>
			<Icon name={ICONS[t.kind]} />
			<p>{t.message}</p>
			{#if t.action}
				<button
					type="button"
					class="btn small ghost"
					onclick={() => {
						t.action?.run();
						toasts.dismiss(t.id);
					}}>{t.action.label}</button
				>
			{/if}
			<button
				type="button"
				class="btn small ghost icon-only"
				aria-label="Dismiss"
				onclick={() => toasts.dismiss(t.id)}
			>
				<Icon name="x" size={16} />
			</button>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		z-index: 50;
		left: 50%;
		bottom: calc(76px + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		display: grid;
		gap: var(--space-2);
		width: min(520px, calc(100vw - 24px));
		pointer-events: none;
	}

	@media (min-width: 900px) {
		.toasts {
			bottom: var(--space-5);
			left: calc(50% + var(--sidebar) / 2);
		}
	}

	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		border-radius: var(--radius);
		background: var(--text);
		color: var(--bg);
		box-shadow: var(--shadow-lg);
		animation: rise 0.18s ease-out;
	}

	.toast p {
		flex: 1;
		font-size: 0.95rem;
		padding: var(--space-1) 0;
	}

	.toast :global(.btn) {
		--btn-text: var(--bg);
	}

	.toast :global(.btn:hover) {
		--btn-bg: color-mix(in srgb, var(--bg) 15%, transparent);
	}

	.toast.success > :global(svg) {
		color: var(--success-soft);
	}

	.toast.warning {
		background: var(--warning-soft);
		color: var(--text);
		border: 1px solid var(--warning-border);
	}

	.toast.warning :global(.btn) {
		--btn-text: var(--text);
	}

	.toast.error {
		background: var(--danger);
		color: #fff;
	}

	.toast.error :global(.btn) {
		--btn-text: #fff;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
</style>
