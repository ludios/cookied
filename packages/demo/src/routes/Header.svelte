<script lang="ts">
	import { page } from '$app/stores';
    import type { LayoutServerData } from './$types';

    export let data: LayoutServerData;
</script>

<style>
	nav > div {
		padding: 3px;
		display: inline-block;
		background-color: var(--ui-background-secondary);
		border: 1px solid var(--ui-border);
	}
	nav > div[aria-current="page"] {
		font-weight: bold;
	}
</style>

<header>
	<nav>
		Session: {JSON.stringify(data.session)}
		{#if data.session}
			<form method="POST" action="/logout">
				<button>Log out</button>
			</form>
		{/if}

		<hr>

		<div aria-current={$page.url.pathname === "/" ? "page" : null}>
			<a href="/">Home</a>
		</div>
		<div aria-current={$page.url.pathname === "/about" ? "page" : null}>
			<a href="/about">About</a>
		</div>
	</nav>
</header>
