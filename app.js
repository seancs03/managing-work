"use strict";

const LEGACY_STORAGE_KEY = "settle.workout.v1";
const PROFILE_STORAGE_PREFIX = "settle.workout.v1.profile.";
const welcomeScreen = document.getElementById("welcome-screen");
const appShell = document.getElementById("app-shell");
const activeProfileName = document.getElementById("active-profile-name");
const switchProfileButton = document.getElementById("switch-profile-button");
const exerciseList = document.getElementById("exercise-list");
const workoutTitle = document.getElementById("workout-title");
const workoutList = document.getElementById("workout-list");
const weekSelect = document.getElementById("week-select");
const workoutContextMenu = document.getElementById("workout-context-menu");
const deleteWorkoutButton = document.getElementById("delete-workout-button");
const addWorkoutForm = document.getElementById("add-workout-form");
const newWorkoutNameInput = document.getElementById("new-workout-name");
const addExerciseForm = document.getElementById("add-exercise-form");
const exerciseNameInput = document.getElementById("exercise-name");
const storageNotice = document.getElementById("storage-notice");
const sessionDate = document.getElementById("session-date");
const workoutAction = document.getElementById("workout-action");
const startOverButton = document.getElementById("start-over-button");
const startOverDialog = document.getElementById("start-over-dialog");
const cancelStartOverButton = document.getElementById("cancel-start-over-button");
const confirmStartOverButton = document.getElementById("confirm-start-over-button");
const shadowButton = document.getElementById("shadow-button");
const shadowDialog = document.getElementById("shadow-dialog");
const shadowForm = document.getElementById("shadow-form");
const shadowWeekSelect = document.getElementById("shadow-week-select");
const shadowWorkoutSelect = document.getElementById("shadow-workout-select");
const clearShadowButton = document.getElementById("clear-shadow-button");
const workoutLayout = document.querySelector(".workout-layout");
const summaryColumn = document.getElementById("summary-column");
const sessionStatusLabel = document.getElementById("session-status-label");
let storageKey = "";

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createWorkout(title, templateId = makeId()) {
  return {
    id: makeId(),
    templateId,
    title,
    week: selectedWeek,
    status: "planned",
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    shadowWorkoutId: null,
    exercises: [],
  };
}

function showNotice(message) {
  storageNotice.textContent = message;
  storageNotice.hidden = false;
}

function normalizeWorkout(source) {
  return {
    id: typeof source.id === "string" ? source.id : makeId(),
    templateId: typeof source.templateId === "string" ? source.templateId : null,
    title: typeof source.title === "string" ? source.title.slice(0, 60) : "Workout",
    status: ["planned", "in-progress", "completed"].includes(source.status) ? source.status : "planned",
    week: Number.isInteger(source.week) && source.week >= 1 && source.week <= 12 ? source.week : 1,
    createdAt: typeof source.createdAt === "string" && !Number.isNaN(Date.parse(source.createdAt))
      ? source.createdAt
      : new Date().toISOString(),
    startedAt: typeof source.startedAt === "string" && !Number.isNaN(Date.parse(source.startedAt))
      ? source.startedAt
      : new Date().toISOString(),
    shadowWorkoutId: typeof source.shadowWorkoutId === "string" ? source.shadowWorkoutId : null,
    exercises: Array.isArray(source.exercises)
      ? source.exercises
        .filter((exercise) => exercise && typeof exercise === "object")
        .map((exercise) => ({
          id: typeof exercise.id === "string" ? exercise.id : makeId(),
          planId: typeof exercise.planId === "string" ? exercise.planId : makeId(),
          name: typeof exercise.name === "string" ? exercise.name.slice(0, 60) : "Exercise",
          sets: Array.isArray(exercise.sets)
            ? exercise.sets
              .filter((set) => set && typeof set === "object")
              .map((set) => ({
                id: typeof set.id === "string" ? set.id : makeId(),
                planId: typeof set.planId === "string" ? set.planId : makeId(),
                weight: set.weight == null ? "" : String(set.weight).trim(),
                reps: set.reps == null ? "" : String(set.reps).trim(),
                rpe: set.rpe == null ? "" : String(set.rpe).trim(),
                llp: set.llp === true,
                llpReps: set.llpReps == null ? "" : String(set.llpReps).trim(),
              }))
            : [],
        }))
      : [],
  };
}

