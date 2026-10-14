import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "astro";
import { expect, test } from "vitest";

test("builds the company homepage as static HTML without client scripts", async () => {
	const outDir = await mkdtemp(join(tmpdir(), "landing-page-test-"));
	try {
		await build({
			root: fileURLToPath(new URL("../", import.meta.url)),
			outDir,
			logLevel: "silent",
		});
		const html = await readFile(join(outDir, "index.html"), "utf8");
		expect(html).toContain('lang="ja"');
		expect(html).toContain(
			"<title>the3合同会社 | 社会に一つでも多くいいものを提供する</title>",
		);
		const heading = html.match(/<h1\b[^>]*>(.*?)<\/h1>/s)?.[1];
		expect(heading?.replace(/<[^>]+>/g, "")).toBe(
			"社会に一つでも多くいいものを提供する。",
		);
		for (const section of ["philosophy", "access", "company"]) {
			expect(html).toContain(`id="${section}"`);
			expect(html).toContain(`href="#${section}"`);
		}
		expect(html).toContain('href="mailto:omitsuhashi@the3-o.com"');
		expect(html).toContain('href="tel:08067462024"');
		expect(html).toContain("東京都新宿区西新宿3丁目3番13号 西新宿水間ビル6階");
		expect(html).toContain(
			`query=${encodeURIComponent("東京都新宿区西新宿3丁目3番13号 西新宿水間ビル6階")}`,
		);
		expect(html).toMatch(/<link[^>]+href="[^"]+\.css"/);
		const assets = await readdir(join(outDir, "_astro"));
		const styles = await Promise.all(
			assets
				.filter((file) => file.endsWith(".css"))
				.map((file) => readFile(join(outDir, "_astro", file), "utf8")),
		);
		expect(styles.join("")).toContain(".bg-forest");
		expect(styles.join("")).toContain("--color-forest");
		expect(html).not.toContain("<script");
	} finally {
		await rm(outDir, { recursive: true, force: true });
	}
}, 30_000);
