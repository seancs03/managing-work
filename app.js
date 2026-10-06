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
const workoutPlanner = document.querySelector(".workout-planner");
const weekSelect = document.getElementById("week-select");
const workoutContextMenu = document.getElementById("workout-context-menu");
const deleteWorkoutButton = document.getElementById("delete-workout-button");
const deleteWorkoutDayButton = document.getElementById("delete-workout-day-button");
const deleteWorkoutDialog = document.getElementById("delete-workout-dialog");
const deleteWorkoutDialogTitle = document.getElementById("delete-workout-dialog-title");
const cancelDeleteWorkoutButton = document.getElementById("cancel-delete-workout-button");
const confirmDeleteWorkoutButton = document.getElementById("confirm-delete-workout-button");
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
const finishWorkoutDialog = document.getElementById("finish-workout-dialog");
const finishWithoutProofButton = document.getElementById("finish-without-proof-button");
const finishWithProofButton = document.getElementById("finish-with-proof-button");
const shadowButton = document.getElementById("shadow-button");
const shadowDialog = document.getElementById("shadow-dialog");
const shadowForm = document.getElementById("shadow-form");
const shadowWeekSelect = document.getElementById("shadow-week-select");
const clearShadowButton = document.getElementById("clear-shadow-button");
const bailDialog = document.getElementById("bail-dialog");
const cancelBailButton = document.getElementById("cancel-bail-button");
const confirmBailButton = document.getElementById("confirm-bail-button");
const deleteExerciseDialog = document.getElementById("delete-exercise-dialog");
const deleteExerciseDialogTitle = document.getElementById("delete-exercise-dialog-title");
const cancelDeleteExerciseButton = document.getElementById("cancel-delete-exercise-button");
const confirmDeleteExerciseButton = document.getElementById("confirm-delete-exercise-button");
const workoutLayout = document.querySelector(".workout-layout");
const sessionNotesSection = document.getElementById("session-notes");
const sessionNoteInputs = Array.from(document.querySelectorAll("[data-session-note]"));
const sessionStatusLabel = document.getElementById("session-status-label");
let storageKey = "";
let pendingBailExerciseId = null;
let pendingDeleteExerciseId = null;
let pendingDeleteWorkoutId = null;
let pendingDeleteWorkoutReturnFocus = null;

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createWorkout(title, templateId = makeId(), templateStartWeek = selectedWeek) {
  return {
    id: makeId(),
    templateId,
    templateStartWeek,
    planCustomized: false,
    title,
    week: selectedWeek,
    status: "planned",
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    shadowWorkoutId: null,
    sessionNotes: ["", ""],
    exercises: [],
  };
}

function showNotice(message) {
  storageNotice.textContent = message;
  storageNotice.hidden = false;
}

function pdfSafeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