function syncWorkoutPlan(sourceWorkout, allWorkouts, createMissingWeeks = true) {
  sourceWorkout.exercises.forEach((exercise) => {
    exercise.planId ||= makeId();
    exercise.sets.forEach((set) => {
      set.planId ||= makeId();
    });
  });

  let peers = allWorkouts.filter((item) => item.templateId === sourceWorkout.templateId);
  if (createMissingWeeks) {
    for (let week = 1; week <= 12; week += 1) {
      if (peers.some((item) => item.week === week)) continue;
      const peer = createWorkout(sourceWorkout.title, sourceWorkout.templateId);
      peer.week = week;
      peer.exercises = sourceWorkout.exercises.map((exercise) => ({
        id: makeId(),
        planId: exercise.planId,
        name: exercise.name,
        sets: exercise.sets.map((set) => ({
          id: makeId(),
          planId: set.planId,
          weight: "",
          reps: "",
          rpe: "",
          llp: false,
          llpReps: "",
        })),
      }));
      allWorkouts.push(peer);
    }
    peers = allWorkouts.filter((item) => item.templateId === sourceWorkout.templateId);
  }

  peers.forEach((peer) => {
    if (peer === sourceWorkout) return;
    const usedExercises = new Set();
    peer.exercises = sourceWorkout.exercises.map((planExercise, exerciseIndex) => {
      const existingExercise = peer.exercises.find((item) =>
        !usedExercises.has(item)
        && (item.planId === planExercise.planId
          || item.name.trim().toLocaleLowerCase() === planExercise.name.trim().toLocaleLowerCase()),
      ) ?? peer.exercises[exerciseIndex];
      if (existingExercise) usedExercises.add(existingExercise);
      const existingSets = existingExercise?.sets ?? [];
      const usedSets = new Set();
      return {
        id: existingExercise?.id ?? makeId(),
        planId: planExercise.planId,
        name: planExercise.name,
        sets: planExercise.sets.map((planSet, setIndex) => {
          const existingSet = existingSets.find((item) =>
            !usedSets.has(item) && item.planId === planSet.planId,
          ) ?? existingSets[setIndex];
          if (existingSet) usedSets.add(existingSet);
          return existingSet
            ? { ...existingSet, planId: planSet.planId }
            : {
              id: makeId(),
              planId: planSet.planId,
              weight: "",
              reps: "",
              rpe: "",
              llp: false,
              llpReps: "",
            };
        }),
      };
    });
    peer.title = sourceWorkout.title;
  });
}

function prepareWorkoutTemplates(allWorkouts) {
  const originalWorkouts = JSON.stringify(allWorkouts);
  const unassignedByTitle = new Map();
  allWorkouts.forEach((item) => {
    if (item.templateId) return;
    const key = item.title.trim().toLocaleLowerCase();
    if (!unassignedByTitle.has(key)) unassignedByTitle.set(key, []);
    unassignedByTitle.get(key).push(item);
  });
  unassignedByTitle.forEach((group) => {
    const hasDuplicateWeek = group.some(
      (item, index) => group.findIndex((candidate) => candidate.week === item.week) !== index,
    );
    if (hasDuplicateWeek) {
      group.forEach((item) => { item.templateId = makeId(); });
      return;
    }
    const templateId = makeId();
    group.forEach((item) => { item.templateId = templateId; });
  });

  const templates = new Map();
  allWorkouts.forEach((item) => {
    if (!templates.has(item.templateId)) templates.set(item.templateId, []);
    templates.get(item.templateId).push(item);
  });
  templates.forEach((members) => {
    const source = members.find((item) => item.week === 1)
      ?? members.reduce((earliest, item) => item.week < earliest.week ? item : earliest);
    syncWorkoutPlan(source, allWorkouts);
  });
  return JSON.stringify(allWorkouts) !== originalWorkouts;
}

function loadWorkouts() {
  try {
    let stored = localStorage.getItem(storageKey);
    let migratedLegacyStorage = false;
    if (!stored && selectedProfile === "sean") {
      stored = localStorage.getItem(LEGACY_STORAGE_KEY);
      migratedLegacyStorage = Boolean(stored);
    }
    if (!stored) return { workouts: [], selectedWorkoutId: null, selectedWeek: 1 };

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("The saved workout has an unexpected format.");
    }

    if (Array.isArray(parsed.workouts)) {
      const workouts = parsed.workouts
        .filter((item) => item && typeof item === "object")
        .map(normalizeWorkout);
      let needsSave = migratedLegacyStorage
        || workouts.length !== parsed.workouts.length
        || parsed.workouts.some((item) => !item.templateId
          || !Array.isArray(item.exercises)
          || item.exercises.some((exercise) => !exercise?.planId
            || !Array.isArray(exercise.sets)
            || exercise.sets.some((set) => !set?.planId)));
      const previousCount = workouts.length;
      const templatesChanged = prepareWorkoutTemplates(workouts);
      needsSave ||= templatesChanged;
      needsSave ||= workouts.length !== previousCount;
      workouts.forEach((item) => {
        const shadow = workouts.find((source) => source.id === item.shadowWorkoutId);
        if (item.shadowWorkoutId === item.id || !shadow || shadow.templateId !== item.templateId) {
          needsSave ||= item.shadowWorkoutId !== null;
          item.shadowWorkoutId = null;
        }
      });
      const selectedWorkoutId = workouts.some((item) => item.id === parsed.selectedWorkoutId)
        ? parsed.selectedWorkoutId
        : workouts[0]?.id ?? null;
      const selectedWeek = Number.isInteger(parsed.selectedWeek) && parsed.selectedWeek >= 1 && parsed.selectedWeek <= 12
        ? parsed.selectedWeek
        : workouts.find((item) => item.id === selectedWorkoutId)?.week ?? 1;
      return { workouts, selectedWorkoutId, selectedWeek, needsSave };
    }

    if (Array.isArray(parsed.exercises)) {
      const migratedWorkout = normalizeWorkout({ ...parsed, title: parsed.title || "Workout" });
      const workouts = [migratedWorkout];
      prepareWorkoutTemplates(workouts);
      return { workouts, selectedWorkoutId: migratedWorkout.id, selectedWeek: 1, needsSave: true };
    }

    throw new Error("The saved workout has an unexpected format.");
  } catch (error) {
    showNotice(error instanceof SyntaxError
      ? "Your saved workout couldn't be read. A fresh session has been started; the saved data was left unchanged."
      : "Workout storage is unavailable or unreadable. A fresh session has been started.");
    return { workouts: [], selectedWorkoutId: null, selectedWeek: 1 };
  }
}

