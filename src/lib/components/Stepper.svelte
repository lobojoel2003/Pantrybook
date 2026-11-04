<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		label: string;
		hint?: string;
		value: number;
		min?: number;
		max?: number;
		id: string;
	}

	let { label, hint, value = $bindable(), min = 0, max = 30, id }: Props = $props();

	function set(next: number) {
		value = Math.min(max, Math.max(min, Number.isFinite(next) ? Math.trunc(next) : min));
	}
</script>

<div class="stepper field">
	<label for={id}>
		<span class="label">{label}</span>
		{#if hint}<span class="hint">{hint}</span>{/if}
	</label>
	<div class="controls">
		<button
			type="button"
			class="btn icon-only"
			aria-label={`Fewer ${label.toLowerCase()}`}
			disabled={value <= min}
			onclick={() => set(value - 1)}
		>
			<Icon name="minus" />
		</button>
		<input
			{id}
			type="number"
			inputmode="numeric"
			{min}
			{max}
			bind:value
			onchange={() => set(value)}
		/>
		<button
			type="button"
			class="btn icon-only"
			aria-label={`More ${label.toLowerCase()}`}
			disabled={value >= max}
			onclick={() => set(value + 1)}
		>
			<Icon name="plus" />
		</button>
	</div>
</div>

<style>
	label {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.controls {
		display: grid;
		grid-template-columns: var(--tap) minmax(56px, 1fr) var(--tap);
		gap: var(--space-2);
		max-width: 220px;
	}

	input {
		text-align: center;
		font-weight: 650;
		font-size: 1.1rem;
		-moz-appearance: textfield;
		appearance: textfield;
	}

	input::-webkit-outer-spin-button,
	input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
</style>
