import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";

test("builds three static pages with shared navigation and development-only theme controls", async () => {
	const outDir = await mkdtemp(join(tmpdir(), "landing-page-test-"));
	try {
		const buildEnv = { ...process.env };
		buildEnv.NODE_ENV = "production";
		// Vitest injects DEV/PROD; the CLI must use its own production flags.
		delete buildEnv.DEV;
		delete buildEnv.PROD;
		await promisify(execFile)(
			process.execPath,
			[
				fileURLToPath(
					new URL("../node_modules/astro/bin/astro.mjs", import.meta.url),
				),
				"build",
				"--outDir",
				outDir,
			],
			{
				cwd: fileURLToPath(new URL("../", import.meta.url)),
				env: buildEnv,
			},
		);
		const pages = await Promise.all(
			["index.html", "company/index.html", "contact/index.html"].map((file) =>
				readFile(join(outDir, file), "utf8"),
			),
		);
		const paths = ["/", "/company/", "/contact/"];
		for (const [index, html] of pages.entries()) {
			expect(html).toContain('lang="ja"');
			expect(html.match(/<h1\b/g)).toHaveLength(1);
			for (const path of paths) expect(html).toContain(`href="${path}"`);
			const currentLinks = html.match(/<a\b[^>]*aria-current="page"[^>]*>/g);
			expect(currentLinks).toHaveLength(1);
			expect(currentLinks?.[0]).toContain(`href="${paths[index]}"`);
			expect(html).toMatch(/<link[^>]+href="[^"]+\.css"/);
			expect(html).not.toContain('id="theme-select"');
			expect(html).not.toContain("<script");
			expect(html).toContain('media="(prefers-color-scheme: light)"');
			expect(html).toContain('media="(prefers-color-scheme: dark)"');
		}
		const [home, company, contact] = pages;
		expect(home).toContain(
			"<title>the3合同会社 | 社会に一つでも多く価値あるものを提供する</title>",
		);
		const heading = home?.match(/<h1\b[^>]*>(.*?)<\/h1>/s)?.[1];
		expect(heading?.replace(/<[^>]+>/g, "")).toBe(
			"社会に一つでも多く価値あるものを提供する。",
		);
		expect(home).not.toContain('id="company-title"');
		expect(home).not.toContain('id="contact-title"');
		for (const html of [company, contact]) {
			expect(html).not.toContain("社会に一つでも多く");
			expect(html).not.toContain('id="philosophy"');
		}
		expect(company).toContain("<title>会社案内 | the3合同会社</title>");
		expect(company).toContain(
			"東京都新宿区西新宿3丁目3番13号 西新宿水間ビル6階",
		);
		expect(company).toContain(
			`query=${encodeURIComponent("東京都新宿区西新宿3丁目3番13号 西新宿水間ビル6階")}`,
		);
		expect(company).toContain('rel="noopener noreferrer"');
		expect(contact).toContain("<title>お問い合わせ | the3合同会社</title>");
		expect(contact).toContain('href="mailto:omitsuhashi@the3-o.com"');
		expect(contact).toContain('href="tel:08067462024"');
		expect(contact).not.toContain('id="access"');
		const assets = await readdir(join(outDir, "_astro"));
		const styles = await Promise.all(
			assets
				.filter((file) => file.endsWith(".css"))
				.map((file) => readFile(join(outDir, "_astro", file), "utf8")),
		);
		expect(styles.join("")).toContain(".bg-forest");
		expect(styles.join("")).toContain("--color-forest");
		expect(styles.join("")).not.toContain("light-dark(");
		expect(styles.join("")).not.toContain("scroll-snap");
		expect(styles.join("")).not.toContain("100svh");
	} finally {
		await rm(outDir, { recursive: true, force: true });
	}
}, 30_000);
