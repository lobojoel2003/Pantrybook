<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { download } from '#lib/client/api.ts';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { formatDate } from '#lib/shared/dates.ts';
	import {
		formatPhone,
		fullName,
		householdLabel,
		householdSize,
		searchHouseholds
	} from '#lib/shared/household.ts';
	import type { Household } from '#lib/shared/types.ts';

	let query = $state('');
	let status = $state<'active' | 'inactive' | 'all'>('active');
	let sort = $state<'name' | 'number' | 'recent'>('name');
	let limit = $state(100);

	function lastVisit(id: string): string {
		return pantry.householdVisits(id).find((v) => !v.voided)?.visit_date ?? '';
	}

	const list = $derived.by(() => {
		let rows: Household[] = query.trim()
			? searchHouseholds(pantry.searchIndex, query, 500)
			: pantry.searchIndex.map((e) => e.household);
		if (status !== 'all') rows = rows.filter((h) => h.status === status);
		if (!query.trim()) {
			rows = [...rows];
			if (sort === 'name') {
				rows.sort(
					(a, b) =>
						a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
				);
			} else if (sort === 'number') {
				rows.sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
			} else {
				rows.sort((a, b) => lastVisit(b.id).localeCompare(lastVisit(a.id)));
			}
		}
		return rows;
	});

	const counts = $derived.by(() => {
		let active = 0;
		let inactive = 0;
		for (const { household } of pantry.searchIndex) {
			if (household.status === 'active') active += 1;
			else inactive += 1;
		}
		return { active, inactive };
	});
</script>

<svelte:head>
	<title>Households · Pantrybook</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<div>
			<h1>Households</h1>
			<p>{counts.active.toLocaleString()} active · {counts.inactive.toLocaleString()} inactive</p>
		</div>
		<div class="row">
			{#if pantry.me?.role === 'admin'}
				<button type="button" class="btn" onclick={() => download('/api/export/households.csv')}>
					<Icon name="download" /> Export CSV
				</button>
			{/if}
			<a class="btn primary" href={resolve('/households/new')}><Icon name="plus" /> New household</a
			>
		</div>
	</header>

	<div class="filters">
		<label class="field grow">
			<span class="sr-only">Search households</span>
			<input type="search" placeholder="Search by name, phone, address or #" bind:value={query} />
		</label>
		<label class="field">
			<span class="sr-only">Status</span>
			<select bind:value={status}>
				<option value="active">Active</option>
				<option value="inactive">Inactive</option>
				<option value="all">All</option>
			</select>
		</label>
		<label class="field">
			<span class="sr-only">Sort by</span>
			<select bind:value={sort} disabled={!!query.trim()}>
				<option value="name">Sort: Last name</option>
				<option value="number">Sort: Household #</option>
				<option value="recent">Sort: Most recent visit</option>
			</select>
		</label>
	</div>

	{#if list.length === 0}
		<div class="card empty">
			<p>{query ? 'No households match your search.' : 'No households yet.'}</p>
			<a class="btn primary" href={resolve('/households/new')}
				><Icon name="plus" /> Register a household</a
			>
		</div>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>#</th>
						<th class="num">People</th>
						<th class="hide-sm">Phone</th>
						<th class="hide-sm">Address</th>
						<th>Last visit</th>
					</tr>
				</thead>
				<tbody>
					{#each list.slice(0, limit) as h (h.id)}
						<tr class="clickable" onclick={() => goto(resolve('/households/[id]', { id: h.id }))}>
							<td>
								<a href={resolve('/households/[id]', { id: h.id })}>{fullName(h)}</a>
								{#if h.status === 'inactive'}<span class="badge warning">Inactive</span>{/if}
								{#if pantry.isPending(h.id)}<span class="badge info">Not synced</span>{/if}
							</td>
							<td class="mono">{householdLabel(h)}</td>
							<td class="num">{householdSize(h)}</td>
							<td class="hide-sm">{h.phone ? formatPhone(h.phone) : ''}</td>
							<td class="hide-sm">{[h.address, h.city, h.zip].filter(Boolean).join(', ')}</td>
							<td>{formatDate(lastVisit(h.id)) || '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if list.length > limit}
			<button type="button" class="btn" onclick={() => (limit += 200)}>
				Show more ({(list.length - limit).toLocaleString()} more)
			</button>
		{/if}
	{/if}
</div>

<style>
	.filters {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.filters .grow {
		flex: 1 1 280px;
	}

	td a {
		font-weight: 600;
		margin-right: var(--space-2);
	}

	@media (max-width: 720px) {
		.hide-sm {
			display: none;
		}
	}
</style>
