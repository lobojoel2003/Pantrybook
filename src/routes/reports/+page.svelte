<script lang="ts">
	import { resolve } from '$app/paths';
	import { api, download, errorMessage } from '#lib/client/api.ts';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import BarChart from '#lib/components/BarChart.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import StatTile from '#lib/components/StatTile.svelte';
	import {
		addDays,
		addMonths,
		endOfMonth,
		endOfQuarter,
		endOfYear,
		formatDate,
		formatMonth,
		formatShortDate,
		startOfMonth,
		startOfQuarter,
		startOfYear,
		today
	} from '#lib/shared/dates.ts';
	import type { Report } from '#lib/shared/types.ts';

	type Preset =
		'this-month' | 'last-month' | 'last-30' | 'this-quarter' | 'this-year' | 'last-year' | 'custom';

	const PRESETS: { value: Preset; label: string }[] = [
		{ value: 'this-month', label: 'This month' },
		{ value: 'last-month', label: 'Last month' },
		{ value: 'last-30', label: 'Last 30 days' },
		{ value: 'this-quarter', label: 'This quarter' },
		{ value: 'this-year', label: 'This year' },
		{ value: 'last-year', label: 'Last year' },
		{ value: 'custom', label: 'Custom dates' }
	];

	function rangeFor(preset: Preset): { from: string; to: string } {
		const t = today();
		switch (preset) {
			case 'this-month':
				return { from: startOfMonth(t), to: t };
			case 'last-month': {
				const start = addMonths(startOfMonth(t), -1);
				return { from: start, to: endOfMonth(start) };
			}
			case 'last-30':
				return { from: addDays(t, -29), to: t };
			case 'this-quarter':
				return { from: startOfQuarter(t), to: t < endOfQuarter(t) ? t : endOfQuarter(t) };
			case 'this-year':
				return { from: startOfYear(t), to: t };
			case 'last-year': {
				const lastYear = `${Number(t.slice(0, 4)) - 1}-06-01`;
				return { from: startOfYear(lastYear), to: endOfYear(lastYear) };
			}
			default:
				return { from: startOfMonth(t), to: t };
		}
	}

	let preset = $state<Preset>('this-month');
	let from = $state(rangeFor('this-month').from);
	let to = $state(rangeFor('this-month').to);
	let programId = $state('');
	let report = $state<Report | null>(null);
	let loading = $state(false);
	let error = $state('');
	let showTable = $state(false);

	function choosePreset(next: Preset) {
		preset = next;
		if (next !== 'custom') {
			const range = rangeFor(next);
			from = range.from;
			to = range.to;
		}
	}

	const query = $derived(
		`from=${from}&to=${to}${programId ? `&program=${encodeURIComponent(programId)}` : ''}`
	);

	let requestId = 0;
	$effect(() => {
		const q = query;
		const reachable = pantry.reachable;
		if (!from || !to || from > to || !reachable) return;
		const id = ++requestId;
		loading = true;
		error = '';
		api
			.get<Report>(`/api/reports?${q}`)
			.then((r) => {
				if (id === requestId) report = r;
			})
			.catch((err) => {
				if (id === requestId) error = errorMessage(err);
			})
			.finally(() => {
				if (id === requestId) loading = false;
			});
	});

	const programName = $derived(
		programId ? (pantry.program(programId)?.name ?? '') : 'All programs'
	);

	const chartData = $derived(
		(report?.by_period ?? []).map((p) => ({
			key: p.period,
			value: p.visits,
			label: report?.granularity === 'month' ? formatMonth(p.period) : formatShortDate(p.period),
			tick:
				report?.granularity === 'month'
					? formatMonth(p.period).split(' ')[0]
					: String(Number(p.period.slice(8, 10))),
			detail: `${p.households.toLocaleString()} households`
		}))
	);

	const demographics = $derived.by(() => {
		if (!report) return [];
		const t = report.totals;
		const total = Math.max(1, t.individuals);
		return [
			{ label: 'Children (0–17)', value: t.children },
			{ label: 'Adults (18–64)', value: t.adults },
			{ label: 'Seniors (65+)', value: t.seniors }
		].map((row) => ({ ...row, share: Math.round((row.value / total) * 100) }));
	});

	const quantityTiles = $derived(
		(report?.by_program ?? [])
			.filter((p) => p.unit && p.quantity > 0)
			.reduce<Record<string, number>>((acc, p) => {
				acc[p.unit] = (acc[p.unit] ?? 0) + p.quantity;
				return acc;
			}, {})
	);
