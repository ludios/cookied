<script lang="ts">
	import { refreshAll } from "$app/navigation";
	import { onMount } from "svelte";

	onMount(() => {
		// Prevent Header from showing stale session data
		refreshAll();
	});
</script>

Logged out
