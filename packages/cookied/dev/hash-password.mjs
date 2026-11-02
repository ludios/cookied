#!/usr/bin/env node
// Model-output: Claude Opus 5.5

// Reads a password from stdin and writes its hash_password hash to stdout

import fs from "node:fs";
import { hash_password } from "../dist/lib/password.js";

const STDIN_FILENO = 0;
const stdin_buffer = fs.readFileSync(STDIN_FILENO);
const password = stdin_buffer.toString();

process.stdout.write(await hash_password(password));