let selectedProfile = null;
let workouts = [];
let selectedWorkoutId = null;
let selectedWeek = 1;
let workout = null;
let contextWorkoutId = null;

function saveWorkout() {
  if (!storageKey || !selectedProfile) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ workouts, selectedWorkoutId, selectedWeek }));
    setNoticeHidden();
  } catch {
    showNotice("This workout couldn't be saved in this browser. Your current changes are still visible until you leave this page.");
  }
}

function setNoticeHidden() {
  storageNotice.hidden = true;
  storageNotice.textContent = "";
}

function activateProfile(profile) {
  if (!["sean", "kick"].includes(profile)) return;
  selectedProfile = profile;
  storageKey = `${PROFILE_STORAGE_PREFIX}${profile}`;
  const profileState = loadWorkouts();
  workouts = profileState.workouts;
  selectedWorkoutId = profileState.selectedWorkoutId;
  selectedWeek = profileState.selectedWeek;
  workout = workouts.find((item) => item.id === selectedWorkoutId) ?? null;
  activeProfileName.textContent = profile === "sean" ? "Sean" : "Kick";
  welcomeScreen.hidden = true;
  appShell.hidden = false;
  render();
  if (profileState.needsSave) saveWorkout();
  document.getElementById("announcements").textContent = `${activeProfileName.textContent}'s profile loaded.`;
  switchProfileButton.focus();
}

function returnToProfilePicker() {
  if (shadowDialog.open) shadowDialog.close();
  workoutContextMenu.hidden = true;
  contextWorkoutId = null;
  selectedProfile = null;
  storageKey = "";
  workouts = [];
  selectedWorkoutId = null;
  selectedWeek = 1;
  workout = null;
  appShell.hidden = true;
  welcomeScreen.hidden = false;
  welcomeScreen.querySelector("[data-profile]").focus();
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeInput(exercise, set, field, setNumber) {
  const isWeight = field === "weight";
  const isRpe = field === "rpe";
  const isLlpReps = field === "llpReps";
  const input = document.createElement("input");
  input.className = "set-input";
  input.type = isWeight || field === "reps" ? "text" : "number";
  input.inputMode = isRpe ? "decimal" : isLlpReps ? "numeric" : "text";
  if (!isWeight && field !== "reps") input.min = "1";
  if (isRpe) input.max = "10";
  if (!isWeight && field !== "reps") input.step = isRpe ? "0.5" : "1";
  if (isWeight || field === "reps") input.maxLength = 24;
  if (isLlpReps) {
    input.classList.add("llp-reps-input");
  }
  input.value = set[field];
  const shadowSet = findShadowSet(exercise, set);
  const shadowValue = shadowSet?.[field] == null ? "" : String(shadowSet[field]).trim();
  if (set[field] === "" && shadowValue !== "") {
    input.placeholder = shadowValue;
    input.title = `Shadow value: ${shadowValue}`;
  }
  input.dataset.exerciseId = exercise.id;
  input.dataset.setId = set.id;
  input.dataset.field = field;
  input.id = `${set.id}-${field}`;
  const fieldLabel = {
    weight: "weight in kilograms",
    reps: "reps",
    rpe: "RPE from 1 to 10",
    llpReps: "number of long-length partial reps",
  }[field];
  input.setAttribute("aria-label", `Set ${setNumber} for ${exercise.name}, ${fieldLabel}`);
  input.setAttribute("aria-describedby", `${set.id}-${field}-hint`);
  return input;
}

function appendLlpRepsInput(cell, exercise, set, setNumber) {
  const input = makeInput(exercise, set, "llpReps", setNumber);
  const hint = createElement("span", "sr-only", "");
  hint.id = `${set.id}-llpReps-hint`;
  cell.append(input, hint);
  updateInputValidity(input, hint);
}

function getFieldError(field, value) {
  if (String(value).trim() === "") return "";
  if (field === "weight" || field === "reps") {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      if (field === "weight" && numericValue < 0) return "Weight can't be negative.";
      if (field === "reps" && (!Number.isInteger(numericValue) || numericValue < 1)) {
        return "Use a whole number of 1 or more, or enter text.";
      }
    }
    return "";
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return "Enter a valid number.";
  if (field === "llpReps" && (!Number.isInteger(number) || number < 1)) {
    return "Use a whole number of 1 or more.";
  }
  if (field === "rpe" && (number < 1 || number > 10 || !Number.isInteger(number * 2))) {
    return "Use an RPE from 1 to 10 in 0.5 steps.";
  }
  return "";
}

function updateInputValidity(input, hint = document.getElementById(`${input.dataset.setId}-${input.dataset.field}-hint`)) {
  const error = getFieldError(input.dataset.field, input.value);
  input.setAttribute("aria-invalid", error ? "true" : "false");
  if (hint) {
    const shadowNotice = input.value === "" && input.placeholder
      ? `Shadow value ${input.placeholder}. Enter your value to replace it.`
      : "";
    hint.textContent = error || shadowNotice || (input.value === "" ? "Not logged yet" : "Looks good");
    hint.className = error ? "field-hint field-error" : "sr-only";
  }
}

function isSetComplete(set) {
  return set.weight.trim() !== "" && set.reps.trim() !== ""
    && !getFieldError("weight", set.weight)
    && !getFieldError("reps", set.reps);
}

function findShadowSet(exercise, set) {
  if (!workout?.shadowWorkoutId) return null;
  const shadowWorkout = workouts.find((item) => item.id === workout.shadowWorkoutId);
  const shadowExercise = shadowWorkout?.exercises.find(
    (item) => item.planId === exercise.planId,
  );
  return shadowExercise?.sets.find((item) => item.planId === set.planId) ?? null;
}

function getShadowSources(week = null) {
  return workouts.filter((item) => item.id !== workout?.id
    && item.templateId === workout?.templateId
    && (week === null || item.week === week));
}

function renderShadowWorkoutOptions() {
  const sources = getShadowSources();
  shadowWeekSelect.replaceChildren();
  for (let week = 1; week <= 12; week += 1) {
    const option = document.createElement("option");
    option.value = String(week);
    option.textContent = `Week ${week}`;
    shadowWeekSelect.append(option);
  }
  const selectedSource = sources.find((item) => item.id === workout?.shadowWorkoutId);
  const previousWeekSource = sources.find((item) => item.week === workout?.week - 1);
  const defaultWeek = selectedSource?.week ?? previousWeekSource?.week ?? sources[0]?.week ?? workout?.week ?? 1;
  shadowWeekSelect.value = String(defaultWeek);
  shadowWeekSelect.disabled = sources.length === 0;
  renderShadowDayOptions();
  clearShadowButton.hidden = !workout?.shadowWorkoutId;
}

function renderShadowDayOptions() {
  const sources = getShadowSources(Number(shadowWeekSelect.value));
  shadowWorkoutSelect.replaceChildren();
  if (sources.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No matching workout day in this week";
    option.selected = true;
    shadowWorkoutSelect.append(option);
  }
  sources.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `Week ${item.week} — ${item.title}`;
    option.selected = item.id === workout?.shadowWorkoutId;
    shadowWorkoutSelect.append(option);
  });
  shadowWorkoutSelect.disabled = sources.length === 0;
  shadowWorkoutSelect.required = sources.length > 0;
  shadowForm.querySelector('[type="submit"]').disabled = sources.length === 0;
}

