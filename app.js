import { API_BASE, USE_MOCK } from "./config.js";

const strings = {
  networkSaved: "Saved, will sync when you are back online.",
  invalidToken: "Your session expired. Please enroll again.",
  required: "Please complete all fields.",
  invalidPhone: "Enter exactly 4 digits.",
  invalidValues: "Weight must be 0-500 kg and reps must be 1-100.",
  syncFailed: "Some saved sets could not sync yet."
};

const machineId = new URLSearchParams(location.search).get("m") || "unknown-machine";
const machineName = machineId.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const $ = (id) => document.getElementById(id);
let timerId;

function restStorageKey() {
  return `rest_started_at_${machineId}`;
}

function identity() {
  return { token: localStorage.getItem("member_token"), name: localStorage.getItem("member_name") };
}

function showScreen(screen) {
  $("enroll-screen").hidden = screen !== "enroll";
  $("set-screen").hidden = screen !== "set";
  $("not-you").hidden = screen !== "set";
}

function setError(id, message = "") { $(id).textContent = message; }

function fakeFetch(path, body) {
  return new Promise((resolve) => setTimeout(() => {
    if (path.endsWith("/enroll")) resolve({ ok: true, member_token: "mock-token", name: "Demo Member" });
    else resolve({ ok: true, set_number: 1, rest_seconds: 90, message: "Set logged." });
  }, 350));
}

async function post(path, body) {
  if (USE_MOCK) return fakeFetch(path, body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: controller.signal
    });
    const result = await response.json().catch(() => ({ ok: false, error: "invalid_response" }));
    if (!response.ok && result.ok !== false) return { ok: false, error: "request_failed" };
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function saveQueue(item) {
  const queue = JSON.parse(localStorage.getItem("offline_queue") || "[]");
  queue.push(item);
  localStorage.setItem("offline_queue", JSON.stringify(queue));
}

async function syncQueue() {
  const queue = JSON.parse(localStorage.getItem("offline_queue") || "[]");
  if (!queue.length || !identity().token) return;
  const remaining = [];
  for (const item of queue) {
    try {
      const result = await post("/gym/set", { ...item, member_token: identity().token });
      if (!result.ok) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  localStorage.setItem("offline_queue", JSON.stringify(remaining));
  if (remaining.length) setError("set-error", strings.syncFailed);
}

function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function startRestTimer(label = "Rest") {
  clearInterval(timerId);
  const storedStartedAt = localStorage.getItem(restStorageKey());
  const startedAt = Number(storedStartedAt);
  const timer = $("timer");
  if (storedStartedAt === null || !Number.isFinite(startedAt)) {
    $("confirmation").hidden = true;
    return;
  }
  $("timer-label").textContent = label;
  const updateTimer = () => { timer.textContent = formatElapsed(Date.now() - startedAt); };
  updateTimer();
  timerId = setInterval(() => {
    updateTimer();
  }, 1000);
}

function renderSetScreen() {
  const { name } = identity();
  $("greeting").textContent = `Hi ${name || "there"}`;
  $("set-machine-name").textContent = machineName;
  const previous = JSON.parse(localStorage.getItem(`last_set_${machineId}`) || "null");
  if (previous) { $("weight").value = previous.weight_kg; $("reps").value = previous.reps; }
  if (localStorage.getItem(restStorageKey())) {
    $("confirmation-message").textContent = "Set logged.";
    $("rest-message").textContent = "";
    $("confirmation").hidden = false;
    startRestTimer("Resting since your last set");
  }
  showScreen("set");
}

async function enroll(event) {
  event.preventDefault();
  setError("enroll-error");
  const gymId = $("gym-id").value.trim();
  const phone = $("phone-last4").value.trim();
  if (!gymId || !phone) return setError("enroll-error", strings.required);
  if (!/^\d{4}$/.test(phone)) return setError("enroll-error", strings.invalidPhone);
  const button = event.submitter;
  button.disabled = true;
  try {
    const result = await post("/gym/enroll", { gym_id: gymId, phone_last4: phone });
    if (!result.ok || !result.member_token) return setError("enroll-error", result.error || "Enrollment failed.");
    localStorage.setItem("member_token", result.member_token);
    localStorage.setItem("member_name", result.name || "Member");
    renderSetScreen();
  } catch {
    setError("enroll-error", "Could not connect. Check your internet and try again.");
  } finally { button.disabled = false; }
}

async function logSet(event) {
  event.preventDefault();
  setError("set-error");
  const weight = Number($("weight").value);
  const reps = Number($("reps").value);
  if (!$("weight").value || !$("reps").value) return setError("set-error", strings.required);
  if (!Number.isFinite(weight) || weight < 0 || weight > 500 || !Number.isInteger(reps) || reps < 1 || reps > 100) {
    return setError("set-error", strings.invalidValues);
  }
  const button = $("log-button");
  button.disabled = true;
  const item = { machine_id: machineId, weight_kg: weight, reps, client_ts: new Date().toISOString() };
  try {
    const result = await post("/gym/set", { ...item, member_token: identity().token });
    if (result.error === "invalid_token") {
      localStorage.removeItem("member_token"); localStorage.removeItem("member_name");
      showScreen("enroll"); return setError("enroll-error", strings.invalidToken);
    }
    if (!result.ok) return setError("set-error", result.error || "Could not log set.");
    localStorage.setItem(`last_set_${machineId}`, JSON.stringify({ weight_kg: weight, reps }));
    localStorage.setItem(restStorageKey(), String(Date.now()));
    $("confirmation-message").textContent = result.set_number ? `Set ${result.set_number} logged.` : "Set logged.";
    $("rest-message").textContent = typeof result.rest_seconds === "number" ? `Rested ${result.rest_seconds} sec since last set` : "";
    $("confirmation").hidden = false;
    startRestTimer();
  } catch {
    saveQueue(item);
    $("confirmation-message").textContent = strings.networkSaved;
    $("rest-message").textContent = "";
    $("confirmation").hidden = false;
  } finally { button.disabled = false; }
}

$("machine-name").textContent = machineName;
$("enroll-form").addEventListener("submit", enroll);
$("set-form").addEventListener("submit", logSet);
$("skip-button").addEventListener("click", () => {
  clearInterval(timerId);
  localStorage.removeItem(restStorageKey());
  $("timer").textContent = "Ready";
});
$("not-you").addEventListener("click", () => { localStorage.removeItem("member_token"); localStorage.removeItem("member_name"); showScreen("enroll"); });
window.addEventListener("online", syncQueue);
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
if (identity().token) { renderSetScreen(); syncQueue(); } else showScreen("enroll");
