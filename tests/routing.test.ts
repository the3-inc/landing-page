import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";

const source = readFileSync(
	new URL("../infra/company/directory-index.js", import.meta.url),
	"utf8",
);
const handler = runInNewContext(`${source}\nhandler`);

test.each([
	["/", "/index.html"],
	["/company/", "/company/index.html"],
	["/company", "/company/index.html"],
	["/contact/", "/contact/index.html"],
	["/unknown/", "/unknown/index.html"],
	["/_astro/site.hash.css", "/_astro/site.hash.css"],
	["/company/index.html", "/company/index.html"],
	["/products/alpha", "/products/alpha/index.html"],
	["/products/alpha/", "/products/alpha/index.html"],
	["/products", "/products/index.html"],
	["/products/", "/products/index.html"],
])("routes %s to its S3 object", (uri, expected) => {
	const request = { uri, querystring: { ref: { value: "link" } } };
	expect(handler({ request })).toBe(request);
	expect(request.uri).toBe(expected);
	expect(request.querystring.ref.value).toBe("link");
});

const schedulaHandler = runInNewContext(
	`${readFileSync(new URL("../infra/company/schedula-directory.js", import.meta.url), "utf8")}\nhandler`,
);

test.each(["demo", "docs"])("canonicalizes schedula %s", (name) => {
	expect(
		schedulaHandler({ request: { uri: `/products/schedula/${name}` } }),
	).toEqual({
		statusCode: 308,
		headers: { location: { value: `/products/schedula/${name}/` } },
	});
	expect(
		schedulaHandler({
			request: { uri: `/products/schedula/${name}/`, querystring: {} },
		}).uri,
	).toBe(`/products/schedula/${name}/index.html`);
});

test("keeps schedula assets and nested document keys", () => {
	for (const uri of [
		"/products/schedula/assets/app.hash.js",
		"/products/schedula/docs/python-api.md",
	]) {
		const request = { uri, querystring: { source: { value: "company" } } };
		expect(schedulaHandler({ request })).toBe(request);
		expect(request.uri).toBe(uri);
	}
});