function renderWorkoutChoices() {
  workoutList.replaceChildren();
  const weekWorkouts = workouts.filter((item) => item.week === selectedWeek);
  if (weekWorkouts.length === 0) {
    workoutList.append(createElement("span", "week-empty", "No workout days planned for this week yet."));
    return;
  }
  weekWorkouts.forEach((item) => {
    const button = createElement("button", `workout-choice${item.id === selectedWorkoutId ? " is-selected" : ""}`);
    button.type = "button";
    button.dataset.workoutId = item.id;
    button.setAttribute("aria-pressed", item.id === selectedWorkoutId ? "true" : "false");
    button.append(createElement("span", "workout-choice-name", item.title));
    button.append(createElement("span", "workout-choice-status",
      item.status === "in-progress" ? "In progress" : item.status === "completed" ? "Completed" : "Planned"));
    workoutList.append(button);
  });
}

function closeWorkoutContextMenu(returnFocus = false) {
  workoutContextMenu.hidden = true;
  if (returnFocus) {
    workoutList.querySelector(`[data-workout-id="${contextWorkoutId}"]`)?.focus();
  }
  contextWorkoutId = null;
}

function openWorkoutContextMenu(button, x, y) {
  contextWorkoutId = button.dataset.workoutId;
  workoutContextMenu.hidden = false;
  const bounds = workoutContextMenu.getBoundingClientRect();
  workoutContextMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
  workoutContextMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
  deleteWorkoutButton.focus();
}

function renderWeekOptions() {
  weekSelect.replaceChildren();
  for (let week = 1; week <= 12; week += 1) {
    const option = document.createElement("option");
    option.value = String(week);
    option.textContent = `Week ${week}`;
    option.selected = week === selectedWeek;
    weekSelect.append(option);
  }
}

function renderSetRow(exercise, set, index) {
  const row = document.createElement("tr");
  const setNumber = index + 1;
  const numberCell = document.createElement("td");
  numberCell.append(createElement("span", "set-number", String(setNumber)));
  row.append(numberCell);

  for (const field of ["weight", "reps", "rpe"]) {
    const cell = document.createElement("td");
    const input = makeInput(exercise, set, field, setNumber);
    const hint = createElement("span", "sr-only", "");
    hint.id = `${set.id}-${field}-hint`;
    cell.append(input, hint);
    updateInputValidity(input, hint);
    row.append(cell);
  }

  const llpCell = document.createElement("td");
  llpCell.className = "llp-cell";
  const llpCheckbox = document.createElement("input");
  llpCheckbox.className = "llp-checkbox";
  llpCheckbox.type = "checkbox";
  llpCheckbox.checked = set.llp === true;
  llpCheckbox.dataset.exerciseId = exercise.id;
  llpCheckbox.dataset.setId = set.id;
  llpCheckbox.dataset.llp = "true";
  llpCheckbox.setAttribute("aria-label", `Long-length partials for set ${setNumber} of ${exercise.name}`);
  llpCell.append(llpCheckbox);
  if (set.llp) {
    appendLlpRepsInput(llpCell, exercise, set, setNumber);
  }
  row.append(llpCell);

  const actionCell = document.createElement("td");
  const removeButton = createElement("button", "icon-button remove-set", "×");
  removeButton.type = "button";
  removeButton.dataset.action = "remove-set";
  removeButton.dataset.exerciseId = exercise.id;
  removeButton.dataset.setId = set.id;
  removeButton.setAttribute("aria-label", `Remove set ${setNumber} from ${exercise.name}`);
  actionCell.append(removeButton);
  row.append(actionCell);
  return row;
}

