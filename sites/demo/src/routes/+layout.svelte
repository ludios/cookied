<script lang="ts">
	import type { LayoutServerData } from './$types';
	import Header from './Header.svelte';

	export let data: LayoutServerData;
</script>

<Header data={data} />

<main>
	<slot />
</main>
