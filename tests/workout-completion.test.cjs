const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("app.js", "utf8");
test("HTML nesting keeps the training interface inside the hidden app shell", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const stack = [];
  const voidTags = new Set(["meta", "link", "input", "br", "hr", "img"]);
  const appSections = new Set(["workout-planner", "workout-layout", "session-notes-card", "backup-menu"]);
  let checked = 0;
  for (const match of html.matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
    const [tag, name] = match;
    if (tag.startsWith("</")) {
      assert.equal(stack.pop()?.name, name, `Mismatched closing tag: ${tag}`);
    } else {
      const classes = (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);
      if (classes.some((value) => appSections.has(value))) {
        assert.ok(stack.some((item) => item.tag.includes('id="app-shell"')), tag);
        checked++;
      }
      if (!voidTags.has(name) && !tag.endsWith("/>")) stack.push({ name, tag });
    }
  }
  assert.equal(stack.length, 0);
  assert.equal(checked, 4);
  assert.match(html, /<div id="app-shell" hidden>/);
});

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
    pendingStructuralUndo: null, updateUndoButton() {},
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
    mirroringEnabled: true,
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
  const attributes = {};
  const button = {
    addEventListener: (_, callback) => { handler = callback; },
    setAttribute: (key, value) => { attributes[key] = value; },
    removeAttribute: (key) => { delete attributes[key]; },
  };
  const state = { workouts: [{ id: "a", exercises: [] }], selectedWorkoutId: "a", selectedWeek: 6 };
  const notices = [];
  const feedback = {};
  const context = loadFunctions({
    selectedProfile: "sean", selectedWorkoutId: "a", selectedWeek: 6,
    cloudEnabled: true, cloudSignedIn: true,
    cloudSaveTimer: null, cloudSaveInFlight: false, cloudSaveQueued: false,
    pendingCloudState: null, workouts: state.workouts,
    document: { getElementById: (id) => id === "refresh-workout-button" ? button : id === "refresh-feedback" ? feedback : {} },
    window: { scrollX: 0, scrollY: 400, scrollTo() {}, setTimeout() { return 1; }, clearTimeout() {} },
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
  assert.equal(attributes["aria-busy"], "true");
  assert.equal(feedback.textContent, "Refreshing...");
  resolveRead({ data: { state: { ...state, selectedWeek: 1 } } });
  await refreshing;
  assert.equal(applied.selectedWeek, 6);
  assert.equal(feedback.textContent, "Refreshed");
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
  assert.equal(feedback.textContent, "Refresh failed");
  assert.equal(button.disabled, false);
  assert.equal(attributes["aria-busy"], undefined);
});

test("targets follow week, day and current position, including replacement exercises", () => {
  const dataContext = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync("workout-targets.js", "utf8"), dataContext);
  const data = dataContext.window.WORKOUT_TARGETS;
  assert.equal(Object.keys(data.targets).length, 408);
  const context = loadFunctions({ WORKOUT_TARGETS: data }, ["findExerciseTarget"]);
  for (const [key, expected] of Object.entries(data.targets)) {
      const [week, day, order] = key.split(":");
      const exercises = Array.from({ length: Number(order) }, () => ({ name: "Renamed exercise" }));
      const workout = { week: Number(week), title: `${day === "legs" ? "Leg" : day} day`, exercises };
      const target = context.findExerciseTarget(workout, exercises[Number(order) - 1]);
      assert.ok(target);
      assert.equal(target, expected);
      for (const field of ["working_sets", "rep_range", "early_sets_rpe", "last_set_rpe", "last_set_intensity_technique"]) {
        assert.equal(typeof target[field], "string");
        assert.notEqual(target[field], "");
      }
  }
  const workout = { week: 6, title: "Upper day", exercises: Array.from({ length: 7 }, () => ({})) };
  workout.exercises.pop();
  const replacement = { name: "Something completely different", planId: "new-id" };
  workout.exercises.push(replacement);
  assert.equal(context.findExerciseTarget(workout, replacement), data.targets["6:upper:7"]);
  workout.exercises.shift();
  assert.equal(context.findExerciseTarget(workout, replacement), data.targets["6:upper:6"]);
  workout.exercises.push({});
  workout.exercises.push({});
  assert.equal(context.findExerciseTarget(workout, workout.exercises[7]), null);
  assert.equal(context.findExerciseTarget({ ...workout, title: "Unknown day" }, replacement), null);
});

test("structural undo restores deleted weeks/exercises/sets with logs and preserves later logged edits", () => {
  const context = loadFunctions({}, ["stableSerialize", "workoutStructure", "restoreStructuralUndo"]);
  const makeWeek = (week) => ({
    id: `week-${week}`, week, title: "Upper", templateEndWeek: 12,
    planCustomized: false, shadowWorkoutId: null, status: "completed",
    exercises: [{
      id: `exercise-${week}`, planId: "bench", name: "Bench", sets: [
        { id: `a-${week}`, planId: "a", weight: "20", myoNotes: ["5"] },
        { id: `b-${week}`, planId: "b", weight: "30", reps: "10" },
      ],
    }],
  });
  const before = { workouts: [makeWeek(1), makeWeek(2)], selectedWorkoutId: "week-1", selectedWeek: 1 };
  const after = JSON.parse(JSON.stringify(before));
  after.workouts.forEach((item) => item.exercises[0].sets.shift());
  const current = JSON.parse(JSON.stringify(after));
  current.workouts[1].exercises[0].sets[0].weight = "45";
  const restored = context.restoreStructuralUndo({ before, after }, current);
  assert.equal(restored.workouts[1].exercises[0].sets[0].weight, "20");
  assert.equal(restored.workouts[1].exercises[0].sets[0].myoNotes[0], "5");
  assert.equal(restored.workouts[1].exercises[0].sets[1].weight, "45");
  const deleted = { ...before, workouts: [] };
  const recovered = context.restoreStructuralUndo({ before, after: deleted }, { ...deleted, selectedWorkoutId: null });
  assert.equal(recovered.workouts.length, 2);
  assert.equal(recovered.workouts[1].exercises[0].sets[1].reps, "10");
  const removedExercise = JSON.parse(JSON.stringify(before));
  removedExercise.workouts.forEach((item) => { item.exercises = []; });
  const recoveredExercise = context.restoreStructuralUndo({ before, after: removedExercise }, removedExercise);
  assert.equal(recoveredExercise.workouts[0].exercises[0].sets[0].weight, "20");
  current.workouts[0].exercises[0].name = "Conflicting rename";
  assert.throws(() => context.restoreStructuralUndo({ before, after }, current), /structure has changed/);
});