</script>

<svelte:head>
	<title>Reports · Pantrybook</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<div>
			<h1>Reports</h1>
			<p>Numbers for funders, boards and food bank partners.</p>
		</div>
		<div class="row no-print">
			<button
				type="button"
				class="btn"
				disabled={!report}
				onclick={() => download(`/api/reports/summary.csv?${query}`)}
			>
				<Icon name="download" /> Summary CSV
			</button>
			{#if pantry.me?.role === 'admin'}
				<button
					type="button"
					class="btn"
					disabled={!report}
					onclick={() => download(`/api/reports/visits.csv?${query}`)}
				>
					<Icon name="download" /> All visits CSV
				</button>
			{/if}
			<button type="button" class="btn" disabled={!report} onclick={() => window.print()}>
				<Icon name="printer" /> Print
			</button>
		</div>
	</header>

	<div class="filters no-print">
		<label class="field">
			<span class="sr-only">Date range</span>
			<select value={preset} onchange={(e) => choosePreset(e.currentTarget.value as Preset)}>
				{#each PRESETS as p (p.value)}<option value={p.value}>{p.label}</option>{/each}
			</select>
		</label>
		<label class="field">
			<span class="sr-only">From</span>
			<input type="date" bind:value={from} max={to} onchange={() => (preset = 'custom')} />
		</label>
		<span class="muted">to</span>
		<label class="field">
			<span class="sr-only">To</span>
			<input type="date" bind:value={to} min={from} onchange={() => (preset = 'custom')} />
		</label>
		<label class="field">
			<span class="sr-only">Program</span>
			<select bind:value={programId}>
				<option value="">All programs</option>
				{#each pantry.programs as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
			</select>
		</label>
	</div>

	<div class="print-only">
		<h2>{pantry.orgName} — {programName}</h2>
		<p>{formatDate(from)} to {formatDate(to)}</p>
	</div>

	{#if !pantry.reachable}
		<div class="notice warning">
			<Icon name="cloud-off" />
			<p>
				Reports are calculated on the server, so they need a connection. Check-ins still work
				offline.
			</p>
		</div>
	{/if}

	{#if error}
		<div class="notice danger">
			<Icon name="alert-circle" />
			<p>{error}</p>
		</div>
	{/if}

	{#if report}
		<div class="report stack-lg" class:loading>
			<section class="tiles" aria-label="Totals">
				<StatTile
					label="Households served"
					value={report.totals.households}
					hint="Each household counted once"
				/>
				<StatTile
					label="People served"
					value={report.totals.individuals}
					hint="Each person counted once"
				/>
				<StatTile label="Visits" value={report.totals.visits} />
				<StatTile label="First-time households" value={report.totals.new_households} />
				{#each Object.entries(quantityTiles) as [unit, total] (unit)}
					<StatTile label={`Total ${unit}`} value={Math.round(total)} />
				{/each}
				<StatTile
					label="Over-limit visits"
					value={report.totals.over_limit_visits}
					hint={report.totals.over_limit_visits ? 'Listed below' : undefined}
				/>
			</section>

			<section class="card">
				<div class="card-header">
					<div>
						<h2>Visits per {report.granularity === 'month' ? 'month' : 'day'}</h2>
						<p>{programName} · {formatDate(report.from)} to {formatDate(report.to)}</p>
					</div>
					<button type="button" class="btn small no-print" onclick={() => (showTable = !showTable)}>
						{showTable ? 'Show chart' : 'Show as table'}
					</button>
				</div>
				{#if report.totals.visits === 0}
					<p class="empty">No visits in this period.</p>
				{:else if showTable}
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th>{report.granularity === 'month' ? 'Month' : 'Date'}</th>
									<th class="num">Visits</th>
									<th class="num">Households</th>
								</tr>
							</thead>
							<tbody>
								{#each report.by_period.filter((p) => p.visits > 0) as p (p.period)}
									<tr>
										<td
											>{report.granularity === 'month'
												? formatMonth(p.period)
												: formatShortDate(p.period)}</td
										>
										<td class="num">{p.visits.toLocaleString()}</td>
										<td class="num">{p.households.toLocaleString()}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<BarChart
						data={chartData}
						valueLabel="visits"
						ariaLabel={`Visits per ${report.granularity}, ${formatDate(report.from)} to ${formatDate(report.to)}`}
					/>
				{/if}
			</section>

			<div class="grid-2">
				<section class="card">
					<h2 class="section-title">Who was served</h2>
					<div class="table-wrap">
						<table>
							<thead>
								<tr><th>Age group</th><th class="num">People</th><th class="num">Share</th></tr>
							</thead>
							<tbody>
								{#each demographics as row (row.label)}
									<tr>
										<td>{row.label}</td>
										<td class="num">{row.value.toLocaleString()}</td>
										<td class="num">{row.share}%</td>
									</tr>
								{/each}
								<tr class="total">
									<td>Total people (unduplicated)</td>
									<td class="num">{report.totals.individuals.toLocaleString()}</td>
									<td></td>
								</tr>
							</tbody>
						</table>
					</div>
					<p class="small muted note">
						Counted per visit (duplicated), that's {report.totals.individuals_duplicated.toLocaleString()}
						people served. {report.totals.income_eligible_households.toLocaleString()} households self-declared
						income eligibility.
					</p>
				</section>

				<section class="card">
					<h2 class="section-title">By program</h2>
					{#if report.by_program.length === 0}
						<p class="empty">No visits in this period.</p>
					{:else}
						<div class="table-wrap">
							<table>
								<thead>
									<tr>
										<th>Program</th>
										<th class="num">Visits</th>
										<th class="num">Households</th>
										<th class="num">People</th>
										<th class="num">Amount</th>
									</tr>
								</thead>
								<tbody>
									{#each report.by_program as p (p.program_id)}
										<tr>
											<td>{p.name}</td>
											<td class="num">{p.visits.toLocaleString()}</td>
											<td class="num">{p.households.toLocaleString()}</td>
											<td class="num">{p.individuals.toLocaleString()}</td>
											<td class="num"
												>{p.unit ? `${Math.round(p.quantity).toLocaleString()} ${p.unit}` : '—'}</td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</section>
			</div>

			<section class="card">
				<h2 class="section-title">By ZIP / postal code</h2>
				{#if report.by_zip.length === 0}
					<p class="empty">No visits in this period.</p>
				{:else}
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th>ZIP</th>
									<th class="num">Households</th>
									<th class="num">People</th>
									<th class="num">Visits</th>
								</tr>
							</thead>
							<tbody>
								{#each report.by_zip as z (z.zip)}
									<tr>
										<td>{z.zip}</td>
										<td class="num">{z.households.toLocaleString()}</td>
										<td class="num">{z.individuals.toLocaleString()}</td>
										<td class="num">{z.visits.toLocaleString()}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>

			<section class="card">
				<div class="card-header">
					<div>
						<h2>Visits over the limit</h2>
						<p>Households that came more often than a program allows, and why they were served.</p>
					</div>
				</div>
				{#if report.over_limit.length === 0}
					<p class="empty">None in this period.</p>
				{:else}
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Date</th>
									<th>Household</th>
									<th>Program</th>
									<th>Reason</th>
									<th>Recorded by</th>
								</tr>
							</thead>
							<tbody>
								{#each report.over_limit as row (row.visit_id)}
									<tr>
										<td>{formatDate(row.visit_date)}</td>
										<td>
											<a href={resolve('/households/[id]', { id: row.household_id })}
												>{row.household_name}</a
											>
											<span class="muted">#{row.household_number ?? '—'}</span>
										</td>
										<td>{row.program_name}</td>
										<td>{row.override_reason || '—'}</td>
										<td>{row.recorded_by || '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>
		</div>
	{:else if loading}
		<p class="empty">Calculating…</p>
	{/if}
</div>

<style>
	.filters {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		flex-wrap: wrap;
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: var(--space-3);
	}

	.report {
		transition: opacity 0.15s;
	}

	.report.loading {
		opacity: 0.55;
	}

	.section-title {
		margin-bottom: var(--space-4);
	}

	.note {
		margin-top: var(--space-3);
	}

	tr.total td {
		font-weight: 650;
	}
</style>
