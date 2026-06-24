<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { onMount } from "svelte";
	import type { PageProps } from "./$types";

	let { data, form }: PageProps = $props();

	onMount(() => {
		// Prevent Header from showing stale session data
		invalidateAll();
	});
</script>

{#if form?.success}
	Logged in as {data.session?.username}
{:else}
	Login error: {form?.error || "no form data"}
{/if}