function renderExerciseCard(exercise, index) {
  const card = createElement("article", "exercise-card");
  const header = createElement("header", "exercise-header");
  const titleWrap = createElement("div", "exercise-title-wrap");
  titleWrap.append(createElement("span", "exercise-index", String(index + 1)));

  const headingWrap = createElement("div", "exercise-heading-text");
  const nameLabel = createElement("label", "sr-only", "Exercise name");
  nameLabel.htmlFor = `exercise-name-${exercise.id}`;
  const nameInput = document.createElement("input");
  nameInput.className = "exercise-name-editor";
  nameInput.type = "text";
  nameInput.maxLength = 60;
  nameInput.value = exercise.name;
  nameInput.id = `exercise-name-${exercise.id}`;
  nameInput.dataset.exerciseId = exercise.id;
  nameInput.dataset.exerciseName = "true";
  nameInput.setAttribute("aria-label", `Exercise ${index + 1} name`);
  const heading = createElement("h2", "exercise-name-heading");
  heading.setAttribute("aria-label", `Exercise: ${exercise.name || "unnamed exercise"}`);
  heading.append(nameLabel, nameInput);
  const progress = createElement("span", "exercise-progress");
  progress.id = `progress-${exercise.id}`;
  headingWrap.append(heading, progress);
  titleWrap.append(headingWrap);
  header.append(titleWrap);

  const removeExercise = createElement("button", "icon-button", "×");
  removeExercise.type = "button";
  removeExercise.dataset.action = "remove-exercise";
  removeExercise.dataset.exerciseId = exercise.id;
  removeExercise.setAttribute("aria-label", `Remove ${exercise.name || "exercise"}`);
  header.append(removeExercise);

  const tableWrap = createElement("div", "table-wrap");
  const table = createElement("table", "sets-table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const label of ["SET", "WEIGHT (KG)", "REPS", "RPE", "LLP", ""]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    if (label === "LLP") cell.title = "Long-length partials";
    if (label) cell.textContent = label;
    else {
      const hiddenLabel = createElement("span", "sr-only", "Actions");
      cell.append(hiddenLabel);
    }
    headerRow.append(cell);
  }
  thead.append(headerRow);
  const tbody = document.createElement("tbody");

  if (exercise.sets.length === 0) {
    const row = document.createElement("tr");
    const cell = createElement("td", "empty-sets-cell", "No sets yet — add one when you're ready.");
    cell.colSpan = 6;
    row.append(cell);
    tbody.append(row);
  } else {
    exercise.sets.forEach((set, setIndex) => tbody.append(renderSetRow(exercise, set, setIndex)));
  }

  table.append(thead, tbody);
  tableWrap.append(table);
  const footer = createElement("footer", "exercise-footer");
  const addSet = createElement("button", "add-set-button");
  addSet.id = `add-set-${exercise.id}`;
  addSet.type = "button";
  addSet.dataset.action = "add-set";
  addSet.dataset.exerciseId = exercise.id;
  addSet.append(createElement("span", "", "+"), document.createTextNode("Add set"));
  footer.append(addSet);
  card.append(header, tableWrap, footer);
  card.querySelectorAll("input[data-llp]").forEach((llpCheckbox) => {
    const setIndex = exercise.sets.findIndex((set) => set.id === llpCheckbox.dataset.setId);
    llpCheckbox.setAttribute("aria-label", `Long-length partials for set ${setIndex + 1} of ${exercise.name || "unnamed exercise"}`);
  });
  return card;
}

function renderExercises() {
  exerciseList.replaceChildren();
  if (!workout) {
    const empty = createElement("div", "empty-state");
    empty.append(createElement("span", "empty-icon", "+"));
    empty.append(createElement("h2", "", "Add a workout day"));
    empty.append(createElement("p", "", "Create a workout such as “Upper day” to start planning your exercises."));
    exerciseList.append(empty);
    return;
  }
  if (workout.exercises.length === 0) {
    const empty = createElement("div", "empty-state");
    empty.append(createElement("span", "empty-icon", "+"));
    empty.append(createElement("h2", "", "Plan your exercises"));
    empty.append(createElement("p", "", "Add the exercises and sets for this day. Start the workout when you're ready to train."));
    exerciseList.append(empty);
    return;
  }
  workout.exercises.forEach((exercise, index) => exerciseList.append(renderExerciseCard(exercise, index)));
  updateExerciseProgress();
}

