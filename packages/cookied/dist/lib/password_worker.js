// Model-output: Claude Opus 5.5
// The worker thread that password.ts's PasswordChecker starts. It checks a password against an
// argon2 PHC string, one check at a time, so that a check's ~100 ms of synchronous WebAssembly
// doesn't stall the thread that asked for it.
import { parentPort } from "node:worker_threads";
import { A } from "ayy";
import { argon2Verify } from "hash-wasm";
A(parentPort, "password_worker.ts must run as a worker thread");
const port = parentPort;
port.on("message", async ({ password, hash }) => {
    let reply;
    try {
        reply = { matches: await argon2Verify({ password, hash }) };
    }
    catch (e) {
        reply = { error: e instanceof Error ? e.message : String(e) };
    }
    port.postMessage(reply);
});
//# sourceMappingURL=password_worker.js.map