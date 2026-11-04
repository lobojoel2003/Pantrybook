<script lang="ts">
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import StatTile from '#lib/components/StatTile.svelte';
	import VisitList from '#lib/components/VisitList.svelte';
	import { addDays, formatLongDate, today } from '#lib/shared/dates.ts';

	let date = $state(today());
	let programId = $state('');

	const dayVisits = $derived(
		[...pantry.visits.values()]
			.filter((v) => v.visit_date === date && (!programId || v.program_id === programId))
			.sort((a, b) => b.visited_at.localeCompare(a.visited_at))
	);
	const counted = $derived(dayVisits.filter((v) => !v.voided));
	const households = $derived(new Set(counted.map((v) => v.household_id)).size);
	const people = $derived.by(() => {
		const seen: Record<string, number> = {};
		for (const v of counted) seen[v.household_id] = v.adults + v.children + v.seniors;
		return Object.values(seen).reduce((a, b) => a + b, 0);
	});
	const quantities = $derived.by(() => {
		const totals: Record<string, number> = {};
		for (const v of counted) {
			const unit = pantry.program(v.program_id)?.unit;
			if (unit && v.quantity !== null) totals[unit] = (totals[unit] ?? 0) + v.quantity;
		}
		return Object.entries(totals);
	});
	const outsideWindow = $derived(!!pantry.visitWindowStart && date < pantry.visitWindowStart);
</script>

<svelte:head>
	<title>Visits · Pantrybook</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<div>
			<h1>{date === today() ? "Today's visits" : 'Visits'}</h1>
			<p>{formatLongDate(date)}</p>
		</div>
		<button type="button" class="btn no-print" onclick={() => window.print()}>
			<Icon name="printer" /> Print sign-in sheet
		</button>
	</header>

	<div class="filters no-print">
		<div class="row">
			<button
				type="button"
				class="btn icon-only"
				aria-label="Previous day"
				onclick={() => (date = addDays(date, -1))}
			>
				<Icon name="arrow-left" />
			</button>
			<label class="field">
				<span class="sr-only">Date</span>
				<input type="date" max={today()} bind:value={date} />
			</label>
			<button
				type="button"
				class="btn icon-only"
				aria-label="Next day"
				disabled={date >= today()}
				onclick={() => (date = addDays(date, 1))}
			>
				<Icon name="chevron-right" />
			</button>
			{#if date !== today()}
				<button type="button" class="btn ghost" onclick={() => (date = today())}>Today</button>
			{/if}
		</div>
		<label class="field">
			<span class="sr-only">Program</span>
			<select bind:value={programId}>
				<option value="">All programs</option>
				{#each pantry.programs as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
			</select>
		</label>
	</div>

	<div class="tiles">
		<StatTile label="Check-ins" value={counted.length} />
		<StatTile label="Households" value={households} />
		<StatTile label="People" value={people} />
		{#each quantities as [unit, total] (unit)}
			<StatTile label={`Total ${unit}`} value={Math.round(total * 10) / 10} />
		{/each}
	</div>

	{#if outsideWindow}
		<p class="notice info">
			<Icon name="info" />
			<span>This device only keeps recent visits. Use Reports to see older days.</span>
		</p>
	{/if}

	<div class="card">
		<VisitList visits={dayVisits} showHousehold showDate={false} empty="No visits on this day." />
	</div>
</div>

<style>
	.filters {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
		justify-content: space-between;
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--space-3);
	}
</style>
