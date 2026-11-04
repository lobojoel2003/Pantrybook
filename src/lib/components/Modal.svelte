<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	interface Props {
		open: boolean;
		title: string;
		onclose: () => void;
		children: Snippet;
		actions?: Snippet;
		size?: 'small' | 'medium' | 'large';
	}

	let { open, title, onclose, children, actions, size = 'medium' }: Props = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	const titleId = `modal-${Math.random().toString(36).slice(2)}`;

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	class={size}
	aria-labelledby={titleId}
	{onclose}
	onclick={(e) => {
		if (e.target === dialog) onclose();
	}}
>
	{#if open}
		<div class="inner">
			<header>
				<h2 id={titleId}>{title}</h2>
				<button type="button" class="btn ghost icon-only" onclick={onclose} aria-label="Close">
					<Icon name="x" />
				</button>
			</header>
			<div class="body">
				{@render children()}
			</div>
			{#if actions}
				<footer>{@render actions()}</footer>
			{/if}
		</div>
	{/if}
</dialog>

<style>
	dialog {
		border: 0;
		padding: 0;
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-lg);
		width: min(560px, calc(100vw - 24px));
		max-height: calc(100dvh - 32px);
	}

	dialog.small {
		width: min(420px, calc(100vw - 24px));
	}

	dialog.large {
		width: min(860px, calc(100vw - 24px));
	}

	dialog::backdrop {
		background: rgb(10 16 12 / 0.45);
	}

	.inner {
		display: grid;
		grid-template-rows: auto 1fr auto;
		max-height: calc(100dvh - 32px);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-4) var(--space-2) var(--space-5);
	}

	.body {
		padding: var(--space-2) var(--space-5) var(--space-5);
		overflow-y: auto;
	}

	footer {
		display: flex;
		gap: var(--space-3);
		justify-content: flex-end;
		flex-wrap: wrap;
		padding: var(--space-4) var(--space-5);
		border-top: 1px solid var(--border);
	}
</style>