function updateExerciseProgress() {
  if (!workout) return;
  for (const exercise of workout.exercises) {
    const logged = exercise.sets.filter(isSetComplete).length;
    const progress = document.getElementById(`progress-${exercise.id}`);
    if (progress) progress.textContent = `${logged} of ${exercise.sets.length} ${exercise.sets.length === 1 ? "set" : "sets"} logged`;
  }
}

function renderSummary() {
  const exercises = workout?.exercises ?? [];
  document.getElementById("exercise-count").textContent = String(exercises.length);
  const completedSets = exercises.flatMap((exercise) => exercise.sets).filter(isSetComplete);
  document.getElementById("set-count").textContent = String(completedSets.length);
  const totalVolume = completedSets.reduce((total, set) => {
    const weight = Number(set.weight);
    const reps = Number(set.reps);
    return Number.isFinite(weight) && Number.isFinite(reps) ? total + weight * reps : total;
  }, 0);
  const volume = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(totalVolume);
  const volumeNode = document.getElementById("total-volume");
  volumeNode.replaceChildren(document.createTextNode(volume), document.createTextNode(" "));
  volumeNode.append(createElement("span", "", "kg"));
  updateExerciseProgress();
}

function render() {
  renderWeekOptions();
  renderWorkoutChoices();
  workoutTitle.value = workout?.title ?? "";
  workoutTitle.disabled = !workout;
  sessionDate.textContent = workout ? formatDate(workout.startedAt) : "";
  sessionStatusLabel.textContent = workout?.status === "in-progress"
    ? "WORKOUT IN PROGRESS"
    : workout?.status === "completed" ? "WORKOUT COMPLETE" : "WORKOUT PLAN";
  workoutAction.disabled = !workout || workout.exercises.every((exercise) => exercise.sets.length === 0);
  workoutAction.hidden = !workout;
  workoutAction.textContent = workout?.status === "in-progress"
    ? "Finish workout"
    : workout?.status === "completed" ? "Resume workout" : "Start workout";
  startOverButton.hidden = !workout || workout.status === "planned";
  shadowButton.hidden = !workout;
  shadowButton.title = workout?.shadowWorkoutId
    ? `Shadowing ${workouts.find((item) => item.id === workout.shadowWorkoutId)?.title ?? "another workout"}`
    : "Choose a workout to shadow";
  summaryColumn.hidden = workout?.status === "in-progress";
  workoutLayout.classList.toggle("is-training", workout?.status === "in-progress");
  addExerciseForm.hidden = !workout || workout.status === "in-progress";
  renderExercises();
  renderSummary();
}

function selectWorkout(id) {
  selectedWorkoutId = id;
  workout = workouts.find((item) => item.id === selectedWorkoutId) ?? null;
  render();
  saveWorkout();
}

weekSelect.addEventListener("change", () => {
  selectedWeek = Number(weekSelect.value);
  if (workout?.week !== selectedWeek) {
    workout = workouts.find((item) => item.week === selectedWeek) ?? null;
    selectedWorkoutId = workout?.id ?? null;
  }
  render();
  saveWorkout();
});

function findNextWorkoutInput(currentInput = null) {
  const inputs = Array.from(exerciseList.querySelectorAll("input[data-field]"));
  if (inputs.length === 0) return null;

  const currentIndex = currentInput ? inputs.indexOf(currentInput) : -1;
  for (let offset = 1; offset <= inputs.length; offset += 1) {
    const index = (currentIndex + offset) % inputs.length;
    const input = inputs[index];
    if (input === currentInput) continue;
    if (input.value.trim() === "" || getFieldError(input.dataset.field, input.value)) return input;
  }
  return null;
}

function focusNextWorkoutInput(currentInput) {
  if (!workout || workout.status !== "in-progress") return;
  const nextInput = findNextWorkoutInput(currentInput);
  if (nextInput) {
    nextInput.focus();
    return;
  }
  document.getElementById("announcements").textContent = "All planned sets are logged.";
}

addWorkoutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = newWorkoutNameInput.value.trim();
  if (!title) {
    newWorkoutNameInput.focus();
    return;
  }
  workout = createWorkout(title.slice(0, 60));
  workouts.push(workout);
  syncWorkoutPlan(workout, workouts);
  selectedWorkoutId = workout.id;
  newWorkoutNameInput.value = "";
  render();
  saveWorkout();
  document.getElementById("announcements").textContent = `${title} added to all 12 weeks.`;
  exerciseNameInput.focus();
});

workoutList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-workout-id]");
  if (!button) return;
  closeWorkoutContextMenu();
  if (button.dataset.workoutId === selectedWorkoutId) return;
  selectWorkout(button.dataset.workoutId);
});

workoutList.addEventListener("contextmenu", (event) => {
  const button = event.target.closest("button[data-workout-id]");
  if (!button) return;
  event.preventDefault();
  openWorkoutContextMenu(button, event.clientX, event.clientY);
});

workoutList.addEventListener("keydown", (event) => {
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
  const button = event.target.closest("button[data-workout-id]");
  if (!button) return;
  event.preventDefault();
  const bounds = button.getBoundingClientRect();
  openWorkoutContextMenu(button, bounds.left, bounds.bottom);
});

