<script lang="ts">
	import { resolve } from '$app/paths';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import {
		findPossibleDuplicates,
		fullName,
		householdLabel,
		householdSize,
		LIMITS,
		peopleCount,
		validateHousehold
	} from '#lib/shared/household.ts';
	import type { HouseholdInput } from '#lib/shared/types.ts';
	import Icon from './Icon.svelte';
	import Stepper from './Stepper.svelte';

	interface Props {
		initial: HouseholdInput;
		householdId?: string;
		saving?: boolean;
		onsave: (input: HouseholdInput, checkInNext: boolean) => void;
		oncancel: () => void;
	}

	let { initial, householdId, saving = false, onsave, oncancel }: Props = $props();

	// The form edits its own copy; `initial` only seeds it.
	// svelte-ignore state_referenced_locally
	let form = $state<HouseholdInput>({ ...initial });
	let problems = $state<string[]>([]);
	let submitted = $state(false);
	let checkInNext = false;

	const duplicates = $derived(
		form.first_name.trim() || form.last_name.trim() || form.phone.trim() || form.address.trim()
			? findPossibleDuplicates(pantry.households.values(), form, householdId)
			: []
	);

	const size = $derived(householdSize(form));

	$effect(() => {
		if (submitted) problems = validateHousehold(form);
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		submitted = true;
		problems = validateHousehold(form);
		if (problems.length > 0) return;
		onsave($state.snapshot(form), checkInNext);
	}
</script>

<form class="stack-lg" onsubmit={submit} novalidate>
	{#if duplicates.length > 0}
		<div class="notice warning" role="status">
			<Icon name="alert" />
			<div class="stack">
				<p>
					<strong>This might already be registered.</strong> Check before creating a second record:
				</p>
				<ul class="dupes">
					{#each duplicates as d (d.id)}
						<li>
							<a href={resolve('/households/[id]', { id: d.id })}>
								{fullName(d)}
								<span class="muted">· {householdLabel(d)}</span>
							</a>
							<span class="small muted">
								{[d.phone, d.address, d.zip].filter(Boolean).join(' · ')}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}

	<fieldset class="card">
		<legend class="sr-only">Name</legend>
		<h2 class="section">Who is the head of household?</h2>
		<div class="form-grid">
			<label class="field">
				<span>First name</span>
				<input
					type="text"
					autocomplete="off"
					autocapitalize="words"
					maxlength={LIMITS.name}
					bind:value={form.first_name}
				/>
			</label>
			<label class="field">
				<span>Last name</span>
				<input
					type="text"
					autocomplete="off"
					autocapitalize="words"
					maxlength={LIMITS.name}
					bind:value={form.last_name}
				/>
			</label>
			<label class="field">
				<span>Phone <span class="hint">(optional)</span></span>
				<input type="tel" autocomplete="off" maxlength={LIMITS.phone} bind:value={form.phone} />
			</label>
			<label class="field">
				<span>Email <span class="hint">(optional)</span></span>
				<input type="email" autocomplete="off" maxlength={LIMITS.email} bind:value={form.email} />
			</label>
		</div>
	</fieldset>

	<fieldset class="card">
		<legend class="sr-only">Household members</legend>
		<div class="section-row">
			<h2 class="section">How many people live in the household?</h2>
			<span class="badge primary">{peopleCount(size)}</span>
		</div>
		<p class="muted small">Include the person you're talking to.</p>
		<div class="members">
			<Stepper id="children" label="Children" hint="0–17" bind:value={form.children} />
			<Stepper id="adults" label="Adults" hint="18–64" bind:value={form.adults} />
			<Stepper id="seniors" label="Seniors" hint="65+" bind:value={form.seniors} />
		</div>
	</fieldset>

	<fieldset class="card">
		<legend class="sr-only">Address</legend>
		<h2 class="section">Where do they live? <span class="hint">(optional)</span></h2>
		<div class="form-grid">
			<label class="field span-all">
				<span>Street address</span>
				<input
					type="text"
					autocomplete="off"
					maxlength={LIMITS.address}
					bind:value={form.address}
				/>
			</label>
			<label class="field">
				<span>City</span>
				<input type="text" autocomplete="off" maxlength={LIMITS.city} bind:value={form.city} />
			</label>
			<label class="field">
				<span>State</span>
				<input type="text" autocomplete="off" maxlength={LIMITS.state} bind:value={form.state} />
			</label>
			<label class="field">
				<span>ZIP / postal code</span>
				<input
					type="text"
					inputmode="numeric"
					autocomplete="off"
					maxlength={LIMITS.zip}
					bind:value={form.zip}
				/>
			</label>
		</div>
	</fieldset>

	<fieldset class="card">
		<legend class="sr-only">Other details</legend>
		<h2 class="section">Anything else? <span class="hint">(optional)</span></h2>
		<div class="form-grid">
			<label class="field">
				<span>Preferred language</span>
				<input type="text" maxlength={LIMITS.language} bind:value={form.language} />
			</label>
			<label class="field">
				<span>Dietary needs or allergies</span>
				<input type="text" maxlength={LIMITS.dietary} bind:value={form.dietary} />
			</label>
			<label class="field span-all">
				<span>Notes for volunteers</span>
				<textarea maxlength={LIMITS.notes} bind:value={form.notes} rows="3"></textarea>
				<span class="hint"
					>Shown at check-in. Don't record anything the family wouldn't want shared.</span
				>
			</label>
			<label class="checkbox span-all">
				<input type="checkbox" bind:checked={form.income_eligible} />
				<span>
					<strong>Household says it meets the income guidelines</strong>
					<span class="hint">Self-declared eligibility, for programs such as TEFAP.</span>
				</span>
			</label>
			{#if householdId}
				<label class="checkbox span-all">
					<input
						type="checkbox"
						checked={form.status === 'inactive'}
						onchange={(e) => (form.status = e.currentTarget.checked ? 'inactive' : 'active')}
					/>
					<span>
						<strong>Inactive</strong>
						<span class="hint">Moved away or no longer coming. Hidden from the top of search.</span>
					</span>
				</label>
			{/if}
		</div>
	</fieldset>

	{#if problems.length > 0}
		<div class="notice danger" role="alert">
			<Icon name="alert-circle" />
			<ul class="problems">
				{#each problems as p (p)}<li>{p}</li>{/each}
			</ul>
		</div>
	{/if}

	<div class="form-actions">
		<button type="button" class="btn" onclick={oncancel}>Cancel</button>
		{#if !householdId && pantry.activePrograms.length > 0}
			<button type="submit" class="btn" disabled={saving} onclick={() => (checkInNext = false)}>
				Save only
			</button>
			<button
				type="submit"
				class="btn primary large"
				disabled={saving}
				onclick={() => (checkInNext = true)}
			>
				<Icon name="check" /> Save and check in
			</button>
		{:else}
			<button type="submit" class="btn primary large" disabled={saving}>
				<Icon name="check" />
				{householdId ? 'Save changes' : 'Save household'}
			</button>
		{/if}
	</div>
</form>

<style>
	.section {
		font-size: 1.05rem;
		margin-bottom: var(--space-4);
	}

	.section .hint {
		font-weight: 400;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.section-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.section-row .section {
		margin-bottom: var(--space-1);
	}

	.members {
		display: grid;
		gap: var(--space-4);
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		margin-top: var(--space-4);
	}

	.dupes {
		margin: 0;
		padding-left: 1.1rem;
		display: grid;
		gap: var(--space-1);
	}

	.dupes li {
		display: grid;
	}

	.problems {
		margin: 0;
		padding-left: 1.1rem;
	}

	.checkbox .hint {
		display: block;
		color: var(--text-muted);
		font-size: 0.88rem;
	}
</style>
