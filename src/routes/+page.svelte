<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import CheckInPanel from '#lib/components/CheckInPanel.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import StatTile from '#lib/components/StatTile.svelte';
	import VisitList from '#lib/components/VisitList.svelte';
	import { formatDate, formatLongDate, today } from '#lib/shared/dates.ts';
	import {
		formatPhone,
		fullName,
		householdLabel,
		householdSize,
		peopleCount,
		searchHouseholds
	} from '#lib/shared/household.ts';
	import { tick } from 'svelte';

	let query = $state('');
	let highlighted = $state(0);
	let input = $state<HTMLInputElement | null>(null);

	const selectedId = $derived(page.url.searchParams.get('h'));
	const selected = $derived(selectedId ? pantry.household(selectedId) : undefined);
	const results = $derived(searchHouseholds(pantry.searchIndex, query, 30));
	const todayISO = today();

	const todaysVisits = $derived(
		[...pantry.visits.values()]
			.filter((v) => v.visit_date === todayISO && !v.voided)
			.sort((a, b) => b.visited_at.localeCompare(a.visited_at))
	);
	const todaysHouseholds = $derived(new Set(todaysVisits.map((v) => v.household_id)));
	const todaysPeople = $derived.by(() => {
		let n = 0;
		const seen: Record<string, true> = {};
		for (const v of todaysVisits) {
			if (seen[v.household_id]) continue;
			seen[v.household_id] = true;
			n += v.adults + v.children + v.seniors;
		}
		return n;
	});

	$effect(() => {
		// Reset the keyboard highlight whenever the results change.
		void results;
		highlighted = 0;
	});

	async function choose(id: string) {
		await goto(resolve(`/?h=${id}`));
	}

	async function backToSearch(clear = false) {
		if (clear) query = '';
		await goto(resolve('/'));
		await tick();
		input?.focus();
		if (!clear) input?.select();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlighted = Math.min(results.length - 1, highlighted + 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlighted = Math.max(0, highlighted - 1);
		} else if (event.key === 'Enter' && results[highlighted]) {
			event.preventDefault();
			void choose(results[highlighted].id);
		} else if (event.key === 'Escape') {
			query = '';
		}
	}

	function lastVisitText(id: string): string {
		const last = pantry.householdVisits(id).find((v) => !v.voided);
		return last ? `Last visit ${formatDate(last.visit_date)}` : 'No visits yet';
	}

	function newHouseholdHref(): string {
		const q = query.trim();
		return q && !/^#?\d+$/.test(q)
			? resolve(`/households/new?name=${encodeURIComponent(q)}`)
			: resolve('/households/new');
	}
</script>

<svelte:head>
	<title>Check in · Pantrybook</title>
</svelte:head>

