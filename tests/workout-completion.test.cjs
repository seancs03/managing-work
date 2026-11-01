const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("app.js", "utf8");
function loadFunctions(context, names) {
  const sandbox = vm.createContext(context);
  for (const name of names) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    const end = source.indexOf("\n}\n", start) + 3;
    assert.ok(start >= 0 && end > start);
    vm.runInContext(source.slice(start, end), sandbox);
  }
  return sandbox;
}

test("completed workout durations remain frozen even with a stale running timestamp", () => {
  const context = loadFunctions({}, ["getWorkoutElapsedMs"]);
  assert.equal(context.getWorkoutElapsedMs({
    status: "completed", timerElapsedMs: 60000, timerStartedAt: 100,
  }, 90000000), 60000);
  assert.equal(context.getWorkoutElapsedMs({
    status: "in-progress", timerElapsedMs: 60000, timerStartedAt: 100,
  }, 1100), 61000);
});

test("finish persists a retry record; reopening merges it without losing other cloud workouts", () => {
  const storage = new Map();
  const finished = { id: "a", status: "in-progress", timerElapsedMs: 10, timerStartedAt: 100 };
  const context = loadFunctions({
    PROFILE_STORAGE_PREFIX: "profile.",
    selectedProfile: "sean", storageKey: "profile.sean", workouts: [finished],
    workout: finished, selectedWorkoutId: "a", selectedWeek: 1,
    cloudEnabled: true, supabaseClient: {}, cloudSaveTimer: null,
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
    setNoticeHidden() {}, showNotice(message) { throw new Error(message); },
    scheduleCloudSave() {}, saveCloudState() {}, render() {},
    finishWorkoutDialog: { close() {} },
    document: { getElementById: () => ({}) },
    window: { clearTimeout() {} },
    Date: { now: () => 1100 },
  }, ["getWorkoutElapsedMs", "readPendingCompletions", "mergePendingCompletions", "saveWorkout", "finishWorkout"]);
  context.finishWorkout();
  assert.equal(finished.status, "completed");
  assert.equal(finished.timerStartedAt, null);
  assert.equal(finished.timerElapsedMs, 1010);
  const cloud = { workouts: [{ id: "a", status: "in-progress" }, { id: "b", title: "Other device" }] };
  const merged = context.mergePendingCompletions("sean", cloud);
  assert.equal(merged.workouts[0].status, "completed");
  assert.equal(merged.workouts[1].title, "Other device");
  finished.status = "in-progress";
  context.saveWorkout();
  assert.equal(context.mergePendingCompletions("sean", cloud).workouts[0].status, "in-progress");
});

test("cloud save acknowledges only the exact pending snapshot, preserving edits made in flight", async () => {
  const storage = new Map();
  const workout = { id: "a", status: "completed", timerStartedAt: null };
  storage.set("profile.sean.pending-completions", JSON.stringify({ a: workout }));
  let resolveWrite;
  const context = loadFunctions({
    PROFILE_STORAGE_PREFIX: "profile.", selectedProfile: "sean",
    workouts: [workout], selectedWorkoutId: "a", selectedWeek: 1,
    cloudSaveInFlight: false, cloudSaveQueued: false,
    cloudEnabled: true, supabaseClient: {}, storageModeLabel: {},
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    writeCloudState: () => new Promise((resolve) => { resolveWrite = resolve; }),
    scheduleCloudSave() {}, showNotice() {}, console,
  }, ["serializeWorkoutState", "stableSerialize", "readPendingCompletions", "saveCloudState"]);
  const saving = context.saveCloudState();
  workout.title = "Edited while syncing";
  storage.set("profile.sean.pending-completions", JSON.stringify({ a: workout }));
  resolveWrite();
  await saving;
  assert.equal(JSON.parse(storage.get("profile.sean.pending-completions")).a.title, workout.title);
  const retry = context.saveCloudState();
  resolveWrite();
  await retry;
  assert.deepEqual(JSON.parse(storage.get("profile.sean.pending-completions")), {});
});

test("exercise substitutions propagate only forward and survive template reload syncing", () => {
  let id = 0;
  const context = loadFunctions({
    makeId: () => `generated-${++id}`,
    createWorkout() { throw new Error("All weeks already exist"); },
  }, ["syncWorkoutPlan", "propagateExerciseName", "prepareWorkoutTemplates"]);
  const weeks = Array.from({ length: 12 }, (_, index) => ({
    id: `week-${index + 1}`, templateId: "upper", templateStartWeek: 1,
    week: index + 1, title: "Upper day", planCustomized: false,
    exercises: [
      { id: `bench-${index}`, planId: "bench", name: "45 incline bench",
        sets: [{ id: `set-${index}`, planId: "set", weight: "40", reps: "10" }] },
      { id: `row-${index}`, planId: "row", name: "Row", sets: [] },
    ],
  }));
  const other = { templateId: "lower", week: 5,
    exercises: [{ planId: "bench", name: "Unrelated" }] };
  weeks[3].exercises[0].name = "DB flye";
  context.syncWorkoutPlan(weeks[3], weeks, false);
  context.propagateExerciseName(weeks[3], weeks[3].exercises[0], [...weeks, other]);
  context.prepareWorkoutTemplates(weeks);
  for (const peer of weeks) {
    assert.equal(peer.exercises[0].name, peer.week < 4 ? "45 incline bench" : "DB flye");
    assert.equal(peer.exercises[0].sets[0].weight, "40");
    assert.equal(peer.exercises[1].name, "Row");
  }
  assert.equal(other.exercises[0].name, "Unrelated");
  weeks[5].exercises[0].name = "Cable flye";
  context.propagateExerciseName(weeks[5], weeks[5].exercises[0], weeks);
  assert.equal(weeks[4].exercises[0].name, "DB flye");
  assert.equal(weeks[11].exercises[0].name, "Cable flye");
});
