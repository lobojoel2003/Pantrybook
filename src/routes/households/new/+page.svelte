<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import { toast } from '#lib/client/toast.svelte.ts';
	import HouseholdForm from '#lib/components/HouseholdForm.svelte';
	import { today } from '#lib/shared/dates.ts';
	import { emptyHousehold, fullName } from '#lib/shared/household.ts';
	import type { HouseholdInput } from '#lib/shared/types.ts';

	let saving = $state(false);

	// Pre-fill the name typed into the check-in search box.
	const initial = $derived.by(() => {
		const base = emptyHousehold();
		const name = (page.url.searchParams.get('name') ?? '').trim();
		if (name) {
			const parts = name.split(/\s+/);
			if (parts.length === 1) base.last_name = parts[0];
			else {
				base.last_name = parts.pop() ?? '';
				base.first_name = parts.join(' ');
			}
		}
		return { ...base, verified_at: today() };
	});

	async function save(input: HouseholdInput, checkInNext: boolean) {
		saving = true;
		try {
			const household = await pantry.saveHousehold(input);
			toast.success(`${fullName(household)} registered.`);
			if (checkInNext) await goto(resolve(`/?h=${household.id}`), { replaceState: true });
			else await goto(resolve('/households/[id]', { id: household.id }), { replaceState: true });
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>New household · Pantrybook</title>
</svelte:head>

<div class="page narrow">
	<header class="page-header">
		<div>
			<h1>Register a household</h1>
			<p>Only a name and the number of people are required. You can add the rest later.</p>
		</div>
		<a class="btn ghost" href={resolve('/intake-form')}>Print a paper form</a>
	</header>
	<HouseholdForm {initial} {saving} onsave={save} oncancel={() => history.back()} />
</div>

<style>
	.narrow {
		max-width: 860px;
	}
</style>
