import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";

test("builds company and product pages with shared navigation and development-only theme controls", async () => {
	// Astro renames assets into outDir, so keep it on the project's filesystem.
	const outDir = await mkdtemp(
		fileURLToPath(new URL("../.site-test-", import.meta.url)),
	);
	try {
		const buildEnv = { ...process.env };
		buildEnv.NODE_ENV = "production";
		// Vitest injects DEV/PROD; the CLI must use its own production flags.
		delete buildEnv.DEV;
		delete buildEnv.PROD;
		delete buildEnv.PUBLIC_GA4_MEASUREMENT_ID;
		delete buildEnv.PUBLIC_CONTACT_ENDPOINT;
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
		const paths = ["/", "/company/", "/contact/", "/products/"];
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
		for (const id of [
			"philosophy-note-title",
			"approach-title",
			"home-products-title",
			"home-company-title",
			"home-contact-title",
		]) {
			expect(home).toContain(`aria-labelledby="${id}"`);
			expect(home).toContain(`id="${id}"`);
		}
		expect(home).toContain('href="#philosophy-note-title"');
		const homeContent = home?.match(/<main\b[^>]*>(.*?)<\/main>/s)?.[1];
		for (const path of [...paths.slice(1), "/products/schedula/"])
			expect(homeContent).toContain(`href="${path}"`);
		expect(homeContent).toContain("人が考え、工夫するための時間を増やしたい。");
		expect(home).toContain('src="/images/value-growth.png"');
		expect(home).not.toContain("<svg");
		for (const asset of ["images/value-growth.png", "brand/the3-symbol.png"]) {
			const image = await readFile(join(outDir, asset));
			expect(image.subarray(1, 4).toString()).toBe("PNG");
		}
		const logo = await readFile(join(outDir, "brand/the3-symbol.svg"), "utf8");
		expect(logo).toContain('xmlns="http://www.w3.org/2000/svg"');
		expect(logo).toContain('viewBox="0 0 1254 1254"');
		expect(logo).toContain("<path");
		expect(logo).not.toMatch(/<image|<script|data:image|base64/);
		for (const color of ["#173f35", "#88ac91", "#c8ab4d"])
			expect(logo).toContain(`fill="${color}"`);
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
		const productIndex = await readFile(
			join(outDir, "products/index.html"),
			"utf8",
		);
		const product = await readFile(
			join(outDir, "products/schedula/index.html"),
			"utf8",
		);
		for (const html of [...pages, productIndex, product]) {
			expect(html).toContain(
				'<link rel="icon" type="image/svg+xml" href="/brand/the3-symbol.svg">',
			);
			for (const tag of ["header", "footer"]) {
				const section = html.match(
					new RegExp(`<${tag}\\b[^>]*>(.*?)</${tag}>`, "s"),
				)?.[1];
				expect(section).toMatch(
					/<img[^>]+src="\/brand\/the3-symbol\.svg"[^>]+alt=""/,
				);
			}
		}
		expect(productIndex).toContain('href="/products/schedula/"');
		for (const [html, current] of [
			[productIndex, "page"],
			[product, "location"],
		]) {
			const link = html?.match(/<a\b[^>]*href="\/products\/"[^>]*>/)?.[0];
			expect(link).toContain(`aria-current="${current}"`);
			expect(link).toContain(`aria-[current=${current}]:underline`);
		}
		expect(product).toContain("シフト作成を、自社の業務に。");
		expect(product).toContain(
			'rel="canonical" href="https://the3.co.jp/products/schedula/"',
		);
		expect(product).not.toContain("<script");
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
		for (const id of ["demand", "consecutive_days", "verify"])
			expect(product).toContain(`href="/products/schedula/demo/#${id}"`);
		expect(product).toContain('href="/products/schedula/docs/"');
		for (const text of [
			"固定日付の架空データを使います。",
			"検証成功と需要の完全充足、最適性はそれぞれ区別します。",
			"PyPI公開やアプリの提供開始を案内するものではありません。",
			"支援範囲・費用・期間は案件ごとに確認します。",
		])
			expect(product).toContain(text);
	} finally {
		await rm(outDir, { recursive: true, force: true });
	}
}, 30_000);

test("includes one GA4 tag on every page and a configured contact form", async () => {
	const outDir = await mkdtemp(
		fileURLToPath(new URL("../.site-test-", import.meta.url)),
	);
	try {
		const env: NodeJS.ProcessEnv = {
			...process.env,
			NODE_ENV: "production",
			PUBLIC_GA4_MEASUREMENT_ID: "G-TEST123",
			PUBLIC_CONTACT_ENDPOINT: "https://contact.example.test/submit",
		};
		delete env.DEV;
		delete env.PROD;
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
			{ cwd: fileURLToPath(new URL("../", import.meta.url)), env },
		);
		for (const path of [
			"index.html",
			"company/index.html",
			"contact/index.html",
			"products/index.html",
			"products/schedula/index.html",
		]) {
			const html = await readFile(join(outDir, path), "utf8");
			expect(html.match(/src="\/analytics.js"/g)).toHaveLength(1);
			expect(html).toContain('data-ga4-id="G-TEST123"');
			expect(html).not.toContain("googletagmanager.com/gtag/js");
		}
		const contact = await readFile(join(outDir, "contact/index.html"), "utf8");
		expect(contact).toContain('action="https://contact.example.test/submit"');
		for (const name of ["name", "email", "message"])
			expect(contact).toContain(`name="${name}"`);
		expect(contact).toContain('src="/contact.js"');
		expect(contact).toContain('role="status"');
	} finally {
		await rm(outDir, { recursive: true, force: true });
	}
}, 30_000);
