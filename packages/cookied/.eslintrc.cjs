module.exports = {
	root: true,
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
	],
	rules: {
		// https://eslint.org/blog/2022/07/interesting-bugs-caught-by-no-constant-binary-expression/
		"no-constant-binary-expression": "error",
	},
	parser: "@typescript-eslint/parser",
	plugins: ["@typescript-eslint"],
	parserOptions: {
		sourceType: "module",
		ecmaVersion: 2020,
	},
	env: {
		browser: true,
		es2017: true,
		node: true
	},
};
