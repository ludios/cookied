#!/usr/bin/env node

// Reads a password from stdin and writes an argon2id hash to stdout

import { argon2id } from "hash-wasm";
import fs from "node:fs";

const STDIN_FILENO = 0;
const stdin_buffer = fs.readFileSync(STDIN_FILENO);
const password = stdin_buffer.toString();

const salt = new Uint8Array(16);
crypto.getRandomValues(salt);

// https://www.rfc-editor.org/rfc/rfc9106.html#section-4-6.2
const key = await argon2id({
	password: password,
	salt,
	parallelism: 4,
	iterations: 3,
	memorySize: 64 * 1024,
	hashLength: 32,
	outputType: "encoded",
});

console.log(key);
