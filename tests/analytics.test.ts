import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";

const source = readFileSync(
	new URL("../public/analytics.js", import.meta.url),
	"utf8",
);

function load(origin = "https://the3.co.jp", id = "G-TEST123", referrer = "") {
	const scripts: Record<string, unknown>[] = [];
	const window = { dataLayer: [] as unknown[][], gtag: undefined };
	const context = {
		window,
		URL,
		location: {
			origin,
			pathname: "/contact/",
			search: "?email=private",
			hash: "#private",
		},
		document: {
			currentScript: { dataset: { ga4Id: id } },
			referrer,
			createElement: () => ({}),
			head: {
				append: (script: Record<string, unknown>) => scripts.push(script),
			},
		},
	};
	runInNewContext(source, context);
	return { scripts, window, reload: () => runInNewContext(source, context) };
}

test("queues one automatic pageview configuration and removes query and fragment from URLs", () => {
	const view = load(
		undefined,
		undefined,
		"https://example.com/path?email=private#secret",
	);
	const commands = view.window.dataLayer.map((args) => Array.from(args));
	expect(commands[0]).toEqual([
		"set",
		{
			page_location: "https://the3.co.jp/contact/",
			page_referrer: "https://example.com/path",
		},
	]);
	expect(commands[2]).toEqual([
		"config",
		"G-TEST123",
		{ allow_google_signals: false, allow_ad_personalization_signals: false },
	]);
	expect(view.scripts).toHaveLength(1);
	expect(view.scripts[0]?.src).toBe(
		"https://www.googletagmanager.com/gtag/js?id=G-TEST123",
	);
	view.reload();
	expect(view.window.dataLayer).toHaveLength(3);
	expect(view.scripts).toHaveLength(1);
});

test.each([
	"http://localhost:4321",
	"https://preview.example.com",
	"http://the3.co.jp",
])("does not collect from %s", (origin) => {
	expect(load(origin).scripts).toHaveLength(0);
});

test.each(["", "G-bad", 'G-TEST"<script>'])(
	"does not load an invalid measurement ID: %s",
	(id) => {
		expect(load(undefined, id).scripts).toHaveLength(0);
	},
);
