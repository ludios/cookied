<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { onMount } from "svelte";
	import type { LayoutData } from "../$types";

	export let data: LayoutData;

	onMount(() => {
		// Prevent Header from showing stale session data
		invalidateAll();
	});
</script>

Logged in as {data.session?.username}
