<script lang="ts">
	import { api, errorMessage } from '#lib/client/api.ts';
	import { pantry } from '#lib/client/pantry.svelte.ts';
	import { toast } from '#lib/client/toast.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import { formatRelative } from '#lib/shared/dates.ts';
	import type { PublicUser, Role } from '#lib/shared/types.ts';

	let users = $state<PublicUser[]>([]);
	let adding = $state(false);
	let editing = $state<PublicUser | null>(null);
	let error = $state('');
	let saving = $state(false);

	let newUser = $state({ display_name: '', username: '', role: 'volunteer' as Role, password: '' });
	let edit = $state({ display_name: '', role: 'volunteer' as Role, active: true, password: '' });

	async function load() {
		try {
			users = (await api.get<{ users: PublicUser[] }>('/api/admin/users')).users;
		} catch (err) {
			toast.error(errorMessage(err));
		}
	}

	$effect(() => {
		void load();
	});

	function suggestPassword(): string {
		const words = [
			'apple',
			'bean',
			'carrot',
			'maple',
			'river',
			'sunny',
			'tomato',
			'cedar',
			'harvest',
			'basket'
		];
		const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
		const n = (crypto.getRandomValues(new Uint32Array(1))[0] % 90) + 10;
		return `${pick()}-${pick()}-${n}`;
	}

	function startAdd() {
		error = '';
		newUser = { display_name: '', username: '', role: 'volunteer', password: suggestPassword() };
		adding = true;
	}

	function startEdit(user: PublicUser) {
		error = '';
		edit = { display_name: user.display_name, role: user.role, active: user.active, password: '' };
		editing = user;
	}

	async function create(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		error = '';
		try {
			await api.post('/api/admin/users', newUser);
			toast.success(
				`Account created. Share the username and password with ${newUser.display_name}.`,
				{
					timeout: 10_000
				}
			);
			adding = false;
			await load();
		} catch (err) {
			error = errorMessage(err);
		} finally {
			saving = false;
		}
	}

	async function update(event: SubmitEvent) {
		event.preventDefault();
		if (!editing) return;
		saving = true;
		error = '';
		try {
			await api.patch(`/api/admin/users/${editing.id}`, {
				display_name: edit.display_name,
				role: edit.role,
				active: edit.active,
				...(edit.password ? { password: edit.password } : {})
			});
			toast.success(edit.password ? 'Saved. The new password is ready to share.' : 'Saved.');
			editing = null;
			await load();
		} catch (err) {
			error = errorMessage(err);
		} finally {
			saving = false;
		}
	}
</script>

<section class="card">
	<div class="card-header">
		<div>
			<h2>People</h2>
			<p>
				Give each volunteer their own account. Coordinators can change settings and see everything.
			</p>
		</div>
		<button type="button" class="btn primary" onclick={startAdd} disabled={!pantry.reachable}>
			<Icon name="plus" /> Add person
		</button>
	</div>
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Name</th>
					<th>Username</th>
					<th>Role</th>
					<th>Last sign-in</th>
					<th><span class="sr-only">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each users as u (u.id)}
					<tr>
						<td>
							<strong>{u.display_name}</strong>
							{#if u.id === pantry.me?.id}<span class="badge">You</span>{/if}
							{#if !u.active}<span class="badge">Turned off</span>{/if}
						</td>
						<td class="mono">{u.username}</td>
						<td>{u.role === 'admin' ? 'Coordinator' : 'Volunteer'}</td>
						<td>{formatRelative(u.last_login_at)}</td>
						<td class="num">
							<button
								type="button"
								class="btn small"
								onclick={() => startEdit(u)}
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
</section>

<Modal open={adding} title="Add a person" onclose={() => (adding = false)}>
	<form id="add-user" class="stack" onsubmit={create}>
		<label class="field">
			<span>Name</span>
			<input type="text" required maxlength="80" bind:value={newUser.display_name} />
		</label>
		<label class="field">
			<span>Username</span>
			<input
				type="text"
				required
				minlength="2"
				maxlength="40"
				autocapitalize="none"
				spellcheck="false"
				pattern="[A-Za-z0-9._\-]+"
				bind:value={newUser.username}
			/>
		</label>
		<label class="field">
			<span>Role</span>
			<select bind:value={newUser.role}>
				<option value="volunteer">Volunteer — check-ins, households, reports</option>
				<option value="admin">Coordinator — everything, including settings and backups</option>
			</select>
		</label>
		<label class="field">
			<span>Password</span>
			<input type="text" required minlength="8" autocomplete="off" bind:value={newUser.password} />
			<span class="hint">Write it down for them. They can change it under Account.</span>
		</label>
		{#if error}<p class="notice danger"><Icon name="alert-circle" /><span>{error}</span></p>{/if}
	</form>
	{#snippet actions()}
		<button type="button" class="btn" onclick={() => (adding = false)}>Cancel</button>
		<button type="submit" form="add-user" class="btn primary" disabled={saving}
			>Create account</button
		>
	{/snippet}
</Modal>

<Modal
	open={editing !== null}
	title={`Edit ${editing?.display_name ?? ''}`}
	onclose={() => (editing = null)}
>
	<form id="edit-user" class="stack" onsubmit={update}>
		<label class="field">
			<span>Name</span>
			<input type="text" required maxlength="80" bind:value={edit.display_name} />
		</label>
		<label class="field">
			<span>Role</span>
			<select bind:value={edit.role}>
				<option value="volunteer">Volunteer</option>
				<option value="admin">Coordinator</option>
			</select>
		</label>
		<label class="checkbox">
			<input type="checkbox" bind:checked={edit.active} />
			<span
				>Account is active <span class="hint">(turn off when someone stops volunteering)</span
				></span
			>
		</label>
		<div class="field">
			<label for="reset-password"><span class="label">Reset password</span></label>
			<div class="row">
				<input
					id="reset-password"
					type="text"
					minlength="8"
					autocomplete="off"
					placeholder="Leave blank to keep the current password"
					bind:value={edit.password}
				/>
				<button type="button" class="btn small" onclick={() => (edit.password = suggestPassword())}>
					Suggest
				</button>
			</div>
			<span class="hint">Resetting signs them out on every device.</span>
		</div>
		{#if error}<p class="notice danger"><Icon name="alert-circle" /><span>{error}</span></p>{/if}
	</form>
	{#snippet actions()}
		<button type="button" class="btn" onclick={() => (editing = null)}>Cancel</button>
		<button type="submit" form="edit-user" class="btn primary" disabled={saving}>Save</button>
	{/snippet}
</Modal>

<style>
	.row input {
		flex: 1 1 200px;
	}

	td .badge {
		margin-left: var(--space-2);
	}
</style>
