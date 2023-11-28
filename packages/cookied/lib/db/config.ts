export type Identifiers = {
	// e.g. "cookied.users"
	users: string;
	// e.g. "cookied.sessions"
	sessions: string;
	// e.g. "cookied.sessions_view"
	sessions_view: string;
	// e.g. "cookied.new_session"
	new_session: string;
}

export type Config = {
	// Database identifiers for tables, views, and functions
	identifiers: Identifiers;
}
