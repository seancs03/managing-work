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

test("later-week structural edits preserve matching logs and leave earlier weeks unchanged", () => {
  let id = 0;
  const context = loadFunctions({ makeId: () => `new-${++id}` }, ["syncWorkoutPlan"]);
  const makeWeek = (week) => ({
    week, templateStartWeek: 1, templateId: "upper", title: "Upper", exercises: [
      { planId: "bench", name: "Bench", sets: [
        { id: `a-${week}`, planId: "a", weight: "20" },
        { id: `b-${week}`, planId: "b", weight: "30" },
      ] },
      { planId: "row", name: "Row", sets: [] },
    ],
  });
  const earlier = makeWeek(2);
  const current = makeWeek(3);
  const later = makeWeek(4);
  const originalEarlier = JSON.stringify(earlier);
  current.exercises.pop();
  current.exercises[0].sets.shift();
  current.exercises[0].sets.push({ planId: "c", weight: "99" });
  current.exercises.push({ planId: "flye", name: "Flye", sets: [{ planId: "d", weight: "80" }] });
  context.syncWorkoutPlan(current, [earlier, current, later], false);
  assert.equal(JSON.stringify(earlier), originalEarlier);
  assert.deepEqual(later.exercises.map((item) => item.planId), ["bench", "flye"]);
  assert.equal(later.exercises[0].sets[0].id, "b-4");
  assert.equal(later.exercises[0].sets[0].weight, "30");
  assert.equal(later.exercises[0].sets[1].weight, "");
  assert.equal(later.exercises[1].sets[0].weight, "");
  assert.equal(later.planCustomized, true);
});

test("template end week prevents deleted future workout days from returning", () => {
  let id = 0;
  const context = loadFunctions({
    makeId: () => `new-${++id}`,
    createWorkout: (title, templateId, templateStartWeek) => ({ title, templateId, templateStartWeek }),
  }, ["syncWorkoutPlan", "prepareWorkoutTemplates"]);
  const weeks = [1, 2].map((week) => ({
    week, title: "Upper", templateId: "upper", templateEndWeek: 2, exercises: [],
  }));
  context.prepareWorkoutTemplates(weeks);
  assert.equal(weeks.length, 2);
});

test("backup round-trip preserves all profile values and rejects wrong users and malformed files", () => {
  const context = loadFunctions({}, ["createProfileBackup", "parseProfileBackup"]);
  const state = { selectedWorkoutId: "workout-1", selectedWeek: 6, workouts: [{
    id: "workout-1", templateId: "upper", title: "Upper", week: 6,
    status: "completed", timerElapsedMs: 123000, timerStartedAt: null,
    templateEndWeek: 12, sessionNotes: ["Good session", ""], exercises: [{
      id: "exercise-1", planId: "bench", name: "Bench", sets: [{
        id: "set-1", planId: "set-plan", weight: "42.5", reps: "10", rpe: "8.5",
        llp: true, llpReps: "3", myo: true, myoReps: "2", myoNotes: ["5", "4"],
        myoNotesConfirmed: true,
      }],
    }],
  }] };
  const backup = context.createProfileBackup("sean", state, new Date("2026-11-01T13:00:00Z"));
  const text = JSON.stringify(backup);
  assert.deepEqual(JSON.parse(JSON.stringify(context.parseProfileBackup(text, "sean").state)), state);
  state.workouts[0].title = "Changed after download";
  assert.equal(backup.state.workouts[0].title, "Upper");
  assert.throws(() => context.parseProfileBackup(text, "kick"), /different user/);
  assert.throws(() => context.parseProfileBackup("{}", "sean"), /backup file/);
  backup.state.workouts[0].exercises[0].sets[0].myoNotes = "invalid";
  assert.throws(() => context.parseProfileBackup(JSON.stringify(backup), "sean"), /invalid set/);
  assert.deepEqual(JSON.parse(JSON.stringify(context.parseProfileBackup(JSON.stringify(
    context.createProfileBackup("sean", { workouts: [], selectedWorkoutId: null, selectedWeek: 1 }),
  ), "sean").state.workouts)), []);
});

test("refresh reloads cloud data, retains selection, and does not replace concurrent edits", async () => {
  let handler;
  let resolveRead;
  let applied;
  const button = { addEventListener: (_, callback) => { handler = callback; } };
  const state = { workouts: [{ id: "a", exercises: [] }], selectedWorkoutId: "a", selectedWeek: 6 };
  const notices = [];
  const context = loadFunctions({
    selectedProfile: "sean", selectedWorkoutId: "a", selectedWeek: 6,
    cloudEnabled: true, cloudSignedIn: true,
    cloudSaveTimer: null, cloudSaveInFlight: false, cloudSaveQueued: false,
    pendingCloudState: null, workouts: state.workouts,
    document: { getElementById: (id) => id === "refresh-workout-button" ? button : {} },
    window: { scrollX: 0, scrollY: 400, scrollTo() {} },
    showNotice: (message) => notices.push(message), console,
    supabaseClient: { from: () => ({ select: () => ({ eq: () => ({
      single: () => new Promise((resolve) => { resolveRead = resolve; }),
    }) }) }) },
    applyCloudState: (value) => { applied = value; return true; },
  }, ["serializeWorkoutState", "stableSerialize"]);
  const start = source.indexOf('const refreshWorkoutButton =');
  const end = source.indexOf('\nfunction queueIncomingCloudState', start);
  vm.runInContext(source.slice(start, end), context);
  const refreshing = handler();
  resolveRead({ data: { state: { ...state, selectedWeek: 1 } } });
  await refreshing;
  assert.equal(applied.selectedWeek, 6);
  assert.equal(applied.selectedWorkoutId, "a");
  applied = null;
  const concurrent = handler();
  state.workouts[0].title = "New edit";
  resolveRead({ data: { state } });
  await concurrent;
  assert.equal(applied, null);
  assert.match(notices.pop(), /edits were kept/);
  const failed = handler();
  resolveRead({ error: new Error("Offline") });
  await failed;
  assert.equal(applied, null);
  assert.match(notices.pop(), /Your current data was kept/);
  assert.equal(button.disabled, false);
});
