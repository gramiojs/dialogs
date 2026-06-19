import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { EOL } from "node:os";

/**
 * Collect commit subjects/bodies since the previous tag and expose them — plus
 * the current package version — as GitHub Actions step outputs (`changelog`,
 * `version`) for the publish workflow's GitHub Release step.
 */
function getLatestTag(): string {
	try {
		// Silence git's "fatal: No names found" stderr — the no-tags case is expected.
		return execSync("git describe --abbrev=0 --tags", {
			stdio: ["pipe", "pipe", "ignore"],
		})
			.toString()
			.trim();
	} catch {
		// No tags yet → diff from the repository's first commit.
		console.warn("No git tags found; changelog spans from the first commit.");
		return execSync("git rev-list --max-parents=0 HEAD").toString().trim();
	}
}

const commits = execSync(`git log ${getLatestTag()}..HEAD --pretty="format:%s%b"`)
	.toString()
	.trim()
	.split("\n")
	.reverse();

const version = execSync("npm pkg get version").toString().replace(/"/gi, "").trim();

const delimiter = `---${randomUUID()}---${EOL}`;

if (process.env.GITHUB_OUTPUT)
	appendFileSync(
		process.env.GITHUB_OUTPUT,
		`changelog<<${delimiter}${commits.join(
			EOL.repeat(2),
		)}${EOL}${delimiter}version=${version}${EOL}`,
	);
else console.log({ version, commits });
