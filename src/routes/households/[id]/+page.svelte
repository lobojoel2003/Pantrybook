<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { errorMessage } from '#lib/client/api.ts';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import { toast } from '#lib/client/toast.svelte.ts';
	import CheckInPanel from '#lib/components/CheckInPanel.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import VisitList from '#lib/components/VisitList.svelte';
	import { formatDate } from '#lib/shared/dates.ts';
	import {
		formatPhone,
		fullName,
		householdLabel,
		householdSize,
		memberBreakdown,
		peopleCount
	} from '#lib/shared/household.ts';
	import type { Visit } from '#lib/shared/types.ts';

	const id = $derived(page.params.id ?? '');
	const household = $derived(pantry.household(id));
	const localVisits = $derived(pantry.householdVisits(id));

	let fullHistory = $state<Visit[] | null>(null);
	let loadingHistory = $state(false);
	let confirmDelete = $state(false);
	let deleteText = $state('');
	let deleting = $state(false);

	const visits = $derived.by(() => {
		if (!fullHistory) return localVisits;
		// Merge: local copies win, since they may include changes not uploaded yet.
		// A throwaway lookup table, not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map(fullHistory.map((v) => [v.id, v]));
		for (const v of localVisits) map.set(v.id, v);
		return [...map.values()].sort(
			(a, b) => b.visit_date.localeCompare(a.visit_date) || b.visited_at.localeCompare(a.visited_at)
		);
	});

	const visitCount = $derived(visits.filter((v) => !v.voided).length);

	async function loadHistory() {
		loadingHistory = true;
		try {
			fullHistory = await pantry.fetchHistory(id);
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			loadingHistory = false;
		}
	}

	async function remove() {
		deleting = true;
		try {
			await pantry.deleteHousehold(id);
			toast.success(
				'Household deleted. Their visits still count in past reports, without any names.'
			);
			confirmDelete = false;
			await goto(resolve('/households'), { replaceState: true });
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head>
	<title>{household ? fullName(household) : 'Household'} · Pantrybook</title>
</svelte:head>

<div class="page">
	{#if !household || household.deleted}
		<div class="card empty">
			<p>
				{household?.deleted
					? 'This household was deleted.'
					: "This household isn't on this device."}
			</p>
			<a class="btn" href={resolve('/households')}>Back to households</a>
		</div>
	{:else}
		<header class="page-header">
			<div>
				<div class="row">
					<h1>{fullName(household)}</h1>
					<span class="badge">{householdLabel(household)}</span>
					{#if household.status === 'inactive'}<span class="badge warning">Inactive</span>{/if}
					{#if pantry.isPending(household.id)}<span class="badge info">Not synced yet</span>{/if}
				</div>
				<p>
					{peopleCount(householdSize(household))} · Registered {formatDate(household.created_at)}
				</p>
			</div>
			<div class="row no-print">
				<a class="btn" href={resolve('/households/[id]/edit', { id: household.id })}>
					<Icon name="edit" /> Edit
				</a>
				<a class="btn" href={resolve(`/intake-form?household=${household.id}`)}>
					<Icon name="printer" /> Print form
				</a>
			</div>
		</header>

		<div class="layout">
			<section class="card checkin no-print" aria-labelledby="checkin-title">
				<h2 id="checkin-title" class="section-title">Check in</h2>
				<CheckInPanel {household} showHeader={false} />
			</section>

			<section class="card" aria-labelledby="details-title">
				<h2 id="details-title" class="section-title">Details</h2>
				<dl class="details">
					<div>
						<dt>Household members</dt>
						<dd>{memberBreakdown(household)}</dd>
					</div>
					<div>
						<dt>Phone</dt>
						<dd>{household.phone ? formatPhone(household.phone) : '—'}</dd>
					</div>
					<div>
						<dt>Email</dt>
						<dd>{household.email || '—'}</dd>
					</div>
					<div>
						<dt>Address</dt>
						<dd>
							{[household.address, household.city, household.state, household.zip]
								.filter(Boolean)
								.join(', ') || '—'}
						</dd>
					</div>
					<div>
						<dt>Language</dt>
						<dd>{household.language || '—'}</dd>
					</div>
					<div>
						<dt>Dietary needs</dt>
						<dd>{household.dietary || '—'}</dd>
					</div>
					<div>
						<dt>Income eligible</dt>
						<dd>{household.income_eligible ? 'Yes (self-declared)' : 'Not recorded'}</dd>
					</div>
					<div>
						<dt>Details confirmed</dt>
						<dd>{household.verified_at ? formatDate(household.verified_at) : 'Never'}</dd>
					</div>
					{#if household.notes}
						<div class="wide">
							<dt>Notes</dt>
							<dd class="pre">{household.notes}</dd>
						</div>
					{/if}
				</dl>
			</section>
		</div>

		<section class="card" aria-labelledby="history-title">
			<div class="card-header">
				<div>
					<h2 id="history-title">Visit history</h2>
					<p>
						{visitCount}
						{visitCount === 1 ? 'visit' : 'visits'}
						{fullHistory
							? 'in total'
							: pantry.visitWindowStart
								? `since ${formatDate(pantry.visitWindowStart)}`
								: ''}
					</p>
				</div>
				{#if !fullHistory}
					<button
						type="button"
						class="btn small"
						disabled={loadingHistory || !pantry.reachable}
						onclick={loadHistory}
					>
						{loadingHistory ? 'Loading…' : 'Load full history'}
					</button>
				{/if}
			</div>
			<VisitList {visits} empty="No visits recorded yet." />
		</section>

		{#if pantry.me?.role === 'admin'}
			<section class="card danger-zone no-print">
				<h2>Delete household</h2>
				<p class="muted">
					For when a family asks you to remove their information. Names and contact details are
					erased for good; their past visits stay in totals without any names.
				</p>
				<button
					type="button"
					class="btn"
					disabled={!pantry.reachable}
					onclick={() => {
						confirmDelete = true;
						deleteText = '';
					}}
				>
					<Icon name="trash" /> Delete household…
				</button>
				{#if !pantry.reachable}<p class="small muted">Needs a connection to the server.</p>{/if}
			</section>
		{/if}
	{/if}
</div>

<Modal
	open={confirmDelete}
	title="Delete this household?"
	size="small"
	onclose={() => (confirmDelete = false)}
>
	<div class="stack">
		<p>This can't be undone. Type <strong>delete</strong> to confirm.</p>
		<label class="field">
			<span class="sr-only">Type delete to confirm</span>
			<input type="text" autocomplete="off" bind:value={deleteText} />
		</label>
	</div>
	{#snippet actions()}
		<button type="button" class="btn" onclick={() => (confirmDelete = false)}>Cancel</button>
		<button
			type="button"
			class="btn danger"
			disabled={deleteText.trim().toLowerCase() !== 'delete' || deleting}
			onclick={remove}
		>
			Delete permanently
		</button>
	{/snippet}
</Modal>

<style>
	.layout {
		display: grid;
		gap: var(--space-4);
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
		align-items: start;
	}

	.section-title {
		margin-bottom: var(--space-4);
	}

	.details {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--space-4);
		margin: 0;
	}

	.details .wide {
		grid-column: 1 / -1;
	}

	dt {
		font-size: 0.82rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	dd {
		margin: 2px 0 0;
	}

	.pre {
		white-space: pre-line;
	}

	.danger-zone {
		display: grid;
		gap: var(--space-3);
		justify-items: start;
		border-color: color-mix(in srgb, var(--danger) 30%, var(--border));
	}
</style>
