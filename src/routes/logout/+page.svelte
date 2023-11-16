<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { onMount } from "svelte";

	onMount(() => {
		// Prevent Header from showing stale session data
		invalidateAll();
	});
</script>

Logged out
