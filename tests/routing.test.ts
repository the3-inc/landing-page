import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";

const template = readFileSync(
	new URL("../infra/site.yaml", import.meta.url),
	"utf8",
);
const source = template.match(/FunctionCode: \|\n((?: {8}[^\n]*\n)+)/)?.[1];
if (!source) throw new Error("CloudFront directory function missing");
const handler = runInNewContext(`${source}\nhandler`);

test.each([
	["/", "/index.html"],
	["/company/", "/company/index.html"],
	["/company", "/company/index.html"],
	["/contact/", "/contact/index.html"],
	["/unknown/", "/unknown/index.html"],
	["/_astro/site.hash.css", "/_astro/site.hash.css"],
	["/company/index.html", "/company/index.html"],
])("routes %s to its S3 object", (uri, expected) => {
	const request = { uri, querystring: { ref: { value: "link" } } };
	expect(handler({ request })).toBe(request);
	expect(request.uri).toBe(expected);
	expect(request.querystring.ref.value).toBe("link");
});
