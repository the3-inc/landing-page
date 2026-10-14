import { mkdtemp, readFile, rm } from "node:fs/promises";
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
		expect(html).toContain("<title>the3-inc</title>");
		expect(html).toMatch(/<h1\b[^>]*>the3-inc<\/h1>/);
		expect(html).not.toContain("<script");
	} finally {
		await rm(outDir, { recursive: true, force: true });
	}
}, 30_000);
