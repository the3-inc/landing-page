import { execFileSync } from "node:child_process";

export function verifyRelease(tag, cwd = process.cwd()) {
	if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? "")) {
		throw new Error(
			"Release tag must be vMAJOR.MINOR.PATCH, for example v1.2.3",
		);
	}
	const git = (...args) =>
		execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	const sha = git("rev-parse", "--verify", `refs/tags/${tag}^{commit}`);
	git("merge-base", "--is-ancestor", sha, "refs/remotes/origin/main");
	return sha;
}

if (import.meta.main) {
	try {
		console.log(verifyRelease(process.argv[2]));
	} catch (error) {
		console.error(
			"Release rejected: tag must exist and point to a commit on origin/main.",
			error.message,
		);
		process.exitCode = 1;
	}
}
