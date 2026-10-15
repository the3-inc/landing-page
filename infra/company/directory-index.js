// biome-ignore lint/correctness/noUnusedVariables: CloudFront invokes this handler.
function handler(event) {
	const request = event.request;
	if (request.uri.endsWith("/")) {
		request.uri += "index.html";
	} else if (!request.uri.split("/").pop().includes(".")) {
		request.uri += "/index.html";
	}
	return request;
}
