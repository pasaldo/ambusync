import assert from "node:assert/strict";
import test, { before } from "node:test";

import { connectEmergencyEvents } from "../src/lib/emergencySocket.ts";

before(() => {
  globalThis.window = { location: { protocol: "http:", host: "localhost:5173" } };
});

class FakeSocket {
  listeners = new Map();
  readyState = 0;
  closed = false;

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  open() {
    this.readyState = 1;
    this.emit("open");
  }

  send(data) {
    this.emit("message", { data: JSON.stringify(data) });
  }

  close() {
    this.closed = true;
    this.readyState = 3;
    this.emit("close");
  }
}

function fakeTimers() {
  const timers = new Map();
  let nextId = 0;
  return {
    timers,
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    runNext() {
      const [id, timer] = timers.entries().next().value ?? [];
      if (id === undefined) throw new Error("No scheduled timer");
      timers.delete(id);
      timer.callback();
      return timer.delay;
    },
  };
}

const validEvent = {
  event_id: "4b26f962-9102-4ab9-b2de-88bb6b5794d0",
  type: "emergency.created",
  emergency_id: "40f03aa7-d704-497e-96a4-1c88f35243aa",
  version: 1,
};

test("identification correction envelope requests API reconciliation without clinical data", () => {
  const socket = new FakeSocket(), events = [];
  const connection = connectEmergencyEvents({ onEvent: (event) => events.push(event), onStatus: () => {}, createSocket: () => socket, timers: fakeTimers() });
  socket.open(); socket.send({ ...validEvent, type: "emergency.patient_context_corrected", patient: "must not be forwarded" });
  assert.deepEqual(events, [{ ...validEvent, type: "emergency.patient_context_corrected" }]);
  connection();
});

test("delivers only valid, unseen event envelopes", () => {
  const socket = new FakeSocket();
  const urls = [];
  const events = [];
  const timers = fakeTimers();
  connectEmergencyEvents({
    onEvent: (event) => events.push(event),
    onStatus: () => {},
    createSocket: (url) => {
      urls.push(url);
      return socket;
    },
    timers,
  });

  socket.open();
  socket.send(validEvent);
  socket.send(validEvent);
  socket.send({ ...validEvent, type: "patient.details", event_id: "4b26f962-9102-4ab9-b2de-88bb6b5794d1" });
  socket.send({ ...validEvent, version: 0, event_id: "4b26f962-9102-4ab9-b2de-88bb6b5794d2" });

  assert.deepEqual(events, [validEvent]);
  assert.deepEqual(urls, ["ws://localhost:5173/ws/emergencies/"]);
});

test("accepts clinical update notification types without clinical payload", () => {
  const socket = new FakeSocket();
  const events = [];
  const disconnect = connectEmergencyEvents({ onEvent: (event) => events.push(event), onStatus: () => {}, createSocket: () => socket, timers: fakeTimers() });
  socket.open();
  for (const [index, type] of ["emergency.updated", "emergency.measurements_added", "emergency.measurement_rectified", "emergency.read_confirmed", "emergency.preparation_recorded", "emergency.destination_changed"].entries()) {
    socket.send({ ...validEvent, event_id: `4b26f962-9102-4ab9-b2de-88bb6b5794d${index + 1}`, type, notes: "not transmitted to callback" });
  }
  assert.equal(events.length, 6);
  assert.equal(events.some((event) => "notes" in event), false);
  disconnect();
});

test("reconnects with capped exponential backoff and reports connection states", () => {
  const sockets = [];
  const statuses = [];
  const timers = fakeTimers();
  connectEmergencyEvents({
    onEvent: () => {},
    onStatus: (status) => statuses.push(status),
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    timers,
    random: () => 0.5,
  });

  for (let attempt = 0; attempt < 7; attempt += 1) {
    sockets.at(-1).emit("close");
    assert.ok(timers.runNext() <= 30_000);
  }

  sockets.at(-1).open();
  assert.deepEqual(statuses.slice(0, 3), ["connecting", "reconnecting", "connecting"]);
  assert.equal(statuses.at(-1), "connected");
  assert.equal(sockets.length, 8);
});

test("cleanup cancels retries, closes the socket, and reports disconnected", () => {
  const socket = new FakeSocket();
  const statuses = [];
  const timers = fakeTimers();
  const disconnect = connectEmergencyEvents({
    onEvent: () => {},
    onStatus: (status) => statuses.push(status),
    createSocket: () => socket,
    timers,
  });

  assert.equal(timers.timers.size, 0);
  disconnect();

  assert.equal(timers.timers.size, 0);
  assert.equal(socket.closed, true);
  assert.equal(statuses.at(-1), "disconnected");
});