<div class="page">
	{#if selected}
		<div class="row">
			<button type="button" class="btn ghost" onclick={() => backToSearch(false)}>
				<Icon name="arrow-left" /> Back to search
			</button>
			<span class="spacer"></span>
			<a class="btn ghost" href={resolve('/households/[id]', { id: selected.id })}>
				Household details <Icon name="chevron-right" />
			</a>
		</div>
		<div class="card">
			<CheckInPanel household={selected} ondone={() => backToSearch(true)} />
		</div>
	{:else}
		<header class="page-header">
			<div>
				<h1>Check in</h1>
				<p>{formatLongDate(todayISO)}</p>
			</div>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- newHouseholdHref() uses resolve() -->
			<a class="btn primary" href={newHouseholdHref()}>
				<Icon name="plus" /> New household
			</a>
		</header>

		<div class="search card tight">
			<label for="search" class="sr-only">Find a household</label>
			<Icon name="search" size={24} />
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="search"
				type="search"
				bind:this={input}
				bind:value={query}
				{onkeydown}
				placeholder="Name, phone, or household number"
				autocomplete="off"
				autocapitalize="words"
				spellcheck="false"
				enterkeyhint="search"
				autofocus
				aria-controls="results"
			/>
			{#if query}
				<button
					type="button"
					class="btn ghost icon-only"
					aria-label="Clear search"
					onclick={() => backToSearch(true)}
				>
					<Icon name="x" />
				</button>
			{/if}
		</div>

		{#if selectedId && !selected}
			<p class="notice warning">
				<Icon name="alert" /><span>That household isn't on this device.</span>
			</p>
		{/if}

		{#if query.trim()}
			<section aria-live="polite">
				{#if results.length === 0}
					<div class="card empty">
						<p>No household matches “{query}”.</p>
						<p class="small">Check the spelling, or try a phone number or household #.</p>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- newHouseholdHref() uses resolve() -->
						<a class="btn primary" href={newHouseholdHref()}>
							<Icon name="plus" /> Register a new household
						</a>
					</div>
				{:else}
					<ul id="results" class="results" role="listbox" aria-label="Matching households">
						{#each results as h, i (h.id)}
							<li role="option" aria-selected={i === highlighted}>
								<button
									type="button"
									class="result"
									class:highlighted={i === highlighted}
									onclick={() => choose(h.id)}
									onpointerenter={() => (highlighted = i)}
								>
									<span class="main">
										<strong>{fullName(h)}</strong>
										<span class="muted small">
											{householdLabel(h)} · {peopleCount(householdSize(h))}
											{#if h.phone}· {formatPhone(h.phone)}{/if}
										</span>
										<span class="faint small">
											{[h.address, h.city].filter(Boolean).join(', ') || 'No address'} · {lastVisitText(
												h.id
											)}
										</span>
									</span>
									{#if h.status === 'inactive'}<span class="badge warning">Inactive</span>{/if}
									{#if todaysHouseholds.has(h.id)}<span class="badge success">Here today</span>{/if}
									<Icon name="chevron-right" />
								</button>
							</li>
						{/each}
					</ul>
					<p class="small faint hint-line">
						Tip: use <span class="kbd">↑</span> <span class="kbd">↓</span> and
						<span class="kbd">Enter</span> to pick a household.
					</p>
				{/if}
			</section>
		{:else}
			{#if !pantry.hasData && pantry.searchIndex.length === 0}
				<div class="notice info">
					<Icon name="cloud" />
					<p>
						{pantry.syncing
							? 'Downloading households to this device…'
							: 'No households on this device yet. Register your first household, or ask a coordinator to import your spreadsheet.'}
					</p>
				</div>
			{/if}

			<section class="today">
				<div class="tiles">
					<StatTile label="Check-ins today" value={todaysVisits.length} />
					<StatTile label="Households today" value={todaysHouseholds.size} />
					<StatTile label="People served today" value={todaysPeople} />
				</div>
				<div class="card">
					<div class="card-header">
						<h2>Recent check-ins</h2>
						<a href={resolve('/visits')} class="small">See all of today</a>
					</div>
					<VisitList
						visits={todaysVisits.slice(0, 8)}
						showHousehold
						showDate={false}
						empty="Nobody checked in yet today. Search above to start."
					/>
				</div>
			</section>
		{/if}
	{/if}
</div>

<style>
	.search {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		position: sticky;
		top: 60px;
		z-index: 5;
		box-shadow: var(--shadow);
	}

	@media (min-width: 900px) {
		.search {
			top: var(--space-4);
		}
	}

	.search > :global(svg) {
		color: var(--text-muted);
		flex: none;
	}

	.search input {
		border: 0;
		font-size: 1.25rem;
		min-height: 52px;
		padding: 0;
		background: transparent;
	}

	.search input:focus {
		outline: none;
	}

	.search:focus-within {
		border-color: var(--focus);
		outline: 3px solid color-mix(in srgb, var(--focus) 30%, transparent);
	}

	.results {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}

	.result {
		width: 100%;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		min-height: 64px;
		text-align: left;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		font: inherit;
		cursor: pointer;
	}

	.result.highlighted {
		border-color: var(--primary);
		box-shadow: 0 0 0 1px var(--primary);
	}

	.result .main {
		display: grid;
		gap: 1px;
		flex: 1;
		min-width: 0;
	}

	.result strong {
		font-size: 1.1rem;
	}

	.result > :global(svg) {
		color: var(--text-faint);
		flex: none;
	}

	.hint-line {
		margin-top: var(--space-3);
	}

	@media (hover: none) {
		.hint-line {
			display: none;
		}
	}

	.today {
		display: grid;
		gap: var(--space-4);
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--space-3);
	}
</style>
