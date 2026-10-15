// biome-ignore lint/correctness/noUnusedVariables: CloudFront invokes this handler.
function handler(event) {
	const request = event.request;
	if (
		["/products/schedula/demo", "/products/schedula/docs"].includes(request.uri)
	) {
		return {
			statusCode: 308,
			headers: { location: { value: `${request.uri}/` } },
		};
	}
	if (request.uri.endsWith("/")) request.uri += "index.html";
	return request;
}
