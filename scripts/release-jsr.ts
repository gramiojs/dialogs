import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Stamp the current package.json version into the JSR manifest (`deno.json`)
 * right before `jsr publish`, so the npm and JSR versions never drift.
 */
const version = execSync("npm pkg get version").toString().replace(/"|\n/gi, "");

const jsrConfig = JSON.parse(String(readFileSync("deno.json")));

jsrConfig.version = version;

writeFileSync("deno.json", `${JSON.stringify(jsrConfig, null, "\t")}\n`);

console.log(`Prepared deno.json for JSR release (v${version}).`);
