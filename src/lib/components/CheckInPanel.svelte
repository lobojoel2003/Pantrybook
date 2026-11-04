<script lang="ts">
	import { resolve } from '$app/paths';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import { toast } from '#lib/client/toast.svelte.ts';
	import { formatDate, formatTime, isISODate, monthsBetween, today } from '#lib/shared/dates.ts';
	import {
		formatPhone,
		fullName,
		householdLabel,
		householdSize,
		memberBreakdown,
		peopleCount
	} from '#lib/shared/household.ts';
	import { describeLimit } from '#lib/shared/limits.ts';
	import type { Household, Program, Visit } from '#lib/shared/types.ts';
	import Icon from './Icon.svelte';

	interface Props {
		household: Household;
		/** Called after a successful check-in. */
		ondone?: (visit: Visit) => void;
		/** Show the name header (off when the page already shows it). */
		showHeader?: boolean;
	}

	let { household, ondone, showHeader = true }: Props = $props();

	let date = $state(today());
	let pastVisit = $state(false);
	let notes = $state('');
	let quantities = $state<Record<string, string>>({});
	let overriding = $state<string | null>(null);
	let reason = $state('');
	let busy = $state<string | null>(null);

	const programs = $derived(pantry.activePrograms);
	// An emptied date field falls back to today rather than breaking the limit checks.
	const visitDate = $derived(isISODate(date) && date <= today() ? date : today());
	const size = $derived(householdSize(household));
	const visitsToday = $derived(
		pantry.householdVisits(household.id).filter((v) => v.visit_date === visitDate && !v.voided)
	);
	const lastVisit = $derived(pantry.householdVisits(household.id).find((v) => !v.voided));

	const recertifyDue = $derived.by(() => {
		const months = pantry.settings.recertify_months;
		if (!months) return false;
		const verified = household.verified_at || household.created_at.slice(0, 10);
		return monthsBetween(verified, today()) >= months;
	});

	function quantityFor(program: Program): number | null {
		if (!program.unit) return null;
		const raw = quantities[program.id] ?? program.default_quantity?.toString() ?? '';
		if (raw.trim() === '') return null;
		const n = Number(raw);
		return Number.isFinite(n) && n >= 0 ? n : null;
	}

	async function checkIn(program: Program) {
		const eligibility = pantry.eligibility(household.id, program, visitDate);
		if (!eligibility.allowed) {
			if (!pantry.canOverride()) return;
			if (overriding !== program.id) {
				overriding = program.id;
				reason = '';
				return;
			}
			if (!reason.trim()) {
				toast.warning('Add a short reason for going over the limit.');
				return;
			}
		}
		busy = program.id;
		try {
			const visit = await pantry.checkIn({
				household,
				program,
				quantity: quantityFor(program),
				notes,
				override_reason: reason,
				date: visitDate
			});
			overriding = null;
			reason = '';
			notes = '';
			toast.success(`${fullName(household)} checked in for ${program.name}.`, {
				action: {
					label: 'Undo',
					run: () => {
						void pantry.voidVisit(visit, 'Undone right after check-in');
						toast.info('Check-in undone.');
					}
				}
			});
			ondone?.(visit);
		} catch (err) {
			console.error(err);
			toast.error('Could not save the check-in on this device.');
		} finally {
			busy = null;
		}
	}
</script>

