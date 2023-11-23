<script lang="ts">
	import type { LayoutServerData } from './$types';
	import Header from './Header.svelte';
	import './styles.css';

	export let data: LayoutServerData;
</script>

<Header data={data} />

<main>
	<slot />
</main>
