export async function mockAuthenticatedApi(context, { groups = ["ambulance"] } = {}) {
  let authenticated = false;
  const managedAccounts = [];
  const demoAmbulances = [{ id: "demo-ambulance-id", code: "SYN-01" }];
  const demoUser = {
    id: "demo-user-id",
    username: groups.includes("institution_admin") ? "synthetic_admin" : "demo_ambulancia",
    groups,
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
    if (pathname === "/api/v1/auth/activate/" && method === "POST") {
      await route.fulfill({ json: { activated: true } });
      return;
    }
    if (pathname === "/api/v1/institutions/management/config/") {
      await route.fulfill({ json: { institution_name: "Hospital Central Demo", delegable_groups: ["ambulance", "urgencias"] } });
      return;
    }
    if (pathname === "/api/v1/institutions/management/ambulances/") {
      await route.fulfill({ json: demoAmbulances });
      return;
    }
    if (pathname === "/api/v1/institutions/management/accounts/" && method === "GET") {
      await route.fulfill({ json: managedAccounts });
      return;
    }
    if (pathname === "/api/v1/institutions/management/accounts/" && method === "POST") {
      const input = route.request().postDataJSON();
      const created = {
        id: String(managedAccounts.length + 1),
        username: input.username,
        email: input.email,
        groups: input.groups,
        active: false,
        ambulance: input.ambulance_id ? demoAmbulances.find((item) => item.id === input.ambulance_id) : null,
      };
      managedAccounts.push(created);
      await route.fulfill({ status: 201, json: { id: created.id, username: created.username, activation_sent: true } });
      return;
    }
    if (/^\/api\/v1\/institutions\/management\/accounts\/\d+\/resend-activation\/$/.test(pathname) && method === "POST") {
      await route.fulfill({ json: { activation_sent: true } });
      return;
    }
    if (/^\/api\/v1\/institutions\/management\/accounts\/\d+\/deactivate\/$/.test(pathname) && method === "POST") {
      const id = pathname.split("/").at(-3);
      const index = managedAccounts.findIndex((item) => item.id === id);
      if (index >= 0) managedAccounts.splice(index, 1);
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

  return { managedAccounts };
}
