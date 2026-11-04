<script lang="ts">
	interface Props {
		label: string;
		value: number | string;
		hint?: string;
	}

	let { label, value, hint }: Props = $props();

	const display = $derived(typeof value === 'number' ? value.toLocaleString() : value);
</script>

<div class="tile">
	<div class="label">{label}</div>
	<div class="value">{display}</div>
	{#if hint}<div class="hint">{hint}</div>{/if}
</div>

<style>
	.tile {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--space-4);
		display: grid;
		gap: 2px;
		align-content: start;
		min-width: 0;
	}

	.label {
		color: var(--text-muted);
		font-size: 0.88rem;
		font-weight: 550;
	}

	.value {
		font-size: 1.85rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}

	.hint {
		color: var(--text-faint);
		font-size: 0.8rem;
	}
</style>
