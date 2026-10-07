import { createServer } from "node:http";

import { resolvePrototypeIdentity } from "./auth.js";

const port = Number(process.env.PORT ?? "3001");

export const server = createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (request.url === "/readyz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ready" }));
    return;
  }

  if (request.url === "/api/v1/me") {
    const identity = resolvePrototypeIdentity(request.headers);
    if (!identity) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }));
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ user: identity }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: { code: "NOT_FOUND" } }));
});

if (process.env.NODE_ENV !== "test") {
  server.listen(port, "0.0.0.0", () => {
    console.log(`control-plane listening on :${port}`);
  });
}
