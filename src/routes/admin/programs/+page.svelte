<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import { toast } from '#lib/client/toast.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import { describeLimit, LIMIT_PERIODS } from '#lib/shared/limits.ts';
	import type { LimitPeriod, Program, ProgramInput } from '#lib/shared/types.ts';

	interface Draft {
		name: string;
		unit: string;
		default_quantity: number | null;
		limited: boolean;
		limit_count: number | null;
		limit_period: LimitPeriod;
		limit_days: number | null;
		active: boolean;
		sort_order: number;
	}

	let programs = $state<Program[]>([]);
	let editing = $state<Program | 'new' | null>(null);
	let draft = $state<Draft>(blank());
	let saving = $state(false);
	let error = $state('');

	const welcome = $derived(page.url.searchParams.has('welcome'));

	function blank(): Draft {
		return {
			name: '',
			unit: 'lbs',
			default_quantity: null,
			limited: true,
			limit_count: 4,
			limit_period: 'month',
			limit_days: 30,
			active: true,
			sort_order: (programs.length + 1) * 10
		};
	}

	async function load() {
		try {
			const res = await api.get<{ programs: Program[] }>('/api/admin/programs');
			programs = res.programs;
		} catch {
			programs = [...pantry.programs].sort((a, b) => a.sort_order - b.sort_order);
		}
	}

	$effect(() => {
		void load();
	});

	function open(program: Program | 'new') {
		error = '';
		editing = program;
		if (program === 'new') {
			draft = blank();
		} else {
			draft = {
				name: program.name,
				unit: program.unit,
				default_quantity: program.default_quantity,
				limited: program.limit_count !== null,
				limit_count: program.limit_count ?? 4,
				limit_period: program.limit_period ?? 'month',
				limit_days: program.limit_days ?? 30,
				active: program.active,
				sort_order: program.sort_order
			};
		}
	}

	function toInput(d: Draft): ProgramInput {
		const whole = (n: number | null) => Math.max(1, Math.trunc(Number(n) || 1));
		const qty = d.default_quantity === null ? NaN : Number(d.default_quantity);
		return {
			name: d.name.trim(),
			unit: d.unit.trim(),
			default_quantity: d.unit.trim() && Number.isFinite(qty) && qty >= 0 ? qty : null,
			limit_count: d.limited ? whole(d.limit_count) : null,
			limit_period: d.limited ? d.limit_period : null,
			limit_days: d.limited && d.limit_period === 'rolling' ? whole(d.limit_days) : null,
			active: d.active,
			sort_order: Number(d.sort_order) || 0
		};
	}

	const preview = $derived(describeLimit(toInput(draft)));

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!editing) return;
		saving = true;
		error = '';
		try {
			const body = toInput(draft);
			if (editing === 'new') await api.post('/api/admin/programs', body);
			else await api.put(`/api/admin/programs/${editing.id}`, body);
			toast.success(`Saved ${body.name}.`);
			editing = null;
			await load();
			await pantry.sync();
		} catch (err) {
			error = errorMessage(err);
		} finally {
			saving = false;
		}
	}
</script>

