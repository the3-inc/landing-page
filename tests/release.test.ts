import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { verifyRelease } from "../scripts/verify-release.mjs";

test("only deploys version tags reachable from origin/main, including older releases", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "landing-release-"));
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
	try {
		git("init", "--initial-branch=main");
		git("config", "user.name", "Release test");
		git("config", "user.email", "test@example.invalid");
		git(
			"-c",
			"commit.gpgsign=false",
			"commit",
			"--allow-empty",
			"-m",
			"Initial",
		);
		git("tag", "v1.0.0");
		const initial = git("rev-parse", "HEAD");
		git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "Next");
		git("update-ref", "refs/remotes/origin/main", "HEAD");
		expect(verifyRelease("v1.0.0", cwd)).toBe(initial);
		git("switch", "-c", "unmerged");
		git(
			"-c",
			"commit.gpgsign=false",
			"commit",
			"--allow-empty",
			"-m",
			"Unmerged",
		);
		git("tag", "v2.0.0");
		expect(() => verifyRelease("v2.0.0", cwd)).toThrow();
		expect(() => verifyRelease("v9.9.9", cwd)).toThrow();
		for (const tag of [
			"main",
			"v01.0.0",
			"v1.0",
			"v1.0.0-rc.1",
			"v1.0.0\n",
			"--help",
			undefined,
		]) {
			expect(() => verifyRelease(tag, cwd)).toThrow();
		}
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});