function buildWorkoutProofPdf(sourceWorkout) {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 44;
  const pages = [];
  let commands = [];
  let y = pageHeight - 52;

  const addText = (text, x, top, size = 10, bold = false) => {
    const safeText = pdfSafeText(text)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
    commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${top} Td (${safeText}) Tj ET`);
  };
  const addRule = (top) => {
    commands.push(`0.78 G 1 w ${margin} ${top} m ${pageWidth - margin} ${top} l S 0 G`);
  };
  const newPage = () => {
    if (commands.length) pages.push(commands.join("\n"));
    commands = [];
    y = pageHeight - 52;
  };
  const ensureSpace = (height) => {
    if (y - height < margin) newPage();
  };

  addText(sourceWorkout.title || "Workout", margin, y, 20, true);
  y -= 22;
  addText(`Week ${sourceWorkout.week} | ${formatDate(sourceWorkout.startedAt)}`, margin, y, 10);
  y -= 18;
  addRule(y);
  y -= 22;

  const columns = [
    { title: "Set", x: 52 },
    { title: "Weight", x: 122 },
    { title: "Reps", x: 246 },
    { title: "RPE", x: 336 },
    { title: "LLP reps", x: 418 },
  ];
  sourceWorkout.exercises.forEach((exercise, exerciseIndex) => {
    ensureSpace(72);
    addText(`Exercise ${exerciseIndex + 1}: ${exercise.name || "Exercise"}`, margin, y, 13, true);
    y -= 19;
    columns.forEach((column) => addText(column.title, column.x, y, 9, true));
    y -= 7;
    addRule(y);
    y -= 15;
    exercise.sets.forEach((set, index) => {
      ensureSpace(19);
      const values = [
        String(index + 1),
        (set.weight || "-").slice(0, 18),
        (set.reps || "-").slice(0, 12),
        (set.rpe || "-").slice(0, 12),
        (set.llp ? (set.llpReps || "-") : "-").slice(0, 18),
      ];
      values.forEach((value, valueIndex) => addText(value, columns[valueIndex].x, y, 10));
      y -= 18;
    });
    y -= 10;
  });

  const notes = (sourceWorkout.sessionNotes || []).filter((note) => note.trim());
  if (notes.length) {
    ensureSpace(30 + notes.length * 16);
    addRule(y);
    y -= 20;
    addText("Session notes", margin, y, 12, true);
    y -= 18;
    notes.forEach((note) => {
      const line = pdfSafeText(note);
      const chunks = line.match(/.{1,85}(?:\s|$)|.{1,85}/g) || [line];
      chunks.forEach((chunk) => {
        ensureSpace(16);
        addText(chunk.trim(), margin, y, 9);
        y -= 14;
      });
    });
  }
  if (commands.length) pages.push(commands.join("\n"));

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  const pageRefs = [];
  pages.forEach((content, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    pageRefs.push(`${pageId} 0 R`);
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId - 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function downloadWorkoutProof(sourceWorkout) {
  const pdf = buildWorkoutProofPdf(sourceWorkout);
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  const safeTitle = pdfSafeText(sourceWorkout.title || "workout")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "workout";
  link.href = url;
  link.download = `${safeTitle}-week-${sourceWorkout.week}-proof.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeWorkout(source) {
  return {
    id: typeof source.id === "string" ? source.id : makeId(),
    templateId: typeof source.templateId === "string" ? source.templateId : null,
    templateStartWeek: Number.isInteger(source.templateStartWeek)
      && source.templateStartWeek >= 1
      && source.templateStartWeek <= 12
      ? source.templateStartWeek
      : null,
    planCustomized: source.planCustomized === true,
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
    sessionNotes: Array.isArray(source.sessionNotes)
      ? Array.from({ length: 2 }, (_, index) => (
        typeof source.sessionNotes[index] === "string" ? source.sessionNotes[index].slice(0, 500) : ""
      ))
      : ["", ""],
    exercises: Array.isArray(source.exercises)
      ? source.exercises
        .filter((exercise) => exercise && typeof exercise === "object")
        .map((exercise) => ({
          id: typeof exercise.id === "string" ? exercise.id : makeId(),
          planId: typeof exercise.planId === "string" ? exercise.planId : makeId(),
          name: typeof exercise.name === "string" ? exercise.name.slice(0, 60) : "Exercise",
          bailed: exercise.bailed === true,
          bailSnapshot: Array.isArray(exercise.bailSnapshot)
            ? exercise.bailSnapshot
              .filter((set) => set && typeof set === "object")
              .map((set) => ({
                id: typeof set.id === "string" ? set.id : "",
                weight: set.weight == null ? "" : String(set.weight).trim(),
                reps: set.reps == null ? "" : String(set.reps).trim(),
                rpe: set.rpe == null ? "" : String(set.rpe).trim(),
                llp: set.llp === true,
                llpReps: set.llpReps == null ? "" : String(set.llpReps).trim(),
              }))
            : null,
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
  const templateStartWeek = sourceWorkout.templateStartWeek ?? sourceWorkout.week;
  sourceWorkout.templateStartWeek = templateStartWeek;
  if (sourceWorkout.week !== templateStartWeek) {
    sourceWorkout.planCustomized = true;
    return false;
  }

  sourceWorkout.exercises.forEach((exercise) => {
    exercise.planId ||= makeId();
    exercise.sets.forEach((set) => {
      set.planId ||= makeId();
    });
  });

  let peers = allWorkouts.filter((item) => item.templateId === sourceWorkout.templateId);
  if (createMissingWeeks) {
    for (let week = templateStartWeek; week <= 12; week += 1) {
      if (peers.some((item) => item.week === week)) continue;
      const peer = createWorkout(sourceWorkout.title, sourceWorkout.templateId, templateStartWeek);
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
    if (peer === sourceWorkout || peer.week <= templateStartWeek || peer.planCustomized) return;
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
        bailed: existingExercise?.bailed === true,
        bailSnapshot: existingExercise?.bailSnapshot ?? null,
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
    peer.templateStartWeek = templateStartWeek;
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
    const templateStartWeek = source.week;
    members.forEach((item) => {
      item.templateStartWeek = templateStartWeek;
    });
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
  input.type = "text";
  input.inputMode = isRpe ? "decimal" : isLlpReps || field === "reps" ? "numeric" : "text";
  input.enterKeyHint = "next";
  if (!isWeight && field !== "reps") input.min = "1";
  if (isRpe) input.max = "10";
  if (!isWeight && field !== "reps") input.step = isRpe ? "0.5" : "1";
  if (isWeight) input.maxLength = 24;
  if (isLlpReps) {
    input.classList.add("llp-reps-input");
  }
  input.value = set[field];
  input.disabled = exercise.bailed === true;
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
  if (String(value).trim().toLocaleUpperCase() === "X") return "";
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
    && item.week !== workout?.week
    && (week === null || item.week === week));
}

function renderShadowWeekOptions() {
  const sources = getShadowSources();
  shadowWeekSelect.replaceChildren();
  const availableWeeks = [...new Set(sources.map((item) => item.week))].sort((a, b) => a - b);
  for (const week of availableWeeks) {
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
  shadowForm.querySelector('[type="submit"]').disabled = sources.length === 0;
  clearShadowButton.hidden = !workout?.shadowWorkoutId;
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
  const contextWorkout = workouts.find((item) => item.id === contextWorkoutId);
  deleteWorkoutButton.textContent = contextWorkout?.week === 1
    ? "Delete day from all weeks"
    : `Delete day from Week ${contextWorkout?.week ?? selectedWeek}`;
  workoutContextMenu.hidden = false;
  const bounds = workoutContextMenu.getBoundingClientRect();
  workoutContextMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
  workoutContextMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
  deleteWorkoutButton.focus();
}

function openDeleteWorkoutDialog(workoutId, returnFocus = null) {
  const targetWorkout = workouts.find((item) => item.id === workoutId);
  if (!targetWorkout) return;
  pendingDeleteWorkoutId = workoutId;
  pendingDeleteWorkoutReturnFocus = returnFocus;
  deleteWorkoutDialogTitle.textContent = targetWorkout.week === 1
    ? `Delete ${targetWorkout.title} from all 12 weeks?`
    : `Delete ${targetWorkout.title} from Week ${targetWorkout.week}?`;
  deleteWorkoutDialog.showModal();
  cancelDeleteWorkoutButton.focus();
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
  llpCheckbox.disabled = exercise.bailed === true;
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
  nameInput.disabled = exercise.bailed === true;
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

  const headerActions = createElement("div", "exercise-header-actions");
  const bailButton = createElement(
    "button",
    `bail-exercise-button${exercise.bailed ? " is-bailed" : ""}`,
    exercise.bailed ? "UNDO BAIL" : "BAIL",
  );
  bailButton.type = "button";
  bailButton.dataset.action = "bail-exercise";
  bailButton.dataset.exerciseId = exercise.id;
  bailButton.setAttribute(
    "aria-label",
    exercise.bailed ? `Undo bail for ${exercise.name}` : `Mark ${exercise.name} as bailed`,
  );
  headerActions.append(bailButton);

  const removeExercise = createElement("button", "icon-button", "×");
  removeExercise.type = "button";
  removeExercise.dataset.action = "remove-exercise";
  removeExercise.dataset.exerciseId = exercise.id;
  removeExercise.setAttribute("aria-label", `Remove ${exercise.name || "exercise"}`);
  headerActions.append(removeExercise);
  header.append(headerActions);

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
  addSet.disabled = exercise.bailed === true;
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

function render() {
  workoutPlanner.hidden = workout?.status === "in-progress";
  renderWeekOptions();
  renderWorkoutChoices();
  workoutTitle.value = workout?.title ?? "";
  workoutTitle.disabled = !workout;
  deleteWorkoutDayButton.hidden = !workout;
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
  shadowButton.textContent = workout?.shadowWorkoutId ? "Remove shadow" : "Shadow";
  shadowButton.title = workout?.shadowWorkoutId
    ? `Shadowing ${workouts.find((item) => item.id === workout.shadowWorkoutId)?.title ?? "another workout"}`
    : "Choose a workout to shadow";
  deleteWorkoutDayButton.title = workout?.week === 1
    ? "Delete this workout day from all 12 weeks"
    : `Delete this workout day from Week ${workout?.week ?? ""}`;
  deleteWorkoutDayButton.setAttribute(
    "aria-label",
    workout?.week === 1
      ? "Delete workout day from all 12 weeks"
      : `Delete workout day from Week ${workout?.week ?? ""}`,
  );
  sessionNotesSection.hidden = !workout;
  sessionNoteInputs.forEach((input, index) => {
    input.value = workout?.sessionNotes[index] ?? "";
  });
  workoutLayout.classList.toggle("is-training", workout?.status === "in-progress");
  addExerciseForm.hidden = !workout || workout.status === "in-progress";
  renderExercises();
  updateExerciseProgress();
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
  const inputs = Array.from(exerciseList.querySelectorAll("input[data-field]"))
    .filter((input) => !input.disabled);
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
  document.getElementById("announcements").textContent = selectedWeek === 1
    ? `${title} added to all 12 weeks.`
    : selectedWeek < 12
      ? `${title} added to Week ${selectedWeek} and mirrored to Weeks ${selectedWeek + 1}-12.`
      : `${title} added to Week ${selectedWeek}.`;
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

function confirmDeleteWorkoutDay() {
  const deletedWorkout = workouts.find((item) => item.id === pendingDeleteWorkoutId);
  pendingDeleteWorkoutId = null;
  pendingDeleteWorkoutReturnFocus = null;
  deleteWorkoutDialog.close();
  if (!deletedWorkout) return;
  const deletesAllWeeks = deletedWorkout.week === 1;
  const deletedTemplateId = deletedWorkout.templateId;
  const deletedWorkoutIds = new Set(
    deletesAllWeeks && deletedTemplateId
      ? workouts.filter((item) => item.templateId === deletedTemplateId).map((item) => item.id)
      : [deletedWorkout.id],
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
    deletesAllWeeks
      ? `${deletedWorkout.title} deleted from all 12 weeks.`
      : `${deletedWorkout.title} deleted from Week ${deletedWorkout.week}.`;
  (workoutList.querySelector(".workout-choice") || newWorkoutNameInput).focus();
}

deleteWorkoutButton.addEventListener("click", () => {
  if (!contextWorkoutId) return;
  const targetId = contextWorkoutId;
  closeWorkoutContextMenu();
  openDeleteWorkoutDialog(targetId, workoutList.querySelector(`[data-workout-id="${targetId}"]`));
});

deleteWorkoutDayButton.addEventListener("click", () => {
  if (!workout) return;
  openDeleteWorkoutDialog(workout.id, deleteWorkoutDayButton);
});

cancelDeleteWorkoutButton.addEventListener("click", () => {
  const returnFocus = pendingDeleteWorkoutReturnFocus;
  pendingDeleteWorkoutId = null;
  pendingDeleteWorkoutReturnFocus = null;
  deleteWorkoutDialog.close();
  returnFocus?.focus();
});

confirmDeleteWorkoutButton.addEventListener("click", confirmDeleteWorkoutDay);

deleteWorkoutDialog.addEventListener("close", () => {
  const returnFocus = pendingDeleteWorkoutReturnFocus;
  pendingDeleteWorkoutId = null;
  pendingDeleteWorkoutReturnFocus = null;
  if (returnFocus?.isConnected) returnFocus.focus();
});

shadowButton.addEventListener("click", () => {
  if (!workout) return;
  if (workout.shadowWorkoutId) {
    removeWorkoutShadow();
    return;
  }
  renderShadowWeekOptions();
  shadowDialog.showModal();
  if (!shadowWeekSelect.disabled) shadowWeekSelect.focus();
});

shadowForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const sourceWorkout = workouts.find(
    (item) => item.week === Number(shadowWeekSelect.value)
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
  removeWorkoutShadow(true);
});

function removeWorkoutShadow(closeDialog = false) {
  if (!workout) return;
  workout.shadowWorkoutId = null;
  if (closeDialog) shadowDialog.close();
  render();
  saveWorkout();
  document.getElementById("announcements").textContent = "Workout shadow removed.";
  shadowButton.focus();
}

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

sessionNotesSection.addEventListener("input", (event) => {
  const input = event.target.closest("[data-session-note]");
  if (!input || !workout) return;
  const noteIndex = Number(input.dataset.sessionNote);
  if (!Number.isInteger(noteIndex) || noteIndex < 0 || noteIndex >= 2) return;
  workout.sessionNotes[noteIndex] = input.value.slice(0, 500);
  saveWorkout();
});

function finishWorkout() {
  if (!workout) return;
  finishWorkoutDialog.close();
  workout.status = "completed";
  document.getElementById("announcements").textContent = `${workout.title} finished.`;
  render();
  saveWorkout();
}

workoutAction.addEventListener("click", () => {
  if (!workout || workoutAction.disabled) return;
  if (workout.status === "in-progress") {
    finishWorkoutDialog.showModal();
    finishWithoutProofButton.focus();
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

finishWithoutProofButton.addEventListener("click", finishWorkout);

finishWithProofButton.addEventListener("click", () => {
  if (!workout) return;
  try {
    downloadWorkoutProof(workout);
  } catch (error) {
    showNotice(`Could not download workout proof: ${error.message}`);
    finishWithProofButton.focus();
    return;
  }
  finishWorkout();
});

finishWorkoutDialog.addEventListener("close", () => {
  workoutAction.focus();
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
    exercise.bailed = false;
    exercise.bailSnapshot = null;
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
    updateExerciseProgress();
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
  if (!input || !["Enter", "Next"].includes(event.key) || getFieldError(input.dataset.field, input.value)) return;
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
  if (button.dataset.action === "bail-exercise") {
    if (exercise.bailed) {
      exercise.sets.forEach((set) => {
        const snapshot = exercise.bailSnapshot?.find((item) => item.id === set.id);
        if (!snapshot) {
          set.weight = "";
          set.reps = "";
          set.rpe = "";
          set.llp = false;
          set.llpReps = "";
          return;
        }
        set.weight = snapshot.weight;
        set.reps = snapshot.reps;
        set.rpe = snapshot.rpe;
        set.llp = snapshot.llp;
        set.llpReps = snapshot.llpReps;
      });
      exercise.bailed = false;
      exercise.bailSnapshot = null;
      render();
      saveWorkout();
      document.getElementById("announcements").textContent = `Bail undone for ${exercise.name}.`;
      exerciseList.querySelector(`[data-action="bail-exercise"][data-exercise-id="${exercise.id}"]`)?.focus();
      return;
    }
    pendingBailExerciseId = exercise.id;
    bailDialog.showModal();
    cancelBailButton.focus();
    return;
  }
  if (button.dataset.action === "remove-exercise") {
    pendingDeleteExerciseId = exercise.id;
    deleteExerciseDialogTitle.textContent = `Delete ${exercise.name || "this exercise"}?`;
    deleteExerciseDialog.showModal();
    cancelDeleteExerciseButton.focus();
    return;
  }

  let focusId = "";
  let announcement = "";
  if (button.dataset.action === "add-set") {
    const set = { id: makeId(), planId: makeId(), weight: "", reps: "", rpe: "", llp: false, llpReps: "" };
    exercise.sets.push(set);
    syncWorkoutPlan(workout, workouts, false);
    focusId = `add-set-${exercise.id}`;
    announcement = `Set ${exercise.sets.length} added to ${exercise.name}.`;
  } else if (button.dataset.action === "remove-set") {
    const removedIndex = exercise.sets.findIndex((set) => set.id === button.dataset.setId);
    exercise.sets = exercise.sets.filter((set) => set.id !== button.dataset.setId);
    syncWorkoutPlan(workout, workouts, false);
    focusId = `add-set-${exercise.id}`;
    announcement = `Set removed from ${exercise.name}.`;
  } else {
    return;
  }

  render();
  saveWorkout();
  document.getElementById("announcements").textContent = announcement;
  const focusTarget = focusId && document.getElementById(focusId);
  (focusTarget || exerciseNameInput).focus();
});

cancelBailButton.addEventListener("click", () => {
  pendingBailExerciseId = null;
  bailDialog.close();
  exerciseList.querySelector(".bail-exercise-button:not(:disabled)")?.focus();
});

cancelDeleteExerciseButton.addEventListener("click", () => {
  const exerciseId = pendingDeleteExerciseId;
  pendingDeleteExerciseId = null;
  deleteExerciseDialog.close();
  exerciseList.querySelector(`[data-action="remove-exercise"][data-exercise-id="${exerciseId}"]`)?.focus();
});

confirmDeleteExerciseButton.addEventListener("click", () => {
  const exercise = workout?.exercises.find((item) => item.id === pendingDeleteExerciseId);
  pendingDeleteExerciseId = null;
  deleteExerciseDialog.close();
  if (!workout || !exercise) return;
  const removedIndex = workout.exercises.indexOf(exercise);
  workout.exercises = workout.exercises.filter((item) => item.id !== exercise.id);
  syncWorkoutPlan(workout, workouts, false);
  const nextExercise = workout.exercises[Math.min(removedIndex, workout.exercises.length - 1)];
  render();
  saveWorkout();
  document.getElementById("announcements").textContent = `${exercise.name || "Exercise"} removed.`;
  const focusTarget = nextExercise && document.getElementById(`exercise-name-${nextExercise.id}`);
  (focusTarget || exerciseNameInput).focus();
});

deleteExerciseDialog.addEventListener("close", () => {
  pendingDeleteExerciseId = null;
});

confirmBailButton.addEventListener("click", () => {
  const exercise = workout?.exercises.find((item) => item.id === pendingBailExerciseId);
  pendingBailExerciseId = null;
  bailDialog.close();
  if (!exercise) return;
  exercise.bailSnapshot = exercise.sets.map((set) => ({
    id: set.id,
    weight: set.weight,
    reps: set.reps,
    rpe: set.rpe,
    llp: set.llp,
    llpReps: set.llpReps,
  }));
  exercise.bailed = true;
  exercise.sets.forEach((set) => {
    set.weight = "X";
    set.reps = "X";
    set.rpe = "X";
    set.llp = true;
    set.llpReps = "X";
  });
  render();
  saveWorkout();
  document.getElementById("announcements").textContent = `${exercise.name} marked as bailed.`;
  exerciseList.querySelector(`[data-action="bail-exercise"][data-exercise-id="${exercise.id}"]`)?.focus();
});

bailDialog.addEventListener("close", () => {
  pendingBailExerciseId = null;
});

welcomeScreen.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-profile]");
  if (button) activateProfile(button.dataset.profile);
});

switchProfileButton.addEventListener("click", returnToProfilePicker);
