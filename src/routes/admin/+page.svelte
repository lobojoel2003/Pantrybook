<script lang="ts">
	import { api, errorMessage } from '#lib/client/api.ts';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import { toast } from '#lib/client/toast.svelte.ts';
	import { OVERRIDE_POLICIES } from '#lib/shared/settings.ts';
	import type { Settings } from '#lib/shared/types.ts';

	let form = $state<Settings>({ ...pantry.settings });
	let saving = $state(false);
	let loaded = $state(false);

	$effect(() => {
		if (loaded) return;
		loaded = true;
		api
			.get<{ settings: Settings }>('/api/admin/settings')
			.then(({ settings }) => (form = { ...settings }))
			.catch(() => {
				// Offline: keep the cached copy.
			});
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		try {
			await api.put('/api/admin/settings', {
				...form,
				week_starts_on: Number(form.week_starts_on),
				recertify_months: Number(form.recertify_months)
			});
			toast.success('Settings saved.');
			await pantry.sync();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			saving = false;
		}
	}
</script>

<form class="stack-lg" onsubmit={save}>
	<section class="card">
		<h2 class="section-title">Organization</h2>
		<div class="form-grid">
			<label class="field span-all">
				<span>Name</span>
				<input type="text" required maxlength="120" bind:value={form.org_name} />
			</label>
			<label class="field">
				<span>Address <span class="hint">(printed on forms)</span></span>
				<input type="text" maxlength="300" bind:value={form.org_address} />
			</label>
			<label class="field">
				<span>Phone <span class="hint">(printed on forms)</span></span>
				<input type="text" maxlength="60" bind:value={form.org_phone} />
			</label>
		</div>
	</section>

	<section class="card">
		<h2 class="section-title">Check-in rules</h2>
		<div class="form-grid">
			<label class="field">
				<span>Who can check in a household that has reached its limit?</span>
				<select bind:value={form.override_policy}>
					{#each OVERRIDE_POLICIES as p (p.value)}<option value={p.value}>{p.label}</option>{/each}
				</select>
				<span class="hint">Over-limit visits always need a reason and appear on reports.</span>
			</label>
			<label class="field">
				<span>Weeks start on</span>
				<select bind:value={form.week_starts_on}>
					<option value={0}>Sunday</option>
					<option value={1}>Monday</option>
				</select>
				<span class="hint">Used by "per week" limits.</span>
			</label>
			<label class="field">
				<span>Ask volunteers to confirm household details every</span>
				<select bind:value={form.recertify_months}>
					<option value={0}>Never</option>
					<option value={3}>3 months</option>
					<option value={6}>6 months</option>
					<option value={12}>12 months</option>
					<option value={24}>24 months</option>
				</select>
				<span class="hint">Many food bank partners require yearly re-certification.</span>
			</label>
		</div>
	</section>

	<section class="card">
		<h2 class="section-title">Intake form</h2>
		<label class="field">
			<span>Statement above the signature line</span>
			<textarea rows="4" maxlength="2000" bind:value={form.intake_statement}></textarea>
		</label>
	</section>

	<div class="form-actions">
		<button type="submit" class="btn primary" disabled={saving || !pantry.reachable}>
			{saving ? 'Saving…' : 'Save settings'}
		</button>
	</div>
</form>

<style>
	.section-title {
		margin-bottom: var(--space-4);
	}
</style>
