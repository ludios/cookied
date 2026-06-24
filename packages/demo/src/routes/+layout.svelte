<script lang="ts">
	import type { LayoutServerData } from './$types';
	import Header from './Header.svelte';
	import './styles.css';

	interface Props {
		data: LayoutServerData;
		children?: import('svelte').Snippet;
	}

	let { data, children }: Props = $props();
</script>

<Header data={data} />

<main>
	{@render children?.()}
</main>
