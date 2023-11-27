<script lang="ts">
	import type { PageData } from "./$types";
	import { invalidateAll } from "$app/navigation";

	export let data: PageData;

	async function remove_session(id: number) {
		const obj = await (await fetch(`/api/sessions/${id}`, { method: "DELETE" })).json();
		if (!obj.success) {
			console.log(`DELETE /api/sessions/${id} returned`, obj);
		}
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>Sessions</title>
</svelte:head>

<div class="text-column">
	<h1>Sessions</h1>

	{#if !data.session}
		<p>You are logged out, so you have no user for which to show corresponding sessions.</p>
	{:else}
		<p>
			This lists all of the sessions through which you are logged in as your user.
		</p>

		<table border="1">
			<thead>
				<tr>
					<th scope="col"></th>
					<th scope="col">ID</th>
					<th scope="col">Creation time</th>
					<th scope="col">User agent when created</th>
				</tr>
			</thead>
			<tbody>
				{#each data.my_sessions as { id, birth_time, user_agent_seen_first } (id)}
					<tr>
						<td class="session_button">
							{#if id == data.session.id}
								Current session
							{:else}
								<button on:click={() => remove_session(id)}>Remove</button>
							{/if}
						</td>
						<td class="session_id">{id}</td>
						<td class="session_birth_time">{birth_time.toISOString()}</td>
						<td class="session_user_agent">{user_agent_seen_first}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	td > button {
		width: 100%;
	}

	td.session_button {
		white-space: nowrap;
	}

	td.session_id {
		text-align: right;
	}

	td.session_id,
	td.session_birth_time {
		font-variant-numeric: tabular-nums
	}
</style>
