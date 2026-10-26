import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { verifyRelease } from "../scripts/verify-release.mjs";

test("only deploys version tags reachable from origin/main, including older releases", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "landing-release-"));
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
	const runnerTemp = await mkdtemp(join(tmpdir(), "landing-runner-"));
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
		await mkdir(join(cwd, "scripts"));
		for (const file of ["verify-release.mjs", "site_check.py"]) {
			await writeFile(
				join(cwd, "scripts", file),
				await readFile(new URL(`../scripts/${file}`, import.meta.url)),
			);
		}
		git("add", "scripts");
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
		git("switch", "main");
		const workflow = await readFile(
			new URL("../.github/workflows/deploy-site.yml", import.meta.url),
			"utf8",
		);
		const prepare = workflow.match(
			/name: Verify release and deployment configuration[\s\S]*?run: \|\n((?: {10}.*\n)+)/,
		)?.[1];
		expect(prepare).toBeDefined();
		execFileSync("bash", ["-c", prepare ?? "exit 1"], {
			cwd,
			env: {
				...process.env,
				RELEASE_TAG: "v1.0.0",
				RUNNER_TEMP: runnerTemp,
				GITHUB_OUTPUT: join(runnerTemp, "output"),
				AWS_REGION: "test",
				SITE_BUCKET: "test",
				DISTRIBUTION_ID: "test",
				AWS_ROLE_ARN: "test",
				AWS_ACCOUNT_ID: "test",
			},
		});
		expect(git("rev-parse", "HEAD")).toBe(initial);
		await expect(
			readFile(join(cwd, "scripts/site_check.py")),
		).rejects.toThrow();
		expect(await readFile(join(runnerTemp, "site_check.py"), "utf8")).toBe(
			await readFile(
				new URL("../scripts/site_check.py", import.meta.url),
				"utf8",
			),
		);
		expect(workflow).toContain(
			'run: python3 "$RUNNER_TEMP/site_check.py" --url https://the3.co.jp',
		);
		expect(
			execFileSync("python3", [join(runnerTemp, "site_check.py"), "--help"], {
				cwd,
				encoding: "utf8",
			}),
		).toContain("--url");
	} finally {
		await rm(cwd, { recursive: true, force: true });
		await rm(runnerTemp, { recursive: true, force: true });
	}
});

test("tag callers must use the trusted main deployment workflow", async () => {
	const entry = await readFile(
		new URL("../.github/workflows/deploy.yml", import.meta.url),
		"utf8",
	);
	expect(entry).toContain(
		"uses: the3-inc/landing-page/.github/workflows/deploy-site.yml@main",
	);
	expect(
		JSON.parse(
			await readFile(
				new URL("../.github/oidc-subject.json", import.meta.url),
				"utf8",
			),
		),
	).toEqual({
		use_default: false,
		include_claim_keys: ["repo", "context", "job_workflow_ref"],
	});
});
