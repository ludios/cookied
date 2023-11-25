<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { onMount } from "svelte";
	import type { LayoutData } from "../$types";
	import type { ActionData } from "./$types";

	export let data: LayoutData;
	export let form: ActionData;

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
