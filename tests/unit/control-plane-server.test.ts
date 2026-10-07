import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";

process.env.NODE_ENV = "test";

const { server } = await import("../../apps/control-plane/src/server.js");

test("control plane rejects unauthenticated requests and resolves prototype identity", async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const unauthenticated = await fetch(`${baseUrl}/api/v1/me`);
    assert.equal(unauthenticated.status, 401);

    const authenticated = await fetch(`${baseUrl}/api/v1/me`, {
      headers: {
        "x-prototype-user": "learner-1",
        "x-prototype-role": "Learner",
      },
    });
    assert.equal(authenticated.status, 200);

    const body = (await authenticated.json()) as {
      user: { subject: string; roles: string[] };
    };
    assert.equal(body.user.subject, "learner-1");
    assert.deepEqual(body.user.roles, ["Learner"]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