deleteWorkoutButton.addEventListener("click", () => {
  if (!contextWorkoutId) return;
  const deletedWorkout = workouts.find((item) => item.id === contextWorkoutId);
  const deletedTemplateId = deletedWorkout?.templateId;
  const deletedWorkoutIds = new Set(
    workouts.filter((item) => item.templateId === deletedTemplateId).map((item) => item.id),
  );
  workouts = workouts.filter((item) => !deletedWorkoutIds.has(item.id));
  workouts.forEach((item) => {
    if (deletedWorkoutIds.has(item.shadowWorkoutId)) item.shadowWorkoutId = null;
  });
  if (deletedWorkoutIds.has(selectedWorkoutId)) {
    workout = workouts.find((item) => item.week === selectedWeek) ?? null;
    selectedWorkoutId = workout?.id ?? null;
  }
  contextWorkoutId = null;
  workoutContextMenu.hidden = true;
  render();
  saveWorkout();
  document.getElementById("announcements").textContent =
    `${deletedWorkout?.title ?? "Workout"} deleted from all 12 weeks.`;
  (workoutList.querySelector(".workout-choice") || newWorkoutNameInput).focus();
});

shadowButton.addEventListener("click", () => {
  if (!workout) return;
  renderShadowWorkoutOptions();
  shadowDialog.showModal();
  if (!shadowWorkoutSelect.disabled) shadowWorkoutSelect.focus();
});

shadowWeekSelect.addEventListener("change", renderShadowDayOptions);

shadowForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const sourceWorkout = workouts.find(
    (item) => item.id === shadowWorkoutSelect.value
      && item.id !== workout?.id
      && item.templateId === workout?.templateId,
  );
  if (!workout || !sourceWorkout) return;
  workout.shadowWorkoutId = sourceWorkout.id;
  shadowDialog.close();
  render();
  saveWorkout();
  document.getElementById("announcements").textContent =
    `Shadowing ${workouts.find((item) => item.id === workout.shadowWorkoutId)?.title ?? "workout"}.`;
  shadowButton.focus();
});

clearShadowButton.addEventListener("click", () => {
  if (!workout) return;
  workout.shadowWorkoutId = null;
  shadowDialog.close();
  render();
  saveWorkout();
  document.getElementById("announcements").textContent = "Workout shadow removed.";
  shadowButton.focus();
});

shadowDialog.querySelector("[data-shadow-cancel]").addEventListener("click", () => {
  shadowDialog.close();
  shadowButton.focus();
});

document.addEventListener("click", (event) => {
  if (!workoutContextMenu.hidden && !workoutContextMenu.contains(event.target)) {
    closeWorkoutContextMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !workoutContextMenu.hidden) {
    event.preventDefault();
    closeWorkoutContextMenu(true);
  }
});

workoutTitle.addEventListener("input", () => {
  if (!workout) return;
  workout.title = workoutTitle.value;
  syncWorkoutPlan(workout, workouts, false);
  renderWorkoutChoices();
  saveWorkout();
});

workoutAction.addEventListener("click", () => {
  if (!workout || workoutAction.disabled) return;
  if (workout.status === "in-progress") {
    workout.status = "completed";
    document.getElementById("announcements").textContent = `${workout.title} finished.`;
    render();
    saveWorkout();
    return;
  }
  workout.status = "in-progress";
  workout.startedAt = new Date().toISOString();
  render();
  saveWorkout();
  const firstInput = findNextWorkoutInput();
  if (firstInput) firstInput.focus();
  else document.getElementById("announcements").textContent = "All planned sets are logged.";
});

startOverButton.addEventListener("click", () => {
  if (!workout) return;
  startOverDialog.showModal();
  cancelStartOverButton.focus();
});

cancelStartOverButton.addEventListener("click", () => {
  startOverDialog.close();
  startOverButton.focus();
});

confirmStartOverButton.addEventListener("click", () => {
  if (!workout) return;
  startOverDialog.close();
  workout.exercises.forEach((exercise) => {
    exercise.sets.forEach((set) => {
      set.weight = "";
      set.reps = "";
      set.rpe = "";
      set.llp = false;
      set.llpReps = "";
    });
  });
  workout.status = "planned";
  workout.startedAt = new Date().toISOString();
  render();
  saveWorkout();
  document.getElementById("announcements").textContent = `${workout.title} reset.`;
  workoutAction.focus();
});

addExerciseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!workout) return;
  const name = exerciseNameInput.value.trim();
  if (!name) {
    exerciseNameInput.focus();
    return;
  }
  workout.exercises.push({
    id: makeId(),
    planId: makeId(),
    name: name.slice(0, 60),
    sets: [{ id: makeId(), planId: makeId(), weight: "", reps: "", rpe: "", llp: false, llpReps: "" }],
  });
  syncWorkoutPlan(workout, workouts, false);
  exerciseNameInput.value = "";
  setNoticeHidden();
  render();
  saveWorkout();
  document.getElementById("announcements").textContent = `${name} added.`;
  exerciseNameInput.focus();
});

