<script lang="ts">
	import type { LayoutProps } from './$types';
	import Header from './Header.svelte';
	import './styles.css';

	let { data, children }: LayoutProps = $props();
</script>

<Header data={data} />

<main>
	{@render children?.()}
</main>
