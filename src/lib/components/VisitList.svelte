<script lang="ts">
	import { resolve } from '$app/paths';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import { toast } from '#lib/client/toast.svelte.ts';
	import { formatDate, formatTime } from '#lib/shared/dates.ts';
	import { fullName, householdLabel, peopleCount } from '#lib/shared/household.ts';
	import type { Visit } from '#lib/shared/types.ts';
	import Icon from './Icon.svelte';
	import Modal from './Modal.svelte';

	interface Props {
		visits: Visit[];
		/** Show the household's name on each row (for the daily log). */
		showHousehold?: boolean;
		showDate?: boolean;
		allowVoid?: boolean;
		empty?: string;
	}

	let {
		visits,
		showHousehold = false,
		showDate = true,
		allowVoid = true,
		empty = 'No visits yet.'
	}: Props = $props();

	let voiding = $state<Visit | null>(null);
	let reason = $state('');

	async function confirmVoid() {
		if (!voiding) return;
		await pantry.voidVisit(voiding, reason || 'Removed by volunteer');
		toast.info('Visit removed. It no longer counts toward limits or reports.');
		voiding = null;
		reason = '';
	}
</script>

{#if visits.length === 0}
	<p class="empty">{empty}</p>
{:else}
	<ul class="visits">
		{#each visits as v (v.id)}
			{@const program = pantry.program(v.program_id)}
			{@const household = pantry.household(v.household_id)}
			<li class:voided={v.voided}>
				<div class="when">
					{#if showDate}<strong>{formatDate(v.visit_date)}</strong>{/if}
					<span class="muted small">{formatTime(v.visited_at)}</span>
				</div>
				<div class="what">
					{#if showHousehold}
						{#if household && !household.deleted}
							<a href={resolve('/households/[id]', { id: household.id })}>
								<strong>{fullName(household)}</strong>
							</a>
							<span class="muted small"
								>{householdLabel(household)} · {peopleCount(
									v.adults + v.children + v.seniors
								)}</span
							>
						{:else}
							<strong class="muted">Deleted household</strong>
						{/if}
					{/if}
					<div class="row">
						<span>{program?.name ?? 'Program'}</span>
						{#if v.quantity !== null}
							<span class="muted">· {v.quantity.toLocaleString()} {program?.unit ?? ''}</span>
						{/if}
						{#if v.over_limit && !v.voided}
							<span class="badge warning" title={v.override_reason}>Over limit</span>
						{/if}
						{#if v.voided}<span class="badge">Removed</span>{/if}
						{#if pantry.isPending(v.id)}<span class="badge info">Not synced</span>{/if}
					</div>
					{#if v.override_reason && !v.voided}
						<span class="small muted">Reason: {v.override_reason}</span>
					{/if}
					{#if v.voided && v.void_reason}
						<span class="small muted">Removed: {v.void_reason}</span>
					{/if}
					{#if v.notes}<span class="small muted">Note: {v.notes}</span>{/if}
				</div>
				<div class="by small muted">{pantry.userName(v.created_by)}</div>
				{#if allowVoid && !v.voided}
					<button
						type="button"
						class="btn small ghost"
						onclick={() => {
							voiding = v;
							reason = '';
						}}
						aria-label="Remove this visit"
					>
						<Icon name="undo" size={16} /> Remove
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<Modal
	open={voiding !== null}
	title="Remove this visit?"
	size="small"
	onclose={() => (voiding = null)}
>
	<div class="stack">
		<p>
			Use this for mistakes, like checking in the wrong family. The visit stays in the history
			marked "removed" and stops counting toward limits and reports.
		</p>
		<label class="field">
			<span>Reason <span class="hint">(optional)</span></span>
			<input type="text" maxlength="200" bind:value={reason} placeholder="Wrong household" />
		</label>
	</div>
	{#snippet actions()}
		<button type="button" class="btn" onclick={() => (voiding = null)}>Keep it</button>
		<button type="button" class="btn danger" onclick={confirmVoid}>Remove visit</button>
	{/snippet}
</Modal>

<style>
	.visits {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}

	li {
		display: grid;
		grid-template-columns: minmax(96px, auto) 1fr auto auto;
		gap: var(--space-2) var(--space-4);
		align-items: start;
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--border);
	}

	li:last-child {
		border-bottom: 0;
	}

	li.voided .what,
	li.voided .when {
		opacity: 0.6;
		text-decoration: line-through;
		text-decoration-color: var(--text-faint);
	}

	.when,
	.what {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.by {
		white-space: nowrap;
	}

	@media (max-width: 560px) {
		li {
			grid-template-columns: 1fr auto;
		}
		.when {
			grid-column: 1 / -1;
			display: flex;
			gap: var(--space-2);
		}
		.by {
			display: none;
		}
	}
</style>
