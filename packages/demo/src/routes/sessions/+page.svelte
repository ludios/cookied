<script lang="ts">
	import type { PageData } from "./$types";
	import { invalidateAll } from "$app/navigation";

	export let data: PageData;

	async function remove_session(id: number) {
		await fetch(`/api/sessions/${id}`, { method: "DELETE" });
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
			This lists all of the sessions on which you are logged in (username={data.session.username},
			id={data.session.user_id}).
		</p>

		<table border="1">
			<thead>
				<tr>
					<th scope="col"></th>
					<th scope="col">ID</th>
					<th scope="col">Time created</th>
					<th scope="col">User agent when created</th>
				</tr>
			</thead>
			<tbody>
				{#each data.my_sessions as { id, birth_time, user_agent_seen_first } (id)}
					<tr>
						<td>
							{#if id == data.session.id}
								Current&nbsp;session
							{:else}
								<button on:click={() => remove_session(id)}>Remove</button>
							{/if}
						</td>
						<td>{id}</td>
						<td>{birth_time}</td>
						<td>{user_agent_seen_first}</td>
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
</style>