test("structural undo is recorded separately and non-structural saves keep the previous record", () => {
  const storage = new Map();
  const context = loadFunctions({
    pendingStructuralUndo: { label: "Delete set", before: { workouts: [{ id: "old" }] } },
    selectedProfile: "sean", storageKey: "profile.sean", PROFILE_STORAGE_PREFIX: "profile.",
    workouts: [], workout: null, selectedWorkoutId: null, selectedWeek: 1,
    cloudEnabled: false,
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    setNoticeHidden() {}, updateUndoButton() {}, showNotice(message) { throw new Error(message); },
  }, ["readPendingCompletions", "serializeWorkoutState", "saveWorkout"]);
  context.saveWorkout();
  const undo = JSON.stringify(context.structuralUndoRecord);
  assert.equal(context.structuralUndoRecord.label, "Delete set");
  assert.equal(storage.has("profile.sean.undo"), false);
  assert.equal(context.pendingStructuralUndo, null);
  context.selectedWeek = 2;
  context.saveWorkout();
  assert.equal(JSON.stringify(context.structuralUndoRecord), undo);
});

test("set-deletion Cancel leaves data untouched and confirmed deletion records undo", () => {
  const callbacks = {};
  let recorded = 0;
  const exercise = { id: "exercise", name: "Bench", sets: [{ id: "set", weight: "50" }] };
  const context = vm.createContext({
    workout: { id: "workout", exercises: [exercise] }, workouts: [],
    document: { getElementById: (id) => ({
      addEventListener: (event, callback) => { callbacks[`${id}:${event}`] = callback; },
      close: () => callbacks["delete-set-dialog:close"](), focus() {},
    }) },
    beginStructuralUndo: () => { recorded++; }, applyWorkoutPlanEdit() {}, render() {}, saveWorkout() {},
  });

  test("mirroring off edits only the current week and excluded days stay deleted on reload", () => {
    const context = loadFunctions({
      mirroringEnabled: false, makeId: () => "new",
      createWorkout() { throw new Error("Deleted day must not be recreated"); },
    }, ["syncWorkoutPlan", "applyWorkoutPlanEdit", "propagateExerciseName", "prepareWorkoutTemplates"]);
    const first = { week: 1, templateId: "upper", title: "Upper", exercises: [{ planId: "a", name: "Original", sets: [] }] };
    const later = JSON.parse(JSON.stringify(first));
    later.week = 2;
    first.exercises[0].name = "Local rename";
    context.applyWorkoutPlanEdit(first, [first, later]);
    context.propagateExerciseName(first, first.exercises[0], [first, later]);
    assert.equal(later.exercises[0].name, "Original");
    first.templateEndWeek = 2;
    context.prepareWorkoutTemplates([first, later]);
    assert.equal(later.exercises[0].name, "Original");
    first.excludedWeeks = [2];
    const remaining = [first];
    context.prepareWorkoutTemplates(remaining);
    assert.equal(remaining.length, 1);
    context.mirroringEnabled = true;
    context.applyWorkoutPlanEdit(first, [first, later]);
    assert.equal(later.exercises[0].name, "Local rename");
    context.mirroringEnabled = false;
    const single = { ...first, week: 4 };
    context.applyWorkoutPlanEdit(single, [single], true);
    assert.equal(single.templateEndWeek, 4);
  });

  test("color schemes update the device theme and selected choice without changing workouts", () => {
    const schemes = ["red", "magenta", "cyan", "yellow", "orange", "lime"];
    const buttons = schemes.map((scheme) => ({
      tagName: "BUTTON", dataset: { colorScheme: scheme },
      setAttribute(key, value) { this[key] = value; },
    }));
    const body = { dataset: {} };
    const context = loadFunctions({
      COLOR_SCHEMES: schemes,
      document: { body, querySelectorAll: () => buttons },
    }, ["applyColorScheme"]);
    for (const scheme of schemes) {
      context.applyColorScheme(scheme);
      assert.equal(body.dataset.colorScheme, scheme);
      buttons.forEach((button) => {
        assert.equal(button["aria-pressed"], String(button.dataset.colorScheme === scheme));
      });
    }
    assert.throws(() => context.applyColorScheme("unknown"), /Unknown/);
  });
  const start = source.indexOf('const deleteSetDialog =');
  const end = source.indexOf('\ncancelBailButton.addEventListener', start);
  vm.runInContext(source.slice(start, end), context);
  const setPending = () => vm.runInContext(
    'pendingDeleteSet = { workoutId: "workout", exerciseId: "exercise", setId: "set" };', context,
  );
  setPending();
  callbacks["cancel-delete-set:click"]();
  assert.equal(exercise.sets.length, 1);
  assert.equal(recorded, 0);
  setPending();
  callbacks["confirm-delete-set:click"]();
  assert.equal(exercise.sets.length, 0);
  assert.equal(recorded, 1);
});