<section class="panel" aria-label={`Check in ${fullName(household)}`}>
	{#if showHeader}
		<header class="who">
			<div class="name-row">
				<h2>{fullName(household)}</h2>
				<span class="badge">{householdLabel(household)}</span>
				{#if household.status === 'inactive'}<span class="badge warning">Inactive</span>{/if}
				{#if pantry.isPending(household.id)}<span class="badge info">Not synced yet</span>{/if}
			</div>
			<p class="facts">
				<span
					><Icon name="users" size={16} />
					{peopleCount(size)}
					<span class="muted">({memberBreakdown(household)})</span>
				</span>
				{#if household.phone}<span
						><Icon name="phone" size={16} /> {formatPhone(household.phone)}</span
					>{/if}
				{#if household.address || household.city}
					<span
						><Icon name="pin" size={16} />
						{[household.address, household.city, household.zip].filter(Boolean).join(', ')}</span
					>
				{/if}
			</p>
			<p class="small muted">
				Last visit: {lastVisit ? formatDate(lastVisit.visit_date) : 'first visit'}
				{#if lastVisit}· {pantry.program(lastVisit.program_id)?.name ?? ''}{/if}
			</p>
		</header>
	{/if}

	{#if household.notes || household.dietary}
		<div class="notice info">
			<Icon name="info" />
			<div>
				{#if household.dietary}<p><strong>Dietary:</strong> {household.dietary}</p>{/if}
				{#if household.notes}<p class="pre">{household.notes}</p>{/if}
			</div>
		</div>
	{/if}

	{#if recertifyDue}
		<div class="notice warning">
			<Icon name="calendar" />
			<div class="stack">
				<p>
					<strong>Please confirm their details.</strong>
					{household.verified_at
						? `Last confirmed ${formatDate(household.verified_at)}.`
						: 'Not confirmed since they registered.'}
					Ask if the address and household size are still right.
				</p>
				<div class="row">
					<button
						type="button"
						class="btn small"
						onclick={async () => {
							await pantry.verifyHousehold(household.id);
							toast.success('Details marked as confirmed today.');
						}}><Icon name="check" size={16} /> Details are still right</button
					>
					<a class="btn small ghost" href={resolve('/households/[id]/edit', { id: household.id })}
						><Icon name="edit" size={16} /> Update details</a
					>
				</div>
			</div>
		</div>
	{/if}

	{#if visitsToday.length > 0}
		<div class="notice success">
			<Icon name="check-circle" />
			<p>
				Already checked in {visitDate === today() ? 'today' : `on ${formatDate(visitDate)}`}:
				{visitsToday
					.map(
						(v) =>
							`${pantry.program(v.program_id)?.name ?? 'program'} at ${formatTime(v.visited_at)}`
					)
					.join(', ')}
			</p>
		</div>
	{/if}

	{#if programs.length === 0}
		<div class="notice warning">
			<Icon name="alert" />
			<p>
				No programs are set up yet.
				{#if pantry.me?.role === 'admin'}<a href={resolve('/admin/programs')}>Add a program</a> to start
					checking people in.{:else}Ask a coordinator to add one.{/if}
			</p>
		</div>
	{/if}

	<div class="programs">
		{#each programs as program (program.id)}
			{@const e = pantry.eligibility(household.id, program, visitDate)}
			<div class="program" class:blocked={!e.allowed}>
				<div class="program-head">
					<div>
						<h3>{program.name}</h3>
						<p class="small muted">{describeLimit(program)}</p>
					</div>
					{#if !e.limited}
						<span class="badge success"><Icon name="check" size={14} /> Eligible</span>
					{:else if e.allowed}
						<span class="badge success"><Icon name="check" size={14} /> {e.summary}</span>
					{:else}
						<span class="badge danger"><Icon name="alert-circle" size={14} /> Limit reached</span>
					{/if}
				</div>

				{#if !e.allowed}
					<p class="limit-text">
						Used {e.summary}. Next eligible <strong>{formatDate(e.nextEligible)}</strong>.
					</p>
				{/if}

				<div class="program-actions">
					{#if program.unit}
						<label class="qty">
							<span class="sr-only">Amount for {program.name} ({program.unit})</span>
							<input
								type="number"
								inputmode="decimal"
								min="0"
								step="any"
								placeholder="0"
								value={quantities[program.id] ?? program.default_quantity ?? ''}
								oninput={(ev) => (quantities[program.id] = ev.currentTarget.value)}
							/>
							<span class="unit">{program.unit}</span>
						</label>
					{/if}

					{#if e.allowed}
						<button
							type="button"
							class="btn primary large grow"
							disabled={busy !== null}
							onclick={() => checkIn(program)}
						>
							<Icon name="check" /> Check in
						</button>
					{:else if pantry.canOverride()}
						<button
							type="button"
							class="btn warning large grow"
							disabled={busy !== null}
							onclick={() => checkIn(program)}
						>
							{overriding === program.id ? 'Confirm check-in' : 'Check in anyway…'}
						</button>
					{:else}
						<button type="button" class="btn large grow" disabled>Not eligible yet</button>
					{/if}
				</div>

				{#if overriding === program.id}
					<label class="field override">
						<span>Why are you going over the limit?</span>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							type="text"
							maxlength="200"
							placeholder="For example: emergency, coordinator approved"
							bind:value={reason}
							autofocus
							onkeydown={(ev) => {
								if (ev.key === 'Enter') void checkIn(program);
							}}
						/>
						<span class="hint">The visit will be flagged on the over-limit report.</span>
					</label>
				{/if}
			</div>
		{/each}
	</div>

	{#if programs.length > 0}
		<details class="extras">
			<summary>Add a note or record a past visit</summary>
			<div class="form-grid">
				<label class="field">
					<span>Note for this visit <span class="hint">(optional)</span></span>
					<input type="text" maxlength="300" bind:value={notes} />
				</label>
				<div class="field">
					<label class="checkbox">
						<input
							type="checkbox"
							bind:checked={pastVisit}
							onchange={() => {
								if (!pastVisit) date = today();
							}}
						/>
						<span
							>Entering a visit from an earlier day (for example, from a paper sign-in sheet)</span
						>
					</label>
					{#if pastVisit}
						<input type="date" max={today()} bind:value={date} aria-label="Visit date" />
					{/if}
				</div>
			</div>
		</details>
	{/if}
</section>

<style>
	.panel {
		display: grid;
		gap: var(--space-4);
	}

	.who {
		display: grid;
		gap: var(--space-2);
	}

	.name-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.name-row h2 {
		font-size: 1.5rem;
		margin-right: var(--space-1);
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}

	.facts > span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.pre {
		white-space: pre-line;
	}

	.programs {
		display: grid;
		gap: var(--space-3);
	}

	.program {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}

	.program.blocked {
		border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
		background: color-mix(in srgb, var(--danger-soft) 40%, var(--surface));
	}

	.program-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.limit-text {
		color: var(--danger);
		font-weight: 550;
	}

	.program-actions {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.grow {
		flex: 1 1 200px;
	}

	.qty {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 0 1 170px;
	}

	.qty input {
		min-height: 56px;
		font-size: 1.1rem;
		font-weight: 600;
		text-align: right;
	}

	.unit {
		color: var(--text-muted);
		font-weight: 600;
	}

	.override input {
		border-color: var(--warning-border);
	}

	.extras summary {
		cursor: pointer;
		color: var(--text-muted);
		font-weight: 600;
		min-height: var(--tap);
		display: flex;
		align-items: center;
	}

	.extras .form-grid {
		margin-top: var(--space-2);
	}
</style>