{#if welcome}
	<div class="notice success">
		<Icon name="check-circle" />
		<div class="stack">
			<p>
				<strong>Your pantry is set up.</strong> We added a <em>Food Pantry</em> program allowing 4 visits
				per month. Change it to match your rules, or add programs like a baby closet or clothing bank.
			</p>
			<p>
				Next: <a href={resolve('/admin/users')}>add volunteer accounts</a>,
				<a href={resolve('/admin/data')}>import households from a spreadsheet</a>, or go straight to
				<a href={resolve('/')}>checking people in</a>.
			</p>
		</div>
	</div>
{/if}

<section class="card">
	<div class="card-header">
		<div>
			<h2>Programs</h2>
			<p>What you hand out, and how often each household may come.</p>
		</div>
		<button
			type="button"
			class="btn primary"
			onclick={() => open('new')}
			disabled={!pantry.reachable}
		>
			<Icon name="plus" /> Add program
		</button>
	</div>

	{#if programs.length === 0}
		<p class="empty">No programs yet. Add one to start checking people in.</p>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Program</th>
						<th>Limit</th>
						<th>Measured in</th>
						<th>Status</th>
						<th><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each programs as p (p.id)}
						<tr>
							<td><strong>{p.name}</strong></td>
							<td>{describeLimit(p)}</td>
							<td
								>{p.unit || '—'}{p.default_quantity !== null
									? ` (default ${p.default_quantity})`
									: ''}</td
							>
							<td>
								{#if p.active}<span class="badge success">Active</span>{:else}<span class="badge"
										>Off</span
									>{/if}
							</td>
							<td class="num">
								<button
									type="button"
									class="btn small"
									onclick={() => open(p)}
									disabled={!pantry.reachable}
								>
									<Icon name="edit" size={16} /> Edit
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<Modal
	open={editing !== null}
	title={editing === 'new' ? 'Add a program' : 'Edit program'}
	onclose={() => (editing = null)}
>
	<form id="program-form" class="stack" onsubmit={save}>
		<label class="field">
			<span>Name</span>
			<input
				type="text"
				required
				maxlength="80"
				placeholder="Food Pantry"
				bind:value={draft.name}
			/>
		</label>
		<div class="form-grid">
			<label class="field">
				<span>Measure each visit in</span>
				<input type="text" maxlength="20" placeholder="lbs, items, bags" bind:value={draft.unit} />
				<span class="hint">Leave empty if you don't count amounts.</span>
			</label>
			<label class="field">
				<span>Usual amount <span class="hint">(optional)</span></span>
				<input
					type="number"
					min="0"
					step="any"
					disabled={!draft.unit.trim()}
					bind:value={draft.default_quantity}
				/>
			</label>
		</div>

		<fieldset class="stack">
			<legend>Visit limit</legend>
			<label class="checkbox">
				<input type="checkbox" bind:checked={draft.limited} />
				<span>Limit how often a household can visit</span>
			</label>
			{#if draft.limited}
				<div class="limit">
					<label class="field">
						<span class="sr-only">Number of visits</span>
						<input type="number" min="1" max="1000" required bind:value={draft.limit_count} />
					</label>
					<span>visit(s)</span>
					<label class="field">
						<span class="sr-only">Period</span>
						<select bind:value={draft.limit_period}>
							{#each LIMIT_PERIODS as p (p.value)}<option value={p.value}>{p.label}</option>{/each}
						</select>
					</label>
					{#if draft.limit_period === 'rolling'}
						<label class="field days">
							<span class="sr-only">Days</span>
							<input type="number" min="1" max="366" required bind:value={draft.limit_days} />
						</label>
						<span>days</span>
					{/if}
				</div>
			{/if}
			<p class="small muted">Volunteers will see: <strong>{preview}</strong></p>
		</fieldset>

		<div class="form-grid">
			<label class="checkbox">
				<input type="checkbox" bind:checked={draft.active} />
				<span>Active (shown at check-in)</span>
			</label>
			<label class="field">
				<span>Order</span>
				<input type="number" min="0" max="10000" bind:value={draft.sort_order} />
				<span class="hint">Lower numbers appear first.</span>
			</label>
		</div>

		{#if error}<p class="notice danger"><Icon name="alert-circle" /><span>{error}</span></p>{/if}
	</form>
	{#snippet actions()}
		<button type="button" class="btn" onclick={() => (editing = null)}>Cancel</button>
		<button type="submit" form="program-form" class="btn primary" disabled={saving}>
			{saving ? 'Saving…' : 'Save program'}
		</button>
	{/snippet}
</Modal>

<style>
	.limit {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.limit input[type='number'] {
		width: 90px;
	}

	.limit .days input {
		width: 100px;
	}
</style>