exerciseList.addEventListener("input", (event) => {
  const input = event.target.closest("input[data-field]");
  if (input) {
    const exercise = workout.exercises.find((item) => item.id === input.dataset.exerciseId);
    const set = exercise?.sets.find((item) => item.id === input.dataset.setId);
    if (!set) return;
    set[input.dataset.field] = input.value;
    updateInputValidity(input);
    renderSummary();
    saveWorkout();
    return;
  }

  const nameInput = event.target.closest("input[data-exercise-name]");
  if (!nameInput) return;
  const exercise = workout.exercises.find((item) => item.id === nameInput.dataset.exerciseId);
  if (!exercise) return;
  exercise.name = nameInput.value.slice(0, 60);
  syncWorkoutPlan(workout, workouts, false);
  const removeButton = nameInput.closest(".exercise-card").querySelector('[data-action="remove-exercise"]');
  removeButton.setAttribute("aria-label", `Remove ${exercise.name || "exercise"}`);
  const card = nameInput.closest(".exercise-card");
  const heading = card.querySelector(".exercise-name-heading");
  heading.setAttribute("aria-label", `Exercise: ${exercise.name || "unnamed exercise"}`);
  card.querySelectorAll("input[data-field]").forEach((setInput) => {
    const setIndex = exercise.sets.findIndex((set) => set.id === setInput.dataset.setId);
    const fieldLabel = {
      weight: "weight in kilograms",
      reps: "reps",
      rpe: "RPE from 1 to 10",
      llpReps: "number of long-length partial reps",
    }[setInput.dataset.field];
    setInput.setAttribute("aria-label", `Set ${setIndex + 1} for ${exercise.name || "unnamed exercise"}, ${fieldLabel}`);
  });
  card.querySelectorAll(".remove-set").forEach((removeSetButton) => {
    const setIndex = exercise.sets.findIndex((set) => set.id === removeSetButton.dataset.setId);
    removeSetButton.setAttribute("aria-label", `Remove set ${setIndex + 1} from ${exercise.name || "unnamed exercise"}`);
  });
  nameInput.setAttribute("aria-label", `Exercise ${workout.exercises.indexOf(exercise) + 1} name`);
  saveWorkout();
});

exerciseList.addEventListener("change", (event) => {
  const input = event.target.closest("input[data-field]");
  if (!input || getFieldError(input.dataset.field, input.value)) return;
  if (["weight", "reps", "rpe", "llpReps"].includes(input.dataset.field)) {
    focusNextWorkoutInput(input);
  }
});

exerciseList.addEventListener("keydown", (event) => {
  const input = event.target.closest("input[data-field]");
  if (!input || event.key !== "Enter" || getFieldError(input.dataset.field, input.value)) return;
  if (["weight", "reps", "rpe", "llpReps"].includes(input.dataset.field)) {
    event.preventDefault();
    focusNextWorkoutInput(input);
  }
});

exerciseList.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[data-llp]");
  if (!checkbox) return;
  const exercise = workout.exercises.find((item) => item.id === checkbox.dataset.exerciseId);
  const set = exercise?.sets.find((item) => item.id === checkbox.dataset.setId);
  if (!set) return;
  set.llp = checkbox.checked;
  saveWorkout();
  const cell = checkbox.closest(".llp-cell");
  const setIndex = exercise.sets.indexOf(set);
  const numberField = cell.querySelector("input[data-field='llpReps']");
  if (set.llp && !numberField) {
    appendLlpRepsInput(cell, exercise, set, setIndex + 1);
    cell.querySelector("input[data-field='llpReps']").focus();
  } else if (!set.llp && numberField) {
    numberField.remove();
    checkbox.focus();
  }
  checkbox.setAttribute("aria-label", `Long-length partials for set ${setIndex + 1} of ${exercise.name || "unnamed exercise"}`);
});

exerciseList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const exercise = workout.exercises.find((item) => item.id === button.dataset.exerciseId);
  if (!exercise) return;

  let focusId = "";
  let announcement = "";
  if (button.dataset.action === "add-set") {
    const set = { id: makeId(), planId: makeId(), weight: "", reps: "", rpe: "", llp: false, llpReps: "" };
    exercise.sets.push(set);
    syncWorkoutPlan(workout, workouts, false);
    focusId = `${set.id}-weight`;
    announcement = `Set ${exercise.sets.length} added to ${exercise.name}.`;
  } else if (button.dataset.action === "remove-set") {
    const removedIndex = exercise.sets.findIndex((set) => set.id === button.dataset.setId);
    exercise.sets = exercise.sets.filter((set) => set.id !== button.dataset.setId);
    syncWorkoutPlan(workout, workouts, false);
    const nextSet = exercise.sets[Math.min(removedIndex, exercise.sets.length - 1)];
    focusId = nextSet ? `${nextSet.id}-weight` : `add-set-${exercise.id}`;
    announcement = `Set removed from ${exercise.name}.`;
  } else if (button.dataset.action === "remove-exercise") {
    const removedIndex = workout.exercises.indexOf(exercise);
    workout.exercises = workout.exercises.filter((item) => item.id !== exercise.id);
    syncWorkoutPlan(workout, workouts, false);
    const nextExercise = workout.exercises[Math.min(removedIndex, workout.exercises.length - 1)];
    focusId = nextExercise ? `exercise-name-${nextExercise.id}` : "";
    announcement = `${exercise.name || "Exercise"} removed.`;
  } else {
    return;
  }

  render();
  saveWorkout();
  document.getElementById("announcements").textContent = announcement;
  const focusTarget = focusId && document.getElementById(focusId);
  (focusTarget || exerciseNameInput).focus();
});

welcomeScreen.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-profile]");
  if (button) activateProfile(button.dataset.profile);
});

switchProfileButton.addEventListener("click", returnToProfilePicker);
