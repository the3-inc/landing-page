import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

test("the distributed package resolves its CSS and SVG without dependencies", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "the3-design-"));
	const root = fileURLToPath(new URL("../", import.meta.url));
	try {
		const archive = execFileSync(
			"python3",
			["scripts/pack_design.py", join(cwd, "release")],
			{
				cwd: root,
				encoding: "utf8",
			},
		).trim();
		execFileSync("tar", ["-xzf", archive, "-C", cwd]);
		await writeFile(
			join(cwd, "package/check.mjs"),
			`import { readFileSync } from "node:fs";
const files = ["tokens.css", "base.css", "assets/the3-symbol.svg"];
for (const file of files) {
  const url = import.meta.resolve("@the3/brand/" + file);
  if (!readFileSync(new URL(url)).length) throw new Error(file);
}`,
		);
		// 自己参照はpackage.jsonのexportsを通るため、workspaceだけの相対参照を検出できる。
		execFileSync(process.execPath, [join(cwd, "package/check.mjs")]);
		const manifest = JSON.parse(
			await readFile(join(cwd, "package/package.json"), "utf8"),
		);
		expect(manifest.dependencies).toBeUndefined();
	} finally {
		await rm(cwd, { recursive: true, force: true });
	}
});
