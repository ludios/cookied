<svelte:head>
	<title>cookied demo site</title>
</svelte:head>

<h1>cookied demo site</h1>

<form method="POST" action="/login">
	<div class="container">
		<label>
			<span>Username</span><br>
			<input id="username" name="username" type="text" autocomplete="username">
		</label>
        <br>

		<label>
			<span>Password</span><br>
			<input id="password" name="password" type="password" autocomplete="current-password">
		</label>
	</div>
	<button>Log in</button>
</form>
