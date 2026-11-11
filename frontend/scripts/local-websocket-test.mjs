import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mockAuthenticatedApi } from "./mock-auth-api.mjs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch();

try {
  const context = await browser.newContext();
  const api = await mockAuthenticatedApi(context, { groups: ["ambulance"] });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const nativeSetInterval = window.setInterval.bind(window);
    window.__intervals = [];
    window.__intervalCallbacks = new Map();
    window.setInterval = (callback, delay, ...args) => {
      window.__intervals.push(delay);
      window.__intervalCallbacks.set(delay, callback);
      return nativeSetInterval(callback, delay, ...args);
    };
    window.__runInterval = (delay) => window.__intervalCallbacks.get(delay)?.();
    class FakeWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = FakeWebSocket.CONNECTING;
      constructor(url) {
        super();
        this.url = url;
        window.__activeSocket = this;
      }
      close() {
        this.readyState = FakeWebSocket.CLOSED;
        this.dispatchEvent(new Event("close"));
      }
      send() {}
    }
    window.WebSocket = FakeWebSocket;
    window.__openSocket = () => {
      if (!window.__activeSocket) return;
      window.__activeSocket.readyState = FakeWebSocket.OPEN;
      window.__activeSocket.dispatchEvent(new Event("open"));
    };
    window.__emitSocketEvent = (payload) => {
      const event = new Event("message");
      Object.defineProperty(event, "data", { value: JSON.stringify(payload) });
      window.__activeSocket?.dispatchEvent(event);
    };
    window.__closeSocket = () => window.__activeSocket?.close();
  });

  await page.goto(`${BASE}/`);
  await page.getByLabel("Usuario").fill("synthetic_ambulance");
  await page.getByLabel("Contraseña").fill("local-test-password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByRole("heading", { name: "demo_ambulancia" }).waitFor();
  await page.waitForFunction(() => Boolean(window.__activeSocket));
  await page.evaluate(() => window.__openSocket());
  await page.getByText("Tiempo real conectado", { exact: false }).waitFor();
  assert.match(await page.evaluate(() => window.__activeSocket.url), /\/ws\/emergencies\/$/);

  const initialRequests = api.emergencyListRequests;
  const notification = {
    event_id: "4b26f962-9102-4ab9-b2de-88bb6b5794d0",
    type: "emergency.created",
    emergency_id: "40f03aa7-d704-497e-96a4-1c88f35243aa",
    version: 2,
  };
  const eventRefresh = page.waitForResponse((response) => response.url().includes("/api/v1/emergencies/") && response.request().method() === "GET");
  await page.evaluate((event) => window.__emitSocketEvent(event), notification);
  await eventRefresh;
  assert.ok(api.emergencyListRequests > initialRequests);
  const afterEventRequests = api.emergencyListRequests;
  await page.evaluate((event) => window.__emitSocketEvent(event), notification);
  await page.waitForTimeout(100);
  assert.equal(api.emergencyListRequests, afterEventRequests, "duplicate event must not trigger another list refresh");

  await page.evaluate(() => {
    window.__oldSocket = window.__activeSocket;
    window.__closeSocket();
  });
  await page.getByRole("status").filter({ hasText: "Tiempo real degradado" }).waitFor();
  assert.ok((await page.evaluate(() => window.__intervals)).includes(15_000), "disconnected state schedules 15-second fallback");
  const fallbackRefresh = page.waitForResponse((response) => response.url().includes("/api/v1/emergencies/") && response.request().method() === "GET");
  await page.evaluate(() => window.__runInterval(15_000));
  await fallbackRefresh;
  assert.ok(api.emergencyListRequests > afterEventRequests);

  await page.waitForFunction(() => window.__activeSocket !== window.__oldSocket);
  await page.evaluate(() => window.__openSocket());
  await page.getByRole("status").filter({ hasText: "Tiempo real conectado" }).waitFor();
  assert.ok((await page.evaluate(() => window.__intervals)).includes(60_000), "connected state schedules 60-second reconciliation");
  const reconciliation = page.waitForResponse((response) => response.url().includes("/api/v1/emergencies/") && response.request().method() === "GET");
  await page.evaluate(() => window.__runInterval(60_000));
  await reconciliation;
  await context.close();
} finally {
  await browser.close();
}
