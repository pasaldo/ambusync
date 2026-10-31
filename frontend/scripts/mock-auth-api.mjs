export async function mockAuthenticatedApi(context) {
  let authenticated = false;
  const demoUser = {
    id: "demo-user-id",
    username: "demo_ambulancia",
    groups: ["ambulance"],
    institutions: [{ id: "demo-hospital-id", name: "Hospital Central Demo" }],
    session: {
      started_at: 1_800_000_000,
      idle_expires_at: 1_800_001_800,
      absolute_expires_at: 1_800_043_200,
    },
  };

  await context.route("**/api/v1/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();

    if (pathname === "/api/v1/auth/csrf/") {
      await route.fulfill({ json: { csrf_token: "browser-test-csrf-token" } });
      return;
    }
    if (pathname === "/api/v1/auth/login/" && method === "POST") {
      authenticated = true;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (pathname === "/api/v1/auth/me/") {
      if (authenticated) await route.fulfill({ json: demoUser });
      else await route.fulfill({ status: 401, json: { code: "session_expired", message: "Sesión no iniciada." } });
      return;
    }
    if (pathname === "/api/v1/auth/logout/" && method === "POST") {
      authenticated = false;
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (pathname === "/api/v1/institutions/destinations/") {
      await route.fulfill({ json: [{ id: "demo-hospital-id", name: "Hospital Central Demo" }] });
      return;
    }
    if (pathname === "/api/v1/emergencies/" && method === "GET") {
      await route.fulfill({ json: { count: 0, next: null, previous: null, results: [] } });
      return;
    }

    await route.fulfill({ status: 404, json: { code: "not_found", message: "Ruta no simulada." } });
  });
}
