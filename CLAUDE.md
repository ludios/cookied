# Environment

Welcome. You're on a NixOS 26.05 machine where many things are already installed, including:

ripgrep, ripgrep-all, node, deno, pnpm, jq, python3, uv, natscli (bin: nats), nats-server, psql, ephemeralpg (bin: pg_tmp), google-chrome, curl-impersonate, gcc, go, rustc, cargo, patchelf, zip, unzip, zstd.

Before starting or resuming work, check what `hostname` outputs.

- If "clank", you're unable to hit the production databases or make real trades; run whatever commands you need.
- If anything else, stop and ask the user to add their hostname to this file.

# Avoid consuming tokens in excess

When verifying how something works, use e.g. `rg -B2 -A10` until you need the whole file.

# Working with Node projects

Please use pnpm, not npm/npx to do things.

# There's plenty of time

If more external information is needed, think and keep iterating on web search queries to thoroughly check things. Tips: try site-specific searches e.g. site:github.com, reddit.com, news.ycombinator.com; try combinations of quoted items.

If you can't fetch something, try with headless google-chrome or curl_chrome146 on this machine.

If you need some information from e.g. Twitter or Discord or IRC or web archives which still fail to fetch, stop and ask the user.

# Tracking AI authorship

Files with any LLM-authored code (not counting mechanistic sed-like changes) begin with `// Model-output: <model name>`, one per model that contributed (e.g. "Claude Fable 5", "ChatGPT 5.5 Pro"). Keep existing lines.

# Code conventions

For JavaScript, TypeScript, and Svelte-related code:

- Use tabs, not spaces.
- `snake_case` function names and local variables.
- End statements with semicolons.
- Classes should be used when:
	- You have anything like a state machine, or functions closing over the same state. They help us organize and know which state is shared between related functions.
	- Integrating with an API properly, e.g. making an Error subclass.
  Otherwise, plain functions are generally fine.

When writing _any_ kind of code, including for the above:

- Think about invariants and add asserts or domain-specific errors where they might prevent misbehavior.
- Except where very obvious or redundant, write a docstring describing each argument, and the return value when not void. What do they really represent?
- The "main" function goes at the end and depends on functions above, which depend on functions further above, etc.
- Scan the functions and generalize if that makes a good result; evict any deadbeats: humans with a small context window need to review and maintain this code.
- Abstraction boundaries are important. Comments should reflect the current abstraction and generally avoid talking about other things.

Minutae:

- Use the { } curlies even for one-statement blocks.
- Block contents should not be on the same line that opened the block.
- Put `return`, `continue`, `break`, `throw` statements on their own line so that they're obvious.
- Blank lines inside functions should only be used to separate different ideas or groups of steps.
- Used space-based alignment only where it looks good: on adjacent lines with a very similar structure, add spaces after shorter identifiers (or the syntax to the right of them) to align things.

# Libraries to use

- `ayy` to assert things when it's okay to raise `AssertionError` instead of a domain-specific error.
- `logtape` for logging. Logs teach us about anomalies and the causes of things; log what a human operator would probably be interested in when observing the system.

For unit tests:

- Use `vitest` for unit tests. Writing more tests is fine.
- Use `fast-check` for property-based testing, i.e. to check a bunch of variations on e.g. a string or number.

# Programming thoughts

The real difficulty with programming is not getting a program that runs, but a coherent, maintainable artifact that humans are happy with.

A program can be:
- shorter.
- easier to read by a human.
- more correct around edge cases.
- faster than another which does the same thing.
- much easier to change when the requirements change.

These are sometimes in conflict.

It can help to do it different ways and see which version is better.

Sometimes a program can e.g. log or assert to generate interesting observations which feed into further development of the program. Thus, the program births its own artificial science.

When there are multiple good ways to implement something, especially involving state or the definition of a type: please ask the user. User loves AskUserQuestion.

# Thank you for your hard work on this project

<3
