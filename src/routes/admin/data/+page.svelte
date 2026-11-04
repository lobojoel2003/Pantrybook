<script lang="ts">
	import { api, download, errorMessage } from '#lib/client/api.ts';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import { toast } from '#lib/client/toast.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { BUILD, versionLabel } from '#lib/shared/build.ts';
	import { parseCSV, rowsToObjects, toCSV } from '#lib/shared/csv.ts';
	import { formatDate, formatTime, localISODate, today } from '#lib/shared/dates.ts';
	import { guessColumnMapping, IMPORT_FIELDS, mapImportRow } from '#lib/shared/household.ts';
	import type { ImportResult, ImportRow } from '#lib/shared/types.ts';

	type Field = (typeof IMPORT_FIELDS)[number]['field'];

	let fileName = $state('');
	let headers = $state<string[]>([]);
	let records = $state<Record<string, string>[]>([]);
	let mapping = $state<Partial<Record<Field, string>>>({});
	let skipDuplicates = $state(true);
	let importing = $state(false);
	let result = $state<ImportResult | null>(null);
	let parseError = $state('');

	let activity = $state<
		{ id: number; at: string; action: string; detail: string; user_name: string }[]
	>([]);

	$effect(() => {
		api
			.get<{ activity: typeof activity }>('/api/admin/activity')
			.then((r) => (activity = r.activity))
			.catch(() => {});
	});

	const rows = $derived<ImportRow[]>(records.map((r) => mapImportRow(r, mapping)));
	const valid = $derived(rows.filter((r) => r.first_name || r.last_name));
	const hasName = $derived(Boolean(mapping.first_name || mapping.last_name));

	async function onFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		result = null;
		parseError = '';
		if (!file) return;
		if (/\.xlsx?$/i.test(file.name)) {
			parseError =
				'That looks like an Excel file. In Excel choose File → Save As → "CSV UTF-8", then pick the .csv file here.';
			return;
		}
		try {
			const text = await file.text();
			const parsed = parseCSV(text);
			if (parsed.length < 2)
				throw new Error('The file needs a header row and at least one household.');
			fileName = file.name;
			headers = parsed[0].map((h) => h.trim()).filter(Boolean);
			records = rowsToObjects(parsed);
			mapping = guessColumnMapping(headers);
		} catch (err) {
			parseError = errorMessage(err);
			headers = [];
			records = [];
		}
	}

	const BATCH = 500;
	let progress = $state(0);

	async function runImport() {
		importing = true;
		progress = 0;
		const total: ImportResult = { imported: 0, skipped: 0, errors: [] };
		try {
			// Send every row (even nameless ones) so problems point at the right spreadsheet row.
			for (let start = 0; start < rows.length; start += BATCH) {
				const part = await api.post<ImportResult>('/api/admin/import', {
					rows: rows.slice(start, start + BATCH),
					skip_duplicates: skipDuplicates,
					row_offset: start + 2
				});
				total.imported += part.imported;
				total.skipped += part.skipped;
				total.errors.push(...part.errors);
				progress = Math.min(rows.length, start + BATCH);
			}
			toast.success(`Imported ${total.imported} households.`);
		} catch (err) {
			toast.error(
				total.imported
					? `Stopped after ${total.imported} households: ${errorMessage(err)}`
					: errorMessage(err)
			);
		} finally {
			result = total.imported || total.skipped || total.errors.length ? total : null;
			importing = false;
			await pantry.sync();
		}
	}

	function reset() {
		fileName = '';
		headers = [];
		records = [];
		mapping = {};
		result = null;
	}

	function downloadTemplate() {
		const csv = toCSV([
			IMPORT_FIELDS.filter((f) => f.field !== 'household_size').map((f) => f.label),
			[
				'Maria',
				'Garcia',
				'(555) 201-3344',
				'',
				'12 Oak St',
				'Riverton',
				'KY',
				'40121',
				2,
				2,
				0,
				'Spanish',
				'No pork',
				'',
				'yes'
			]
		]);
		const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = 'pantrybook-import-template.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	const range = $derived({ from: `${today().slice(0, 4)}-01-01`, to: today() });
</script>

<section class="card">
	<div class="card-header">
		<div>
			<h2>Import households from a spreadsheet</h2>
			<p>Moving from Excel or Google Sheets? Save your sheet as CSV and upload it here.</p>
		</div>
		<button type="button" class="btn small" onclick={downloadTemplate}>
			<Icon name="download" size={16} /> Template
		</button>
	</div>

	{#if result}
		<div class="notice success">
			<Icon name="check-circle" />
			<div class="stack">
				<p>
					<strong>{result.imported.toLocaleString()} households imported.</strong>
					{#if result.skipped}{result.skipped} skipped because they looked like duplicates.{/if}
				</p>
				{#if result.errors.length}
					<details>
						<summary>{result.errors.length} rows had problems</summary>
						<ul>
							{#each result.errors.slice(0, 50) as e (e.row)}<li>Row {e.row}: {e.error}</li>{/each}
						</ul>
					</details>
				{/if}
				<button type="button" class="btn small" onclick={reset}>Import another file</button>
			</div>
		</div>
	{:else if headers.length === 0}
		<label class="drop">
			<Icon name="upload" size={28} />
			<span><strong>Choose a CSV file</strong> or drop it here</span>
			<span class="small muted">One household per row, with column names in the first row.</span>
			<input type="file" accept=".csv,text/csv,.txt" onchange={onFile} />
		</label>
		{#if parseError}<p class="notice danger">
				<Icon name="alert-circle" /><span>{parseError}</span>
			</p>{/if}
	{:else}
		<div class="stack-lg">
			<p>
				<strong>{fileName}</strong>: {records.length.toLocaleString()} rows. Match your columns to Pantrybook's
				fields — we guessed where we could.
			</p>
			<div class="mapping">
				{#each IMPORT_FIELDS as f (f.field)}
					<label class="field">
						<span>{f.label}{f.required ? '' : ''}</span>
						<select bind:value={mapping[f.field]}>
							<option value={undefined}>— not in my file —</option>
							{#each headers as h (h)}<option value={h}>{h}</option>{/each}
						</select>
					</label>
				{/each}
			</div>

			{#if !hasName}
				<p class="notice warning">
					<Icon name="alert" /><span>Pick the column with first or last names to continue.</span>
				</p>
			{:else}
				<div>
					<h3>Preview</h3>
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th>First</th>
									<th>Last</th>
									<th>Phone</th>
									<th>Address</th>
									<th>ZIP</th>
									<th class="num">Ch.</th>
									<th class="num">Ad.</th>
									<th class="num">Sr.</th>
								</tr>
							</thead>
							<tbody>
								{#each rows.slice(0, 5) as r, i (i)}
									<tr>
										<td>{r.first_name}</td>
										<td>{r.last_name}</td>
										<td>{r.phone}</td>
										<td>{[r.address, r.city].filter(Boolean).join(', ')}</td>
										<td>{r.zip}</td>
										<td class="num">{r.children ?? 0}</td>
										<td class="num">{r.adults ?? (r.children || r.seniors ? 0 : 1)}</td>
										<td class="num">{r.seniors ?? 0}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
				<label class="checkbox">
					<input type="checkbox" bind:checked={skipDuplicates} />
					<span
						>Skip rows that match a household already in Pantrybook (same name, phone or address)</span
					>
				</label>
				<div class="form-actions">
					<button type="button" class="btn" onclick={reset}>Cancel</button>
					<button
						type="button"
						class="btn primary"
						disabled={importing || valid.length === 0 || !pantry.reachable}
						onclick={runImport}
					>
						{importing
							? `Importing… ${progress.toLocaleString()} of ${rows.length.toLocaleString()}`
							: `Import ${valid.length.toLocaleString()} households`}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</section>

<div class="grid-2">
	<section class="card">
		<h2 class="section-title">Export</h2>
		<div class="stack">
			<button type="button" class="btn" onclick={() => download('/api/export/households.csv')}>
				<Icon name="download" /> All households (CSV)
			</button>
			<button
				type="button"
				class="btn"
				onclick={() => download(`/api/reports/visits.csv?from=${range.from}&to=${range.to}`)}
			>
				<Icon name="download" /> This year's visits (CSV)
			</button>
			<p class="small muted">CSV files open in Excel, Numbers and Google Sheets.</p>
		</div>
	</section>

	<section class="card">
		<h2 class="section-title">Backup</h2>
		<div class="stack">
			<button type="button" class="btn primary" onclick={() => download('/api/admin/backup')}>
				<Icon name="database" /> Download full backup
			</button>
			<p class="small muted">
				A single file with everything in Pantrybook. Keep it somewhere safe and private — it
				contains families' personal information. To restore, stop Pantrybook and replace
				<span class="mono">pantrybook.db</span> in the data folder with this file.
			</p>
		</div>
	</section>
</div>

<section class="card">
	<h2 class="section-title">Recent admin activity</h2>
	{#if activity.length === 0}
		<p class="empty">Nothing yet.</p>
	{:else}
		<div class="table-wrap">
			<table>
				<thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
				<tbody>
					{#each activity.slice(0, 50) as a (a.id)}
						<tr>
							<td class="nowrap">{formatDate(localISODate(new Date(a.at)))} {formatTime(a.at)}</td>
							<td>{a.user_name || 'System'}</td>
							<td>{a.detail || a.action}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<p class="small faint">Pantrybook {versionLabel(BUILD)} · built {formatDate(BUILD.builtAt)}</p>

<style>
	.drop {
		position: relative;
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		padding: var(--space-6) var(--space-4);
		border: 2px dashed var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--surface-2);
		text-align: center;
		cursor: pointer;
	}

	.drop:hover,
	.drop:focus-within {
		border-color: var(--primary);
	}

	.drop input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.mapping {
		display: grid;
		gap: var(--space-3);
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	}

	.section-title {
		margin-bottom: var(--space-4);
	}

	.nowrap {
		white-space: nowrap;
	}

	h3 {
		margin-bottom: var(--space-2);
	}
</style>
