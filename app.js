"use strict";

const LEGACY_STORAGE_KEY = "settle.workout.v1";
const PROFILE_STORAGE_PREFIX = "settle.workout.v1.profile.";
const COLOR_SCHEME_KEY = "spijker-track.color-scheme";
const SCHEME_NATIVE_MODES = { ultramarine: "dark", lava: "dark" };
const DARK_ONLY_SCHEMES = ["ultramarine", "lava"];
const DISPLAY_MODE_KEY = "spijker-track.display-mode";
const COLOR_SCHEMES = ["red", "magenta", "cyan", "yellow", "orange", "lime", "ultramarine", "lava"];
let mirroringEnabled = true;
const cloudConfig = globalThis.WORKOUT_CLOUD_CONFIG ?? {};
const cloudLoginPanel = document.getElementById("cloud-login-panel");
const profileChoicePanel = document.getElementById("profile-choice-panel");
const cloudLoginMessage = document.getElementById("cloud-login-message");
const profileChoiceMessage = document.getElementById("profile-choice-message");
const cloudLoginButton = document.getElementById("cloud-login-button");
const cloudSignoutActiveButton = document.getElementById("cloud-signout-active-button");
const localModeNote = document.getElementById("local-mode-note");
const storageModeLabel = document.getElementById("storage-mode-label");
const welcomeScreen = document.getElementById("welcome-screen");
const appShell = document.getElementById("app-shell");
const activeProfileName = document.getElementById("active-profile-name");
const bailMeterSection = document.getElementById("bail-meter");
const bailMeterCounts = {
  sean: document.getElementById("bail-count-sean"),
  kick: document.getElementById("bail-count-kick"),
};
const bailMeterBars = {
  sean: document.getElementById("bail-bar-sean"),
  kick: document.getElementById("bail-bar-kick"),
};
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
const storageDot = document.querySelector(".storage-dot");
const sessionDate = document.getElementById("session-date");
const workoutAction = document.getElementById("workout-action");
const startOverButton = document.getElementById("start-over-button");
const startOverDialog = document.getElementById("start-over-dialog");
const cancelStartOverButton = document.getElementById("cancel-start-over-button");
const confirmStartOverButton = document.getElementById("confirm-start-over-button");
const resumeCompletedDialog = document.getElementById("resume-completed-dialog");
const startOverCompletedButton = document.getElementById("start-over-completed-button");
const resumeCompletedButton = document.getElementById("resume-completed-button");
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
const myoNotesDialog = document.getElementById("myo-notes-dialog");
const myoNotesForm = document.getElementById("myo-notes-form");
const myoNotesRows = document.getElementById("myo-notes-rows");
const myoNotesTitle = document.getElementById("myo-notes-title");
const cancelMyoNotesButton = document.getElementById("cancel-myo-notes-button");
const editMyoNotesButton = document.getElementById("edit-myo-notes-button");
const confirmMyoNotesButton = document.getElementById("confirm-myo-notes-button");
const deleteExerciseDialog = document.getElementById("delete-exercise-dialog");
const deleteExerciseDialogTitle = document.getElementById("delete-exercise-dialog-title");
const cancelDeleteExerciseButton = document.getElementById("cancel-delete-exercise-button");
const confirmDeleteExerciseButton = document.getElementById("confirm-delete-exercise-button");
const workoutLayout = document.querySelector(".workout-layout");
const sessionNotesSection = document.getElementById("session-notes");
const sessionNoteInputs = Array.from(document.querySelectorAll("[data-session-note]"));
const sessionStatusLabel = document.getElementById("session-status-label");
const workoutTimerControls = document.getElementById("workout-timer-controls");
const workoutTimerDisplay = document.getElementById("workout-timer-display");
const workoutTimerToggle = document.getElementById("workout-timer-toggle");
let storageKey = "";
let supabaseClient = null;
let cloudEnabled = false;
let cloudSignedIn = false;
let activeCloudSubscription = null;
let bailMeterSubscriptions = [];
const bailMeterValues = { sean: 0, kick: 0 };
const bailMeterAvailable = { sean: false, kick: false };
let pendingCloudState = null;
let cloudSaveTimer = null;
let cloudSaveInFlight = false;
let cloudSaveQueued = false;
let profileLoadInProgress = false;
let pendingBailExerciseId = null;
let pendingMyoNotes = null;
let pendingDeleteExerciseId = null;
let pendingDeleteWorkoutId = null;
let pendingDeleteWorkoutReturnFocus = null;

function makeId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function countBailedExercises(state) {
  if (!Array.isArray(state?.workouts)) return 0;
  return state.workouts.reduce((total, item) => (
    total + (Array.isArray(item?.exercises)
      ? item.exercises.filter((exercise) => exercise?.bailed === true).length
      : 0)
  ), 0);
}

function renderBailMeter() {
  const maxCount = Math.max(bailMeterValues.sean, bailMeterValues.kick);
  for (const profile of ["sean", "kick"]) {
    const value = bailMeterValues[profile];
    const available = bailMeterAvailable[profile];
    const countText = available ? String(value) : "—";
    if (bailMeterCounts[profile].textContent !== countText) {
      bailMeterCounts[profile].textContent = countText;
    }
    bailMeterBars[profile].style.height = available && maxCount > 0 && value > 0
      ? `${(value / maxCount) * 64}px`
      : "0px";
    bailMeterBars[profile].title = available
      ? `${profile === "sean" ? "Sean" : "Kick"}: ${value} bailed exercises`
      : `${profile === "sean" ? "Sean" : "Kick"}'s count is unavailable`;
  }
  bailMeterSection.setAttribute(
    "aria-label",
    `BAIL meter, total bailed exercises across saved workouts. Sean: ${bailMeterAvailable.sean ? bailMeterValues.sean : "unavailable"}. Kick: ${bailMeterAvailable.kick ? bailMeterValues.kick : "unavailable"}.`,
  );
}

function resetBailMeter(profileAvailability = false) {
  bailMeterValues.sean = 0;
  bailMeterValues.kick = 0;
  bailMeterAvailable.sean = profileAvailability;
  bailMeterAvailable.kick = profileAvailability;
  renderBailMeter();
}

function updateBailMeterFromCloud(profile, state, profileExists = true) {
  if (!profileExists) {
    bailMeterValues[profile] = 0;
    bailMeterAvailable[profile] = true;
    renderBailMeter();
    return;
  }
  if (!Array.isArray(state?.workouts)) {
    bailMeterValues[profile] = 0;
    bailMeterAvailable[profile] = false;
    renderBailMeter();
    return;
  }
  bailMeterValues[profile] = countBailedExercises(state);
  bailMeterAvailable[profile] = true;
  renderBailMeter();
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
    timerElapsedMs: 0,
    timerStartedAt: null,
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

function applyColorScheme(scheme) {
  if (!COLOR_SCHEMES.includes(scheme)) throw new Error("Unknown color scheme.");
  document.body.dataset.colorScheme = scheme;
  document.querySelectorAll("[data-color-scheme]").forEach((button) => {
    if (button.tagName === "BUTTON") {
      button.setAttribute("aria-pressed", String(button.dataset.colorScheme === scheme));
    }
  });
  const select = document.querySelector?.("#color-scheme-select");
  if (select) select.value = scheme;
}

function applyDisplayMode(mode) {
  if (!["dark", "light"].includes(mode)) throw new Error("Unknown display mode.");
  document.body.dataset.displayMode = mode;
  document.documentElement.dataset.displayMode = mode;
  const button = document.getElementById("display-mode-button");
  const light = mode === "light";
  button.querySelector(".mode-moon").toggleAttribute("hidden", light);
  button.querySelector(".mode-sun").toggleAttribute("hidden", !light);
  button.setAttribute("aria-pressed", String(light));
  button.setAttribute("aria-label", `${light ? "Light" : "Dark"} mode. Switch to ${light ? "dark" : "light"} mode`);
  button.title = `Switch to ${light ? "dark" : "light"} mode`;
}

try {
  const savedMode = localStorage.getItem(DISPLAY_MODE_KEY);
  applyDisplayMode(savedMode === "light" ? "light" : "dark");
} catch (error) {
  applyDisplayMode("dark");
  showNotice("Your display mode could not be loaded. Dark mode is being used.");
  console.error("Display mode load failed:", error);
}
const lightModeUnavailableDialog = document.getElementById("light-mode-unavailable-dialog");
document.getElementById("close-light-mode-unavailable").addEventListener("click", () => lightModeUnavailableDialog.close());
document.getElementById("display-mode-button").addEventListener("click", () => {
  if (DARK_ONLY_SCHEMES.includes(document.body.dataset.colorScheme) && document.body.dataset.displayMode !== "light") {
    lightModeUnavailableDialog.showModal();
    return;
  }
  const mode = document.body.dataset.displayMode === "light" ? "dark" : "light";
  applyDisplayMode(mode);
  try {
    localStorage.setItem(DISPLAY_MODE_KEY, mode);
  } catch (error) {
    showNotice("The display mode changed, but it could not be saved for next time.");
    console.error("Display mode save failed:", error);
  }
});

const colorSchemeDialog = document.getElementById("color-scheme-dialog");
const colorSchemeButton = document.getElementById("color-scheme-button");
try {
  const savedScheme = localStorage.getItem(COLOR_SCHEME_KEY);
  applyColorScheme(COLOR_SCHEMES.includes(savedScheme) ? savedScheme : "red");
  if (DARK_ONLY_SCHEMES.includes(savedScheme)) applyDisplayMode("dark");
} catch (error) {
  showNotice("Your color preference could not be loaded. The default red theme is being used.");
  console.error("Color scheme load failed:", error);
}
colorSchemeButton.addEventListener("click", () => {
  colorSchemeDialog.showModal();
  document.getElementById("color-scheme-select").focus({ preventScroll: true });
});
document.getElementById("close-color-scheme").addEventListener("click", () => colorSchemeDialog.close());
colorSchemeDialog.addEventListener("close", () => colorSchemeButton.focus({ preventScroll: true }));
document.getElementById("color-scheme-select").addEventListener("change", (event) => {
  const scheme = event.target.value;
  applyColorScheme(scheme);
  const nativeMode = SCHEME_NATIVE_MODES[scheme];
  if (nativeMode) applyDisplayMode(nativeMode);
  try {
    localStorage.setItem(COLOR_SCHEME_KEY, scheme);
    if (nativeMode) localStorage.setItem(DISPLAY_MODE_KEY, nativeMode);
  } catch (error) {
    showNotice("The color scheme changed, but it could not be saved for next time.");
    console.error("Color scheme save failed:", error);
  }
});

function pdfSafeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

function getWorkoutElapsedMs(sourceWorkout, now = Date.now()) {
  const elapsed = Number.isFinite(sourceWorkout.timerElapsedMs)
    ? Math.max(0, sourceWorkout.timerElapsedMs)
    : 0;
  if (sourceWorkout.status !== "in-progress" || !Number.isFinite(sourceWorkout.timerStartedAt)) return elapsed;
  return elapsed + Math.max(0, now - sourceWorkout.timerStartedAt);
}

function formatWorkoutDuration(milliseconds) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, "0");
  const hours = Math.floor(totalSeconds / 3600);
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function updateWorkoutTimerDisplay() {
  if (!workout || workout.status !== "in-progress") return;
  workoutTimerDisplay.textContent = formatWorkoutDuration(getWorkoutElapsedMs(workout));
  const isRunning = Number.isFinite(workout.timerStartedAt);
  workoutTimerToggle.classList.toggle("is-paused", !isRunning);
  workoutTimerToggle.setAttribute("aria-label", `${isRunning ? "Pause" : "Resume"} workout timer`);
  workoutTimerToggle.title = `${isRunning ? "Pause" : "Resume"} timer`;
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
  y -= 14;
  const durationText = Number.isFinite(sourceWorkout.timerElapsedMs)
    ? formatWorkoutDuration(getWorkoutElapsedMs(sourceWorkout))
    : "Not recorded";
  addText(`Workout duration: ${durationText}`, margin, y, 10);
  y -= 18;
  addRule(y);
  y -= 22;

  const columns = [
    { title: "Set", x: 52 },
    { title: "Weight", x: 122 },
    { title: "Reps", x: 246 },
    { title: "RPE", x: 336 },
    { title: "LLP reps", x: 418 },
    { title: "MYO sets", x: 500 },
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
        (set.myo ? (set.myoReps || "Yes") : "-").slice(0, 12),
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
    planIsolated: source.planIsolated === true,
    templateEndWeek: Number.isInteger(source.templateEndWeek) ? source.templateEndWeek : 12,
    excludedWeeks: Array.isArray(source.excludedWeeks) ? source.excludedWeeks.filter((week) => Number.isInteger(week) && week >= 1 && week <= 12) : [],
    title: typeof source.title === "string" ? source.title.slice(0, 60) : "Workout",
    status: ["planned", "in-progress", "completed"].includes(source.status) ? source.status : "planned",
    timerElapsedMs: Number.isFinite(source.timerElapsedMs) && source.timerElapsedMs >= 0
      ? source.timerElapsedMs
      : source.status === "in-progress" ? 0 : null,
    timerStartedAt: source.status !== "in-progress" ? null : Number.isFinite(source.timerStartedAt) && source.timerStartedAt >= 0
      ? source.timerStartedAt
      : source.status === "in-progress" ? Date.now() : null,
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
          setup: typeof exercise.setup === "string" ? exercise.setup.slice(0, 300) : "",
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
                myo: set.myo === true,
                myoReps: set.myoReps == null ? "" : String(set.myoReps).trim(),
                myoNotes: Array.isArray(set.myoNotes)
                  ? set.myoNotes.map((note) => String(note ?? "").trim())
                  : [],
                myoNotesConfirmed: set.myoNotesConfirmed === true,
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
                myo: set.myo === true,
                myoReps: set.myoReps == null ? "" : String(set.myoReps).trim(),
                myoNotes: Array.isArray(set.myoNotes)
                  ? set.myoNotes.map((note) => String(note ?? "").trim())
                  : [],
                myoNotesConfirmed: set.myoNotesConfirmed === true,
              }))
            : [],
        }))
      : [],
  };
}

function syncWorkoutPlan(sourceWorkout, allWorkouts, createMissingWeeks = true, isPlanEdit = false) {
  const templateStartWeek = sourceWorkout.templateStartWeek ?? sourceWorkout.week;
  sourceWorkout.templateStartWeek = templateStartWeek;
  if (sourceWorkout.week !== templateStartWeek) {
    sourceWorkout.planCustomized = true;
  }

  sourceWorkout.exercises.forEach((exercise) => {
    exercise.planId ||= makeId();
    exercise.sets.forEach((set) => {
      set.planId ||= makeId();
    });
  });

  let peers = allWorkouts.filter((item) => item.templateId === sourceWorkout.templateId);
  if (createMissingWeeks) {
    for (let week = sourceWorkout.week; week <= (sourceWorkout.templateEndWeek ?? 12); week += 1) {
      if (sourceWorkout.excludedWeeks?.includes(week)) continue;
      if (peers.some((item) => item.week === week)) continue;
      const peer = createWorkout(sourceWorkout.title, sourceWorkout.templateId, templateStartWeek);
      peer.week = week;
      peer.exercises = sourceWorkout.exercises.map((exercise) => ({
        id: makeId(),
        planId: exercise.planId,
        name: exercise.name,
        setup: exercise.setup ?? "",
        sets: exercise.sets.map((set) => ({
          id: makeId(),
          planId: set.planId,
          weight: "",
          reps: "",
          rpe: "",
          llp: false,
          llpReps: "",
          myo: false,
          myoReps: "",
          myoNotes: [],
          myoNotesConfirmed: false,
        })),
      }));
      allWorkouts.push(peer);
    }
    peers = allWorkouts.filter((item) => item.templateId === sourceWorkout.templateId);
  }

  peers.forEach((peer) => {
    if (peer === sourceWorkout || peer.week <= sourceWorkout.week) return;
    if (!isPlanEdit && peer.planIsolated) return;
    if (sourceWorkout.week === templateStartWeek && peer.planCustomized) return;
    const usedExercises = new Set();
    peer.exercises = sourceWorkout.exercises.map((planExercise, exerciseIndex) => {
      const existingExercise = peer.exercises.find((item) =>
        !usedExercises.has(item) && item.planId === planExercise.planId,
      );
      if (existingExercise) usedExercises.add(existingExercise);
      const existingSets = existingExercise?.sets ?? [];
      const usedSets = new Set();
      return {
        id: existingExercise?.id ?? makeId(),
        planId: planExercise.planId,
        name: planExercise.name,
        setup: planExercise.setup ?? "",
        bailed: existingExercise?.bailed === true,
        bailSnapshot: existingExercise?.bailSnapshot ?? null,
        sets: planExercise.sets.map((planSet, setIndex) => {
          const existingSet = existingSets.find((item) =>
            !usedSets.has(item) && item.planId === planSet.planId,
          );
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
              myo: false,
              myoReps: "",
              myoNotes: [],
              myoNotesConfirmed: false,
            };
        }),
      };
    });
    peer.title = sourceWorkout.title;
    peer.templateStartWeek = templateStartWeek;
    if (sourceWorkout.week !== templateStartWeek) peer.planCustomized = true;
  });
}

function propagateExerciseName(sourceWorkout, exercise, allWorkouts) {
  if (!mirroringEnabled) return;
  allWorkouts.forEach((peer) => {
    if (peer.templateId !== sourceWorkout.templateId || peer.week <= sourceWorkout.week) return;
    const matchingExercise = peer.exercises.find((item) => item.planId === exercise.planId);
    if (!matchingExercise) return;
    matchingExercise.name = exercise.name;
    if (sourceWorkout.week !== sourceWorkout.templateStartWeek) peer.planCustomized = true;
  });
}

function applyWorkoutPlanEdit(sourceWorkout, allWorkouts, createMissingWeeks = false) {
  if (mirroringEnabled) {
    syncWorkoutPlan(sourceWorkout, allWorkouts, createMissingWeeks, true);
    return;
  }
  sourceWorkout.planIsolated = true;
  allWorkouts.forEach((peer) => {
    if (peer.templateId === sourceWorkout.templateId && peer.week > sourceWorkout.week) peer.planIsolated = true;
  });
  if (createMissingWeeks) sourceWorkout.templateEndWeek = sourceWorkout.week;
}

const mirroringToggle = document.getElementById("mirroring-toggle");
mirroringToggle.addEventListener("change", () => {
  mirroringEnabled = mirroringToggle.checked;
  render();
  document.getElementById("announcements").textContent = mirroringEnabled
    ? "Mirroring on. Future structural edits mirror to remaining weeks."
    : "Mirroring off. Structural edits affect only the selected week.";
});

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
          || !Object.prototype.hasOwnProperty.call(item, "timerElapsedMs")
          || !Object.prototype.hasOwnProperty.call(item, "timerStartedAt")
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

function readPendingCompletions(profile) {
  return JSON.parse(localStorage.getItem(`${PROFILE_STORAGE_PREFIX}${profile}.pending-completions`) || "{}");
}

function mergePendingCompletions(profile, state) {
  const pending = readPendingCompletions(profile);
  const merged = state.workouts
    .filter((item) => pending[item.id] !== null)
    .map((item) => pending[item.id] ?? item);
  Object.values(pending).forEach((item) => {
    if (item && !merged.some((existing) => existing.id === item.id)) merged.push(item);
  });
  return { ...state, workouts: merged };
}

function saveWorkout(completing = false) {
  if (!storageKey || !selectedProfile) return;
  pendingCloudState = null;
  try {
    const pending = readPendingCompletions(selectedProfile);
    if (completing && workout) pending[workout.id] = workout;
    Object.keys(pending).forEach((id) => {
      pending[id] = workouts.find((item) => item.id === id) ?? null;
    });
    localStorage.setItem(`${storageKey}.pending-completions`, JSON.stringify(pending));
    localStorage.setItem(storageKey, JSON.stringify({ workouts, selectedWorkoutId, selectedWeek }));
    if (pendingStructuralUndo) {
      structuralUndoRecord = JSON.parse(JSON.stringify({
        ...pendingStructuralUndo, after: serializeWorkoutState(),
      }));
      structuralUndoProfile = selectedProfile;
      pendingStructuralUndo = null;
    }
    setNoticeHidden();
    updateUndoButton();
  } catch {
    showNotice("This workout couldn't be saved in this browser. Your current changes are still visible until you leave this page.");
  }
  if (cloudEnabled && supabaseClient) scheduleCloudSave();
}

function setNoticeHidden() {
  storageNotice.hidden = true;
  storageNotice.textContent = "";
}

function hasCloudConfig() {
  return typeof cloudConfig.supabaseUrl === "string"
    && /^https:\/\/[^/]+$/.test(cloudConfig.supabaseUrl)
    && typeof cloudConfig.supabaseAnonKey === "string"
    && cloudConfig.supabaseAnonKey.length > 0;
}

function serializeWorkoutState() {
  return { workouts, selectedWorkoutId, selectedWeek };
}

let pendingStructuralUndo = null;
let structuralUndoRecord = null;
let structuralUndoProfile = null;
const structuralEditStarts = new WeakMap();
function beginStructuralUndo(label, input = null) {
  pendingStructuralUndo = {
    label,
    before: structuralEditStarts.get(input) ?? JSON.parse(JSON.stringify(serializeWorkoutState())),
  };
}

document.addEventListener("focusin", (event) => {
  if (event.target === workoutTitle) {
    structuralEditStarts.set(event.target, JSON.parse(JSON.stringify(serializeWorkoutState())));
  }
});

function workoutStructure(item) {
  if (!item) return null;
  return {
    title: item.title, templateEndWeek: item.templateEndWeek ?? 12,
    planCustomized: item.planCustomized === true,
    planIsolated: item.planIsolated === true,
    shadowWorkoutId: item.shadowWorkoutId ?? null,
    excludedWeeks: item.excludedWeeks ?? [],
    exercises: item.exercises.map((exercise) => ({
      id: exercise.id, planId: exercise.planId, name: exercise.name,
      setup: exercise.setup ?? "",
      sets: exercise.sets.map((set) => ({ id: set.id, planId: set.planId })),
    })),
  };
}

function restoreStructuralUndo(record, current) {
  const affected = new Set([...record.before.workouts, ...record.after.workouts].map((item) => item.id)
    .filter((id) => stableSerialize(workoutStructure(record.before.workouts.find((item) => item.id === id)))
      !== stableSerialize(workoutStructure(record.after.workouts.find((item) => item.id === id)))));
  for (const id of affected) {
    if (stableSerialize(workoutStructure(current.workouts.find((item) => item.id === id)))
      !== stableSerialize(workoutStructure(record.after.workouts.find((item) => item.id === id)))) {
      throw new Error("The affected workout structure has changed since this action. Refresh and review it before undoing.");
    }
  }
  const restored = current.workouts.filter((item) => !affected.has(item.id));
  record.before.workouts.filter((item) => affected.has(item.id)).forEach((before) => {
    const live = current.workouts.find((item) => item.id === before.id);
    restored.push({
      ...before, ...live,
      title: before.title, planCustomized: before.planCustomized,
      planIsolated: before.planIsolated === true,
      templateEndWeek: before.templateEndWeek ?? 12,
      shadowWorkoutId: before.shadowWorkoutId ?? null,
      excludedWeeks: before.excludedWeeks ?? [],
      exercises: before.exercises.map((exercise) => {
        const liveExercise = live?.exercises.find((item) => item.id === exercise.id);
        return {
          ...exercise, ...liveExercise, name: exercise.name, planId: exercise.planId,
          setup: exercise.setup ?? "",
          sets: exercise.sets.map((set) =>
            liveExercise?.sets.find((item) => item.id === set.id) ?? set),
        };
      }),
    });
  });
  const priorIds = record.before.workouts.map((item) => item.id);
  restored.sort((a, b) => priorIds.indexOf(a.id) - priorIds.indexOf(b.id));
  const selectedId = restored.some((item) => item.id === current.selectedWorkoutId)
    ? current.selectedWorkoutId : record.before.selectedWorkoutId;
  return {
    workouts: restored, selectedWorkoutId: selectedId,
    selectedWeek: selectedId === current.selectedWorkoutId ? current.selectedWeek : record.before.selectedWeek,
  };
}

const undoStructureButton = document.getElementById("undo-structure-button");
const undoStructureDialog = document.getElementById("undo-structure-dialog");
let pendingUndoRecord = null;
let pendingUndoProfile = null;
function updateUndoButton() {
  undoStructureButton.disabled = false;
}
undoStructureButton.addEventListener("click", () => {
  try {
    pendingUndoRecord = structuralUndoProfile === selectedProfile ? structuralUndoRecord : null;
    pendingUndoProfile = selectedProfile;
    document.getElementById("undo-structure-title").textContent = pendingUndoRecord ? "Undo last action?" : "Nothing to undo";
    document.getElementById("undo-structure-summary").textContent = pendingUndoRecord
      ? `Are you sure you want to undo: ${pendingUndoRecord.label}?`
      : "No structural changes have been made in this session.";
    document.getElementById("undo-structure-explanation").hidden = !pendingUndoRecord;
    document.getElementById("confirm-undo-structure").hidden = !pendingUndoRecord;
    document.getElementById("cancel-undo-structure").textContent = pendingUndoRecord ? "Cancel" : "Close";
    undoStructureDialog.showModal();
    document.getElementById("cancel-undo-structure").focus();
  } catch (error) {
    showNotice(`Undo could not be opened: ${error.message}`);
    console.error("Structural undo load failed:", error);
  }
});
document.getElementById("cancel-undo-structure").addEventListener("click", () => undoStructureDialog.close());
undoStructureDialog.addEventListener("close", () => {
  pendingUndoRecord = null;
  pendingUndoProfile = null;
  undoStructureButton.focus({ preventScroll: true });
});
document.getElementById("confirm-undo-structure").addEventListener("click", () => {
  if (!pendingUndoRecord || pendingUndoProfile !== selectedProfile) return;
  try {
    if (cloudSaveInFlight) throw new Error("A cloud save is running. Wait a moment and try Undo again.");
    const state = restoreStructuralUndo(pendingUndoRecord, serializeWorkoutState());
    restoreProfileState(state);
    structuralUndoRecord = null;
    undoStructureDialog.close();
    render();
    document.getElementById("announcements").textContent = "Last structural change undone.";
  } catch (error) {
    showNotice(`Undo failed: ${error.message}`);
    console.error("Structural undo failed:", error);
  }
});

function createProfileBackup(profile, state, now = new Date()) {
  return {
    format: "spijker-track-backup",
    version: 1,
    profile,
    createdAt: now.toISOString(),
    state: JSON.parse(JSON.stringify(state)),
  };
}

function findExerciseTarget(sourceWorkout, exercise) {
  const data = globalThis.WORKOUT_TARGETS;
  const title = sourceWorkout.title.trim().toLowerCase().replace(/\s+day$/, "");
  const day = title === "leg" ? "legs" : title;
  const order = sourceWorkout.exercises.indexOf(exercise) + 1;
  if (order < 1) return null;
  return data?.targets?.[`${sourceWorkout.week}:${day}:${order}`] ?? null;
}

const targetDialog = document.getElementById("target-dialog");
let targetReturnFocus = null;
function openTargetDialog(sourceWorkout, exercise, trigger) {
  const target = findExerciseTarget(sourceWorkout, exercise);
  targetReturnFocus = trigger;
  const details = document.getElementById("target-details");
  details.replaceChildren();
  const fields = [
    ["Working sets", "working_sets"],
    ["Rep range", "rep_range"],
    ["Rest time", "rest"],
    ["Early set RPE", "early_sets_rpe"],
    ["Last set RPE", "last_set_rpe"],
    ["Last set intensity technique", "last_set_intensity_technique"],
  ];
  if (target) {
    fields.forEach(([label, field]) => {
      const row = createElement("div", "target-detail-row");
      row.append(createElement("dt", "", `${label}:`), createElement("dd", "", target[field]));
      details.append(row);
    });
  }
  document.getElementById("target-message").textContent = target
    ? "" : "No target is available for this workout day, week and exercise position.";
  document.getElementById("target-message").hidden = Boolean(target);
  targetDialog.showModal();
  document.getElementById("close-target-button").focus({ preventScroll: true });
}

document.getElementById("close-target-button").addEventListener("click", () => targetDialog.close());
targetDialog.addEventListener("close", () => {
  if (targetReturnFocus?.isConnected) targetReturnFocus.focus({ preventScroll: true });
  targetReturnFocus = null;
});

function getExerciseHistory(sourceWorkout, exercise, allWorkouts) {
  return allWorkouts.filter((item) => item.templateId === sourceWorkout.templateId)
    .map((item) => {
      const matching = findMatchingExercise(item, exercise);
      const fields = ["weight", "reps", "rpe", "llpReps", "myoReps"];
      const sets = matching?.sets.map((set, index) => {
        const logged = fields.some((field) => String(set[field] ?? "").trim() !== "");
        const displaySet = item.week === 1 && !logged
          ? { ...set, ...Object.fromEntries(fields.map((field) => [field, "x"])) }
          : set;
        return { set: displaySet, number: index + 1, logged };
      }).filter(({ logged }) => item.week === 1 || logged) ?? [];
      return { week: item.week, title: item.title, name: matching?.name, bailed: matching?.bailed, sets };
    })
    .filter((entry) => entry.sets.length > 0)
    .sort((a, b) => b.week - a.week);
}

const historyDialog = document.getElementById("exercise-history-dialog");
let historyReturnFocus = null;
function openExerciseHistory(sourceWorkout, exercise, trigger) {
  historyReturnFocus = trigger;
  document.getElementById("exercise-history-title").textContent = `${exercise.name || "Exercise"} history`;
  const content = document.getElementById("exercise-history-content");
  content.replaceChildren();
  const entries = getExerciseHistory(sourceWorkout, exercise, workouts);
  if (!entries.length) content.append(createElement("p", "shadow-description", "No logged sets yet for this exercise."));
  entries.forEach((entry) => {
    const section = createElement("section", "history-week");
    section.append(createElement("h3", "", `Week ${entry.week} · ${entry.title}${entry.bailed ? " · Bailed" : ""}`));
    const table = createElement("table", "history-table");
    const head = document.createElement("thead");
    const headings = document.createElement("tr");
    ["Set", "Weight", "Reps", "RPE", "LLP", "MYO"].forEach((label) => {
      const cell = createElement("th", "", label);
      cell.scope = "col";
      headings.append(cell);
    });
    head.append(headings);
    const body = document.createElement("tbody");
    entry.sets.forEach(({ set, number }) => {
      const row = document.createElement("tr");
      [number, set.weight, set.reps, set.rpe, set.llpReps, set.myoReps].forEach((value) => {
        row.append(createElement("td", "", String(value ?? "").trim() || "—"));
      });
      body.append(row);
    });
    table.append(head, body);
    section.append(table);
    content.append(section);
  });
  historyDialog.showModal();
  document.getElementById("close-exercise-history").focus({ preventScroll: true });
}

document.getElementById("close-exercise-history").addEventListener("click", () => historyDialog.close());
historyDialog.addEventListener("close", () => {
  if (historyReturnFocus?.isConnected) historyReturnFocus.focus({ preventScroll: true });
  historyReturnFocus = null;
});

function parseProfileBackup(text, profile) {
  const backup = JSON.parse(text);
  if (backup?.format !== "spijker-track-backup" || backup.version !== 1) {
    throw new Error("Select a SPIJKER TRACK backup file (version 1).");
  }
  if (backup.profile !== profile) throw new Error("This backup belongs to a different user. Switch to that user first.");
  const state = backup.state;
  if (!state || !Array.isArray(state.workouts) || !Number.isInteger(state.selectedWeek)
    || state.selectedWeek < 1 || state.selectedWeek > 12 || Number.isNaN(Date.parse(backup.createdAt))) {
    throw new Error("The backup contains invalid profile data.");
  }
  const ids = new Set();
  const validId = (id) => {
    if (typeof id !== "string" || !/^[a-zA-Z0-9-]+$/.test(id)
      || ["constructor", "prototype"].includes(id) || ids.has(id)) {
      throw new Error("The backup contains invalid or duplicate IDs.");
    }
    ids.add(id);
  };
  for (const item of state.workouts) {
    validId(item?.id);
    if (typeof item.templateId !== "string" || typeof item.title !== "string"
      || !["planned", "in-progress", "completed"].includes(item.status)
      || !Number.isInteger(item.week) || item.week < 1 || item.week > 12 || !Array.isArray(item.exercises)
      || (item.timerElapsedMs !== null && (!Number.isFinite(item.timerElapsedMs) || item.timerElapsedMs < 0))
      || (item.timerStartedAt !== null && (!Number.isFinite(item.timerStartedAt) || item.timerStartedAt < 0))) {
      throw new Error("The backup contains an invalid workout.");
    }
    for (const exercise of item.exercises) {
      validId(exercise?.id);
      if (typeof exercise.name !== "string" || typeof exercise.planId !== "string" || !Array.isArray(exercise.sets)) {
        throw new Error("The backup contains an invalid exercise.");
      }
      for (const set of exercise.sets) {
        validId(set?.id);
        if (typeof set.planId !== "string"
          || ["weight", "reps", "rpe", "llpReps", "myoReps"].some((field) => typeof set[field] !== "string")
          || !Array.isArray(set.myoNotes) || set.myoNotes.some((note) => typeof note !== "string")) {
          throw new Error("The backup contains an invalid set.");
        }
      }
    }
  }
  if (state.selectedWorkoutId !== null && !state.workouts.some((item) => item.id === state.selectedWorkoutId)) {
    throw new Error("The backup's selected workout is missing.");
  }
  return backup;
}

const backupMessage = document.getElementById("backup-message");
const backupMenu = document.querySelector(".backup-menu");
backupMenu.addEventListener("toggle", () => {
  if (!backupMenu.open) return;
  window.requestAnimationFrame(() => {
    if (backupMenu.open) {
      backupMenu.querySelector(".backup-controls").scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  });
});
const restoreBackupFile = document.getElementById("restore-backup-file");
const restoreBackupDialog = document.getElementById("restore-backup-dialog");
let pendingBackup = null;

document.getElementById("download-backup-button").addEventListener("click", () => {
  if (!selectedProfile) return;
  try {
    const backup = createProfileBackup(selectedProfile, serializeWorkoutState());
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `spijker-track-${selectedProfile}-${backup.createdAt.replace(/[:.]/g, "-")}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    backupMessage.textContent = "Backup download requested. Keep the file in Files or another safe location.";
  } catch (error) {
    showNotice(`Backup could not be downloaded: ${error.message}`);
    console.error("Profile backup failed:", error);
  }
});

document.getElementById("restore-backup-button").addEventListener("click", () => {
  if (!selectedProfile) return;
  restoreBackupFile.value = "";
  restoreBackupFile.click();
});

restoreBackupFile.addEventListener("change", async () => {
  const file = restoreBackupFile.files[0];
  const profile = selectedProfile;
  if (!file || !profile) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error("The backup file exceeds 20 MB.");
    const backup = parseProfileBackup(await file.text(), profile);
    if (selectedProfile !== profile) throw new Error("The selected user changed. Choose the backup again.");
    pendingBackup = backup;
    document.getElementById("restore-backup-summary").textContent =
      `${profile === "sean" ? "Sean" : "Kick"}: ${backup.state.workouts.length} workout days across all weeks. Backup dated ${new Date(backup.createdAt).toLocaleString()}.`;
    restoreBackupDialog.showModal();
    document.getElementById("cancel-restore-backup").focus();
  } catch (error) {
    showNotice(`Backup could not be opened: ${error.message}`);
    console.error("Profile backup import failed:", error);
  }
});

document.getElementById("cancel-restore-backup").addEventListener("click", () => restoreBackupDialog.close());
restoreBackupDialog.addEventListener("close", () => {
  pendingBackup = null;
  document.getElementById("restore-backup-button").focus({ preventScroll: true });
});
function restoreProfileState(state) {
  const pending = Object.create(null);
  workouts.forEach((item) => { pending[item.id] = null; });
  state.workouts.forEach((item) => { pending[item.id] = item; });
  const pendingKey = `${storageKey}.pending-completions`;
  const previousPending = localStorage.getItem(pendingKey);
  localStorage.setItem(pendingKey, JSON.stringify(pending));
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    if (previousPending === null) localStorage.removeItem(pendingKey);
    else localStorage.setItem(pendingKey, previousPending);
    throw error;
  }
  workouts = state.workouts;
  selectedWorkoutId = state.selectedWorkoutId;
  selectedWeek = state.selectedWeek;
  workout = workouts.find((item) => item.id === selectedWorkoutId) ?? null;
  pendingCloudState = null;
  if (cloudSaveTimer) window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = null;
  if (cloudEnabled) saveCloudState();
}

document.getElementById("confirm-restore-backup").addEventListener("click", () => {
  if (!pendingBackup || pendingBackup.profile !== selectedProfile) return;
  if (cloudSaveInFlight) {
    backupMessage.textContent = "A cloud save is still running. Wait a moment, then press Restore again.";
    return;
  }
  try {
    restoreProfileState(pendingBackup.state);
    structuralUndoRecord = null;
    restoreBackupDialog.close();
    render();
    backupMessage.textContent = "Backup restored on this device. Cloud sync will retry if needed.";
  } catch (error) {
    showNotice(`Backup could not be restored: ${error.message}`);
    console.error("Profile backup restore failed:", error);
  }
});

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    const fields = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`);
    return `{${fields.join(",")}}`;
  }
  return JSON.stringify(value);
}

async function writeCloudState(profile, state) {
  const { error } = await supabaseClient
    .from("workout_profiles")
    .upsert({ profile_id: profile, state }, { onConflict: "profile_id" });
  if (error) throw error;
}

function scheduleCloudSave() {
  if (cloudSaveTimer) window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(() => {
    cloudSaveTimer = null;
    saveCloudState();
  }, 350);
}

async function saveCloudState() {
  if (cloudSaveInFlight) {
    cloudSaveQueued = true;
    return;
  }
  if (!cloudEnabled || !supabaseClient || !selectedProfile) return;
  cloudSaveInFlight = true;
  const profile = selectedProfile;
  const state = JSON.parse(JSON.stringify(serializeWorkoutState()));
  const snapshot = stableSerialize(state);
  storageModeLabel.textContent = "Syncing…";
  try {
    await writeCloudState(profile, state);
    const pending = readPendingCompletions(profile);
    Object.keys(pending).forEach((id) => {
      const saved = state.workouts.find((item) => item.id === id) ?? null;
      if (stableSerialize(pending[id]) === stableSerialize(saved)) delete pending[id];
    });
    localStorage.setItem(`${PROFILE_STORAGE_PREFIX}${profile}.pending-completions`, JSON.stringify(pending));
    if (selectedProfile === profile) storageModeLabel.textContent = "";
  } catch (error) {
    const message = "Cloud sync failed. Your latest changes are saved on this device and will retry after the next edit.";
    if (selectedProfile === profile) {
      storageModeLabel.textContent = "Sync failed";
      showNotice(message);
    }
    console.error("Cloud workout save failed:", error);
  } finally {
    cloudSaveInFlight = false;
    if (cloudSaveQueued) {
      cloudSaveQueued = false;
      if (selectedProfile && (selectedProfile !== profile || stableSerialize(serializeWorkoutState()) !== snapshot)) {
        scheduleCloudSave();
      }
    }
  }
}

function applyCloudState(state) {
  if (!selectedProfile || !storageKey) return;
  try {
    state = mergePendingCompletions(selectedProfile, state);
    localStorage.setItem(storageKey, JSON.stringify(state));
    const profileState = loadWorkouts();
    const previousWorkouts = workouts;
    workouts = profileState.workouts;
    for (const id of activeShadowWorkouts) {
      const refreshedWorkout = workouts.find((item) => item.id === id);
      const previousWorkout = previousWorkouts.find((item) => item.id === id);
      const source = workouts.find((item) => item.id === previousWorkout?.shadowWorkoutId);
      if (!refreshedWorkout || !source || source.templateId !== refreshedWorkout.templateId
        || (refreshedWorkout.status === "completed" && previousWorkout?.status !== "completed")) {
        activeShadowWorkouts.delete(id);
      } else {
        refreshedWorkout.shadowWorkoutId = source.id;
      }
    }
    selectedWorkoutId = profileState.selectedWorkoutId;
    selectedWeek = profileState.selectedWeek;
    workout = workouts.find((item) => item.id === selectedWorkoutId) ?? null;
    render();
    storageModeLabel.textContent = "";
    document.getElementById("announcements").textContent = "Workout changes from the other device were loaded.";
    return true;
  } catch (error) {
    showNotice("A cloud update arrived but couldn't be applied on this device. Your current workout remains visible.");
    console.error("Cloud workout update could not be applied:", error);
    return false;
  }
}

const refreshWorkoutButton = document.getElementById("refresh-workout-button");
const refreshFeedback = document.getElementById("refresh-feedback");
let refreshFeedbackTimer = null;
function showRefreshFeedback(message, clearAfter = 0) {
  if (refreshFeedbackTimer) window.clearTimeout(refreshFeedbackTimer);
  refreshFeedbackTimer = null;
  refreshFeedback.textContent = message;
  if (clearAfter) {
    refreshFeedbackTimer = window.setTimeout(() => {
      refreshFeedback.textContent = "";
      refreshFeedbackTimer = null;
    }, clearAfter);
  }
}
async function refreshWorkoutData() {
  if (!selectedProfile || refreshWorkoutButton.disabled) return;
  if (cloudSaveTimer || cloudSaveInFlight || cloudSaveQueued) {
    showNotice("Your latest edits are still syncing. Wait a moment, then press Refresh again.");
    return;
  }
  const profile = selectedProfile;
  const snapshot = stableSerialize(serializeWorkoutState());
  const currentWorkoutId = selectedWorkoutId;
  const currentWeek = selectedWeek;
  refreshWorkoutButton.disabled = true;
  showRefreshFeedback("Refreshing...");
  refreshWorkoutButton.setAttribute("aria-busy", "true");
  try {
    let state;
    if (cloudEnabled) {
      if (!supabaseClient || !cloudSignedIn) throw new Error("Sign in before refreshing cloud data.");
      const { data, error } = await supabaseClient
        .from("workout_profiles")
        .select("state")
        .eq("profile_id", profile)
        .single();
      if (error) throw error;
      state = data?.state;
    } else {
      state = JSON.parse(localStorage.getItem(storageKey));
    }
    if (!state || !Array.isArray(state.workouts)
      || state.workouts.some((item) => !item || typeof item !== "object" || !Array.isArray(item.exercises))) {
      throw new Error("The saved workout data has an unexpected format.");
    }
    if (selectedProfile !== profile) {
      showRefreshFeedback("");
      return;
    }
    if (cloudSaveTimer || cloudSaveInFlight || cloudSaveQueued
      || stableSerialize(serializeWorkoutState()) !== snapshot) {
      showNotice("You edited the workout while it was refreshing. Your edits were kept; refresh again once syncing finishes.");
      showRefreshFeedback("Not refreshed", 3000);
      return;
    }
    pendingCloudState = null;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const applied = applyCloudState({
      ...state,
      selectedWeek: currentWeek,
      selectedWorkoutId: state.workouts.some((item) => item.id === currentWorkoutId)
        ? currentWorkoutId : state.selectedWorkoutId,
    });
    window.scrollTo(scrollX, scrollY);
    showRefreshFeedback(applied ? "Refreshed" : "Refresh failed", applied ? 750 : 3000);
    if (applied) document.getElementById("announcements").textContent = "Saved workout data refreshed.";
  } catch (error) {
    if (selectedProfile === profile) {
      showRefreshFeedback("Refresh failed", 3000);
      showNotice(`Refresh failed. Your current data was kept. ${error.message}`);
    }
    console.error("Workout refresh failed:", error);
  } finally {
    refreshWorkoutButton.disabled = false;
    refreshWorkoutButton.removeAttribute("aria-busy");
  }
}
refreshWorkoutButton.addEventListener("click", refreshWorkoutData);

function queueIncomingCloudState(state) {
  if (stableSerialize(serializeWorkoutState()) === stableSerialize(state)) return;
  if (cloudSaveTimer || cloudSaveInFlight) return;
  pendingCloudState = state;
  const focusedElement = document.activeElement;
  if (!(focusedElement instanceof HTMLInputElement || focusedElement instanceof HTMLTextAreaElement || focusedElement instanceof HTMLSelectElement)) {
    applyPendingCloudState();
  } else {
    document.getElementById("announcements").textContent = "A workout update is waiting until you finish editing.";
  }
}

function applyPendingCloudState() {
  if (!pendingCloudState) return;
  const focusedElement = document.activeElement;
  if (focusedElement instanceof HTMLInputElement || focusedElement instanceof HTMLTextAreaElement || focusedElement instanceof HTMLSelectElement) return;
  const nextState = pendingCloudState;
  pendingCloudState = null;
  if (cloudSaveTimer || cloudSaveInFlight || myoNotesDialog.open) return;
  if (stableSerialize(serializeWorkoutState()) === stableSerialize(nextState)) return;
  applyCloudState(nextState);
}

function subscribeToCloudProfile(profile) {
  if (activeCloudSubscription) supabaseClient.removeChannel(activeCloudSubscription);
  bailMeterSubscriptions.forEach((subscription) => supabaseClient.removeChannel(subscription));
  bailMeterSubscriptions = [];
  activeCloudSubscription = supabaseClient
    .channel(`workout-profile-${profile}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "workout_profiles",
      filter: `profile_id=eq.${profile}`,
    }, (payload) => {
      if (payload.new?.state) {
        updateBailMeterFromCloud(profile, payload.new.state);
        queueIncomingCloudState(payload.new.state);
      } else if (payload.eventType === "DELETE") {
        updateBailMeterFromCloud(profile, null, false);
      }
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setCloudConnectionIndicator(true);
        storageModeLabel.textContent = "";
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setCloudConnectionIndicator(false);
        storageModeLabel.textContent = "Cloud reconnecting";
      } else if (status === "CLOSED") {
        setCloudConnectionIndicator(false);
      }
    });

  const otherProfile = profile === "sean" ? "kick" : "sean";
  const bailMeterSubscription = supabaseClient
    .channel(`bail-meter-${otherProfile}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "workout_profiles",
      filter: `profile_id=eq.${otherProfile}`,
    }, (payload) => {
      if (payload.new?.state) updateBailMeterFromCloud(otherProfile, payload.new.state);
      else if (payload.eventType === "DELETE") updateBailMeterFromCloud(otherProfile, null, false);
    })
    .subscribe((status) => {
      bailMeterBars[otherProfile].classList.toggle("is-stale", status !== "SUBSCRIBED");
      bailMeterBars[otherProfile].title = status === "SUBSCRIBED"
        ? bailMeterAvailable[otherProfile]
          ? `${otherProfile === "sean" ? "Sean" : "Kick"}: ${bailMeterValues[otherProfile]} bailed exercises`
          : `${otherProfile === "sean" ? "Sean" : "Kick"}'s cloud count is unavailable`
        : `${otherProfile === "sean" ? "Sean" : "Kick"}'s live count is reconnecting`;
    });
  bailMeterSubscriptions.push(bailMeterSubscription);
}

function setCloudLoginMessage(message) {
  cloudLoginMessage.textContent = message;
}

function setCloudConnectionIndicator(connected) {
  storageDot.classList.toggle("is-cloud-connected", connected);
  storageDot.title = connected ? "Connected to cloud" : "Not connected to cloud";
}

function showCloudProfilePicker(isSignedIn) {
  cloudSignedIn = isSignedIn;
  cloudLoginPanel.hidden = !cloudEnabled || isSignedIn;
  profileChoicePanel.hidden = cloudEnabled && !isSignedIn;
  cloudSignoutActiveButton.hidden = !cloudEnabled || !isSignedIn;
  profileChoiceMessage.textContent = "";
}

async function initializeCloud() {
  if (!hasCloudConfig()) {
    cloudEnabled = false;
    profileChoicePanel.hidden = false;
    localModeNote.hidden = false;
    localModeNote.textContent = "Local-only mode: workouts are saved on this device and do not sync.";
    return;
  }

  cloudEnabled = true;
  profileChoicePanel.hidden = true;
  localModeNote.hidden = true;
  cloudLoginPanel.hidden = false;
  setCloudLoginMessage("Connecting to secure workout storage…");

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    supabaseClient = createClient(cloudConfig.supabaseUrl, cloudConfig.supabaseAnonKey);
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (data.session) {
      await authorizeGoogleMember(data.session.user);
    } else {
      showCloudProfilePicker(false);
      setCloudLoginMessage("");
    }
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        cloudSignedIn = false;
        returnToProfilePicker();
        showCloudProfilePicker(false);
      } else if (event === "SIGNED_IN" && session) {
        window.setTimeout(() => authorizeGoogleMember(session.user), 0);
      }
    });
  } catch (error) {
    setCloudLoginMessage("Cloud connection failed. Check the cloud setup and internet connection, then reload.");
    console.error("Cloud initialization failed:", error);
  }
}

async function authorizeGoogleMember(user) {
  if (!user?.id) {
    showCloudProfilePicker(false);
    setCloudLoginMessage("");
    return;
  }
  setCloudLoginMessage("Checking access…");
  try {
    const { data, error } = await supabaseClient
      .from("workout_sync_members")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      await supabaseClient.auth.signOut();
      showCloudProfilePicker(false);
      setCloudLoginMessage("This Google account isn't authorized for the shared workout space. Ask the owner to add your email.");
      return;
    }
    showCloudProfilePicker(true);
    setCloudLoginMessage("");
  } catch (error) {
    showCloudProfilePicker(false);
    setCloudLoginMessage("We couldn't verify access to the workout space. Check your connection and try again.");
    console.error("Cloud member verification failed:", error);
  }
}

async function activateProfile(profile) {
  if (!["sean", "kick"].includes(profile) || profileLoadInProgress) return;
  if (cloudEnabled && (!supabaseClient || !cloudSignedIn)) return;
  profileLoadInProgress = true;
  if (cloudEnabled) profileChoiceMessage.textContent = "Loading workout profile…";
  profileChoicePanel.querySelectorAll("[data-profile]").forEach((button) => { button.disabled = true; });
  selectedProfile = profile;
  storageKey = `${PROFILE_STORAGE_PREFIX}${profile}`;
  let profileState = loadWorkouts();
  if (cloudEnabled) {
    try {
      const { data, error } = await supabaseClient
        .from("workout_profiles")
        .select("profile_id,state");
      if (error) throw error;
      resetBailMeter(true);
      const cloudProfileRows = data ?? [];
      cloudProfileRows.forEach((row) => {
        if (["sean", "kick"].includes(row.profile_id)) {
          updateBailMeterFromCloud(row.profile_id, row.state);
        }
      });
      const cloudProfile = cloudProfileRows.find((row) => row.profile_id === profile);
      if (cloudProfile && (!cloudProfile.state || typeof cloudProfile.state !== "object" || !Array.isArray(cloudProfile.state.workouts))) {
        throw new Error("The cloud workout data has an unexpected format.");
      }
      const localState = {
        workouts: profileState.workouts,
        selectedWorkoutId: profileState.selectedWorkoutId,
        selectedWeek: profileState.selectedWeek,
      };
      const hasLocalData = profileState.workouts.length > 0;
      if (cloudProfile?.state) {
        localStorage.setItem(storageKey, JSON.stringify(mergePendingCompletions(profile, cloudProfile.state)));
        profileState = loadWorkouts();
        if (Object.keys(readPendingCompletions(profile)).length) profileState.needsSave = true;
      } else {
        updateBailMeterFromCloud(profile, localState);
        if (hasLocalData) await writeCloudState(profile, localState);
      }
    } catch (error) {
      selectedProfile = null;
      storageKey = "";
      profileChoiceMessage.textContent = "Cloud data couldn't be loaded. Your saved device data was left unchanged. Check your connection and try again.";
      console.error("Cloud profile load failed:", error);
      profileLoadInProgress = false;
      profileChoicePanel.querySelectorAll("[data-profile]").forEach((button) => { button.disabled = false; });
      return;
    }
  }
  activeShadowWorkouts.clear();
  workouts = profileState.workouts;
  if (!cloudEnabled) {
    resetBailMeter();
    bailMeterValues[profile] = countBailedExercises({ workouts });
    bailMeterAvailable[profile] = true;
  }
  selectedWorkoutId = profileState.selectedWorkoutId;
  selectedWeek = profileState.selectedWeek;
  workout = workouts.find((item) => item.id === selectedWorkoutId) ?? null;
  activeProfileName.textContent = profile === "sean" ? "Sean" : "Kick";
  storageModeLabel.textContent = cloudEnabled ? "" : "Saved for";
  cloudSignoutActiveButton.hidden = !cloudEnabled;
  welcomeScreen.hidden = true;
  appShell.hidden = false;
  render();
  if (profileState.needsSave) saveWorkout();
  if (cloudEnabled) subscribeToCloudProfile(profile);
  profileChoiceMessage.textContent = "";
  document.getElementById("announcements").textContent = `${activeProfileName.textContent}'s profile loaded.`;
  profileLoadInProgress = false;
  profileChoicePanel.querySelectorAll("[data-profile]").forEach((button) => { button.disabled = false; });
  switchProfileButton.focus();
}

function returnToProfilePicker() {
  structuralUndoRecord = null;
  structuralUndoProfile = null;
  pendingStructuralUndo = null;
  if (undoStructureDialog.open) undoStructureDialog.close();
  if (shadowDialog.open) shadowDialog.close();
  if (cloudSaveTimer) {
    window.clearTimeout(cloudSaveTimer);
    cloudSaveTimer = null;
    if (selectedProfile) saveCloudState();
  }
  if (activeCloudSubscription) {
    supabaseClient.removeChannel(activeCloudSubscription);
    activeCloudSubscription = null;
  }
  bailMeterSubscriptions.forEach((subscription) => supabaseClient.removeChannel(subscription));
  bailMeterSubscriptions = [];
  setCloudConnectionIndicator(false);
  pendingCloudState = null;
  workoutContextMenu.hidden = true;
  contextWorkoutId = null;
  selectedProfile = null;
  storageKey = "";
  workouts = [];
  selectedWorkoutId = null;
  selectedWeek = 1;
  workout = null;
  resetBailMeter();
  appShell.hidden = true;
  welcomeScreen.hidden = false;
  showCloudProfilePicker(cloudSignedIn);
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
  const isPartialReps = field === "llpReps" || field === "myoReps";
  const input = document.createElement("input");
  input.className = "set-input";
  input.type = isRpe && !exercise.bailed ? "number" : "text";
  input.inputMode = isRpe ? "decimal" : isPartialReps || field === "reps" ? "numeric" : "text";
  input.enterKeyHint = "next";
  if (!isWeight && field !== "reps") input.min = "1";
  if (isRpe) input.max = "10";
  if (!isWeight && field !== "reps") input.step = isRpe ? "0.5" : "1";
  if (isWeight) input.maxLength = 24;
  if (field === "llpReps") input.classList.add("llp-reps-input");
  if (field === "myoReps") input.classList.add("myo-reps-input");
  if (isRpe) input.classList.add("rpe-input");
  input.value = set[field];
  input.disabled = exercise.bailed === true;
  const shadowSet = findShadowSet(exercise, set);
  const shadowValue = shadowSet?.[field] == null ? "" : String(shadowSet[field]).trim();
  if (shadowValue !== "") {
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
    myoReps: "number of MYO sets",
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

function appendMyoRepsInput(cell, exercise, set, setNumber) {
  const input = makeInput(exercise, set, "myoReps", setNumber);
  const hint = createElement("span", "sr-only", "");
  hint.id = `${set.id}-myoReps-hint`;
  cell.append(input, hint);
  updateInputValidity(input, hint);
  updateMyoNotesButton(cell, exercise, set, setNumber);
}

function updateMyoNotesButton(cell, exercise, set, setNumber) {
  const shadowSet = findShadowSet(exercise, set);
  const myoCount = Number(set.myoReps || shadowSet?.myoReps);
  const existingButton = cell.querySelector(".myo-notes-button");
  if (!Number.isInteger(myoCount) || myoCount < 1) {
    existingButton?.remove();
    return;
  }
  const notesButton = existingButton ?? createElement("button", "myo-notes-button", "i");
  notesButton.type = "button";
  notesButton.dataset.action = "myo-notes";
  notesButton.dataset.exerciseId = exercise.id;
  notesButton.dataset.setId = set.id;
  notesButton.disabled = exercise.bailed === true;
  const hasOwnNotes = set.myoNotesConfirmed === true
    && (set.myoNotes?.length ?? 0) === myoCount;
  const hasShadowNotes = !set.myoReps
    && shadowSet?.myoNotesConfirmed === true
    && (shadowSet?.myoNotes?.length ?? 0) === Number(shadowSet?.myoReps);
  if (!hasOwnNotes && !hasShadowNotes) {
    existingButton?.remove();
    return;
  }
  const hasNotes = hasOwnNotes || hasShadowNotes;
  notesButton.setAttribute(
    "aria-label",
    `${hasNotes ? "View or edit" : "Add"} MYO notes for set ${setNumber} of ${exercise.name}`,
  );
  notesButton.title = hasNotes ? "View or edit MYO notes" : "Add MYO notes";
  if (!existingButton) cell.append(notesButton);
}

function setMyoNotesViewing(viewing) {
  if (pendingMyoNotes) pendingMyoNotes.viewing = viewing;
  myoNotesRows.querySelectorAll("input").forEach((input) => { input.readOnly = viewing; });
  editMyoNotesButton.hidden = !viewing;
  confirmMyoNotesButton.hidden = viewing;
  cancelMyoNotesButton.textContent = viewing ? "Close" : "Cancel";
}

function openMyoNotesDialog(exercise, set, trigger, viewing = false) {
  if (myoNotesDialog.open) return;
  const shadowSet = findShadowSet(exercise, set);
  const ownNotes = Array.isArray(set.myoNotes) ? set.myoNotes : [];
  const shadowNotes = Array.isArray(shadowSet?.myoNotes) ? shadowSet.myoNotes : [];
  const useShadow = viewing
    && set.myoNotesConfirmed !== true
    && shadowSet?.myoNotesConfirmed === true
    && shadowNotes.length === Number(shadowSet.myoReps);
  const enteredCount = trigger?.dataset?.field === "myoReps" ? trigger.value.trim() : "";
  const countValue = enteredCount || set.myoReps || shadowSet?.myoReps || "";
  const count = Number(countValue);
  if (!Number.isInteger(count) || count < 1) return;

  if (enteredCount) {
    set.myoReps = enteredCount;
    set.myo = true;
    set.myoNotesConfirmed = false;
    saveWorkout();
  }
  pendingMyoNotes = {
    exerciseId: exercise.id,
    setId: set.id,
    trigger,
    count,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
  myoNotesTitle.textContent = `MYO notes: ${exercise.name} — set ${exercise.sets.indexOf(set) + 1}`;
  myoNotesRows.replaceChildren();
  const notes = useShadow ? shadowNotes : ownNotes;
  for (let index = 0; index < count; index += 1) {
    const row = createElement("div", "myo-note-row");
    const label = createElement("label", "", `Set ${index + 1}`);
    const input = document.createElement("input");
    input.id = `${set.id}-myo-note-${index + 1}`;
    label.htmlFor = input.id;
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "1";
    input.step = "1";
    input.required = true;
    input.value = notes[index] ?? "";
    input.setAttribute("aria-label", `MYO set ${index + 1} reps`);
    row.append(label, input);
    myoNotesRows.append(row);
  }
  setMyoNotesViewing(viewing);
  myoNotesDialog.showModal();
  (viewing ? editMyoNotesButton : myoNotesRows.querySelector("input"))?.focus();
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
  if (["llpReps", "myoReps"].includes(field) && (!Number.isInteger(number) || number < 1)) {
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

function findMatchingExercise(sourceWorkout, exercise) {
  return sourceWorkout?.exercises.find(
    (item) => item.planId === exercise.planId,
  ) ?? sourceWorkout?.exercises.find(
    (item) => item.name.trim().toLocaleLowerCase() === exercise.name.trim().toLocaleLowerCase(),
  );
}

const activeShadowWorkouts = new Set();

function hasActiveShadow() {
  return Boolean(workout?.shadowWorkoutId && activeShadowWorkouts.has(workout.id));
}

function findShadowSet(exercise, set) {
  if (!hasActiveShadow()) return null;
  const shadowWorkout = workouts.find((item) => item.id === workout.shadowWorkoutId);
  const shadowExercise = findMatchingExercise(shadowWorkout, exercise);
  const setIndex = exercise.sets.indexOf(set);
  return setIndex >= 0 ? shadowExercise?.sets[setIndex] ?? null : null;
}

function parsePerformanceValue(field, value) {
  let text = String(value ?? "").trim();
  if (field === "weight") {
    if (/^b\s*w$/i.test(text)) return { rank: 0, amount: 0 };
    if (/^bar$/i.test(text)) return { rank: 1, amount: 0 };
    text = text.replace(/\s*e$/i, "");
  }
  if (!/^\d+(?:\.\d+)?$/.test(text) || getFieldError(field, text)) return null;
  return field === "weight" ? { rank: 2, amount: Number(text) } : Number(text);
}

function compareSetPerformance(current, previous) {
  const values = [current, previous].map((set) => {
    if (!set) return null;
    const result = {};
    for (const field of ["weight", "reps", "rpe"]) {
      const value = parsePerformanceValue(field, set[field]);
      if (value === null) return null;
      result[field] = value;
    }
    return result;
  });
  if (values.some((value) => !value)) return null;
  for (const field of ["weight", "reps", "rpe"]) {
    const difference = field === "weight"
      ? values[0].weight.rank - values[1].weight.rank || values[0].weight.amount - values[1].weight.amount
      : values[0][field] - values[1][field];
    if (difference !== 0) return (field === "rpe" ? -difference : difference) > 0 ? ">" : "<";
  }
  return "=";
}

function getSetProgress(exercise, set) {
  if (!hasActiveShadow() || workout.status === "completed") return null;
  const sourceWorkout = workouts.find((item) => item.id === workout.shadowWorkoutId);
  if (!sourceWorkout) return null;
  const previousWorkout = sourceWorkout.shadowWorkoutId
    ? workouts.find((item) => item.id === sourceWorkout.shadowWorkoutId)
    : workouts.find((item) => item.templateId === sourceWorkout.templateId && item.week === sourceWorkout.week - 1);
  if (!previousWorkout || previousWorkout.id === sourceWorkout.id
    || previousWorkout.templateId !== sourceWorkout.templateId) return null;
  const sourceExercise = findMatchingExercise(sourceWorkout, exercise);
  const previousExercise = sourceExercise && findMatchingExercise(previousWorkout, sourceExercise);
  if (sourceExercise?.bailed || previousExercise?.bailed) return null;
  const index = exercise.sets.indexOf(set);
  if (index < 0) return null;
  const symbol = compareSetPerformance(sourceExercise?.sets[index], previousExercise?.sets[index]);
  return symbol ? { symbol, sourceWeek: sourceWorkout.week, previousWeek: previousWorkout.week } : null;
}

function updateSetProgress(cell, exercise, set, setNumber) {
  cell.querySelector(".shadow-progress")?.remove();
  const progress = getSetProgress(exercise, set);
  if (!progress) return;
  const indicator = createElement("span", "shadow-progress", progress.symbol);
  const status = { ">": "Progressive overload", "=": "Stagnant", "<": "Performance decreased" }[progress.symbol];
  const description = `${status}: shadow Week ${progress.sourceWeek} compared with Week ${progress.previousWeek}, set ${setNumber}. Weight, then reps, then RPE.`;
  indicator.title = description;
  indicator.setAttribute("role", "img");
  indicator.setAttribute("aria-label", description);
  cell.append(indicator);
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
  const selectedSource = sources.find((item) => item.id === workout?.shadowWorkoutId);
  const previousWeekSource = sources.find((item) => item.week === workout?.week - 1);
  const defaultWeek = selectedSource?.week ?? previousWeekSource?.week ?? sources[0]?.week ?? workout?.week ?? 1;
  for (const week of availableWeeks) {
    const option = document.createElement("option");
    option.value = String(week);
    option.textContent = `Week ${week}`;
    option.defaultSelected = week === defaultWeek;
    option.selected = week === defaultWeek;
    shadowWeekSelect.append(option);
  }
  shadowWeekSelect.value = String(defaultWeek);
  shadowWeekSelect.disabled = sources.length === 0;
  shadowForm.querySelector('[type="submit"]').disabled = sources.length === 0;
  clearShadowButton.hidden = !hasActiveShadow();
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
  deleteWorkoutButton.textContent = !mirroringEnabled ? "Delete day from this week" : contextWorkout?.week === 1
    ? "Delete day from all weeks"
    : `Delete day from Week ${contextWorkout?.week ?? selectedWeek} onward`;
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
  deleteWorkoutDialogTitle.textContent = !mirroringEnabled
    ? `Delete ${targetWorkout.title} from Week ${targetWorkout.week} only?` : targetWorkout.week === 1
    ? `Delete ${targetWorkout.title} from all 12 weeks?`
    : `Delete ${targetWorkout.title} from Week ${targetWorkout.week} and all later weeks?`;
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
  const actionCell = document.createElement("td");
  const removeButton = createElement("button", "icon-button remove-set", "×");
  removeButton.type = "button";
  removeButton.dataset.action = "remove-set";
  removeButton.dataset.exerciseId = exercise.id;
  removeButton.dataset.setId = set.id;
  removeButton.setAttribute("aria-label", `Remove set ${setNumber} from ${exercise.name}`);
  actionCell.append(removeButton);
  row.append(actionCell);

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
  updateSetProgress(llpCell, exercise, set, setNumber);
  const shadowSet = findShadowSet(exercise, set);
  const llpCheckbox = document.createElement("input");
  llpCheckbox.className = "llp-checkbox";
  llpCheckbox.type = "checkbox";
  llpCheckbox.checked = set.llp === true;
  llpCheckbox.disabled = exercise.bailed === true;
  llpCheckbox.dataset.exerciseId = exercise.id;
  llpCheckbox.dataset.setId = set.id;
  llpCheckbox.dataset.llp = "true";
  llpCheckbox.setAttribute("aria-label", `Long-length partials for set ${setNumber} of ${exercise.name}`);
  if (shadowSet?.llp) llpCheckbox.title = "Long-length partials are included in the shadow workout";
  llpCell.append(llpCheckbox);
  if (set.llp || shadowSet?.llp) {
    appendLlpRepsInput(llpCell, exercise, set, setNumber);
  }
  row.append(llpCell);

  const myoCell = document.createElement("td");
  myoCell.className = "myo-cell";
  const myoCheckbox = document.createElement("input");
  myoCheckbox.className = "myo-checkbox";
  myoCheckbox.type = "checkbox";
  myoCheckbox.checked = set.myo === true;
  myoCheckbox.disabled = exercise.bailed === true;
  myoCheckbox.dataset.exerciseId = exercise.id;
  myoCheckbox.dataset.setId = set.id;
  myoCheckbox.dataset.myo = "true";
  myoCheckbox.setAttribute("aria-label", `MYO sets for set ${setNumber} of ${exercise.name}`);
  if (shadowSet?.myo) myoCheckbox.title = "Myo reps are included in the shadow workout";
  myoCell.append(myoCheckbox);
  if (set.myo || shadowSet?.myo) {
    appendMyoRepsInput(myoCell, exercise, set, setNumber);
  }
  row.append(myoCell);
  return row;
}

function renderExerciseCard(exercise, index) {
  const card = createElement("article", "exercise-card");
  const header = createElement("header", "exercise-header");
  const titleWrap = createElement("div", "exercise-title-wrap");
  titleWrap.append(createElement("span", "exercise-index", String(index + 1)));

  const headingWrap = createElement("div", "exercise-heading-text");
  const heading = createElement("h2", "exercise-name-heading");
  heading.setAttribute("aria-label", `Exercise: ${exercise.name || "unnamed exercise"}`);
  const historyButton = createElement("button", "exercise-history-name", exercise.name || "Unnamed exercise");
  historyButton.type = "button";
  historyButton.dataset.action = "history";
  historyButton.dataset.exerciseId = exercise.id;
  historyButton.setAttribute("aria-label", `View history for ${exercise.name || "exercise"}`);
  historyButton.title = "Exercise history";
  const editButton = createElement("button", "exercise-edit-button");
  editButton.type = "button";
  editButton.dataset.action = "edit-name";
  editButton.dataset.exerciseId = exercise.id;
  editButton.disabled = exercise.bailed === true;
  editButton.setAttribute("aria-label", `Edit name and setup of ${exercise.name || "exercise"}`);
  editButton.title = "Edit exercise name and machine / setup";
  editButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>';
  heading.append(historyButton, editButton);
  const progress = createElement("span", "exercise-progress");
  progress.id = `progress-${exercise.id}`;
  headingWrap.append(heading, progress);
  titleWrap.append(headingWrap);
  header.append(titleWrap);

  const headerActions = createElement("div", "exercise-header-actions");
  const targetButton = createElement("button", "target-button");
  targetButton.type = "button";
  targetButton.dataset.action = "target";
  targetButton.dataset.exerciseId = exercise.id;
  targetButton.setAttribute("aria-label", `View target for ${exercise.name}`);
  targetButton.title = "Target";
  targetButton.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M10.5 3.1a9 9 0 0 0-7.4 7.4M13.5 3.1a9 9 0 0 1 7.4 7.4M20.9 13.5a9 9 0 0 1-7.4 7.4M10.5 20.9a9 9 0 0 1-7.4-7.4"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><path d="M12 1.5v7M12 15.5v7M1.5 12h7M15.5 12h7" stroke-width="1.2" stroke-linecap="round"/></svg>';
  headerActions.append(targetButton);
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
  for (const label of ["", "SET", "WEIGHT (KG)", "REPS", "RPE", "LLP", "MYO"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    if (label === "LLP") cell.title = "Long-length partials";
    if (label === "MYO") cell.title = "Myo reps";
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
    cell.colSpan = 7;
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
  const infoButton = createElement("button", "exercise-info-button", "?");
  infoButton.type = "button";
  infoButton.id = `exercise-info-${exercise.id}`;
  infoButton.dataset.action = "exercise-info";
  infoButton.dataset.exerciseId = exercise.id;
  infoButton.title = "Machine / setup info";
  infoButton.setAttribute("aria-label", `View machine and setup info for ${exercise.name || "exercise"}`);
  footer.append(infoButton);
  card.append(header, tableWrap, footer);
  card.querySelectorAll("input[data-llp]").forEach((llpCheckbox) => {
    const setIndex = exercise.sets.findIndex((set) => set.id === llpCheckbox.dataset.setId);
    llpCheckbox.setAttribute("aria-label", `Long-length partials for set ${setIndex + 1} of ${exercise.name || "unnamed exercise"}`);
  });
  card.querySelectorAll("input[data-myo]").forEach((myoCheckbox) => {
    const setIndex = exercise.sets.findIndex((set) => set.id === myoCheckbox.dataset.setId);
    myoCheckbox.setAttribute("aria-label", `Myo reps for set ${setIndex + 1} of ${exercise.name || "unnamed exercise"}`);
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
  try {
    updateUndoButton();
  } catch (error) {
    undoStructureButton.disabled = true;
    console.error("Structural undo availability failed:", error);
  }
  renderBailMeter();
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
  workoutTimerControls.hidden = workout?.status !== "in-progress";
  updateWorkoutTimerDisplay();
  startOverButton.hidden = !workout || workout.status === "planned";
  shadowButton.hidden = !workout;
  shadowButton.textContent = hasActiveShadow() ? "Remove shadow" : "Shadow";
  shadowButton.title = hasActiveShadow()
    ? `Shadowing ${workouts.find((item) => item.id === workout.shadowWorkoutId)?.title ?? "another workout"}`
    : "Choose a workout to shadow";
  deleteWorkoutDayButton.title = !mirroringEnabled ? "Delete this workout day from this week only" : workout?.week === 1
    ? "Delete this workout day from all 12 weeks"
    : `Delete this workout day from Week ${workout?.week ?? ""} onward`;
  deleteWorkoutDayButton.setAttribute(
    "aria-label",
    !mirroringEnabled ? "Delete workout day from this week only" : workout?.week === 1
      ? "Delete workout day from all 12 weeks"
      : `Delete workout day from Week ${workout?.week ?? ""} onward`,
  );
  sessionNotesSection.hidden = !workout;
  renderSessionNotes();
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
  beginStructuralUndo(`Add workout day: ${title}`);
  workout = createWorkout(title.slice(0, 60));
  workouts.push(workout);
  applyWorkoutPlanEdit(workout, workouts, true);
  selectedWorkoutId = workout.id;
  newWorkoutNameInput.value = "";
  render();
  saveWorkout();
  document.getElementById("announcements").textContent = !mirroringEnabled
    ? `${title} added to Week ${selectedWeek} only.` : selectedWeek === 1
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
  beginStructuralUndo(`Delete workout day: ${deletedWorkout.title}, Week ${deletedWorkout.week}${mirroringEnabled ? " onward" : " only"}`);
  const deletesAllWeeks = mirroringEnabled && deletedWorkout.week === 1;
  const deletedTemplateId = deletedWorkout.templateId;
  const deletedWorkoutIds = new Set(
    !mirroringEnabled ? [deletedWorkout.id] : deletesAllWeeks && deletedTemplateId
      ? workouts.filter((item) => item.templateId === deletedTemplateId).map((item) => item.id)
      : workouts.filter((item) =>
        item.templateId === deletedTemplateId && item.week >= deletedWorkout.week,
      ).map((item) => item.id),
  );
  workouts = workouts.filter((item) => !deletedWorkoutIds.has(item.id));
  workouts.forEach((item) => {
    if (item.templateId !== deletedTemplateId) return;
    if (mirroringEnabled) item.templateEndWeek = deletedWorkout.week - 1;
    else item.excludedWeeks = [...new Set([...(item.excludedWeeks ?? []), deletedWorkout.week])];
  });
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
    !mirroringEnabled ? `${deletedWorkout.title} deleted from Week ${deletedWorkout.week} only.` : deletesAllWeeks
      ? `${deletedWorkout.title} deleted from all 12 weeks.`
      : `${deletedWorkout.title} deleted from Week ${deletedWorkout.week} onward.`;
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
  if (hasActiveShadow()) {
    removeWorkoutShadow();
    return;
  }
  renderShadowWeekOptions();
  shadowDialog.showModal();
  if (!shadowWeekSelect.disabled) shadowForm.querySelector('[type="submit"]').focus();
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
  activeShadowWorkouts.add(workout.id);
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
  activeShadowWorkouts.delete(workout.id);
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
  beginStructuralUndo("Rename workout day", workoutTitle);
  workout.title = workoutTitle.value;
  applyWorkoutPlanEdit(workout, workouts);
  renderWorkoutChoices();
  saveWorkout();
});

function renderSessionNotes() {
  const shadowWorkout = hasActiveShadow()
    ? workouts.find((item) => item.id === workout.shadowWorkoutId) : null;
  sessionNoteInputs.forEach((input, index) => {
    input.value = workout?.sessionNotes[index] ?? "";
    const shadowNote = shadowWorkout?.sessionNotes[index] ?? "";
    input.placeholder = shadowNote;
    input.title = shadowNote ? `Shadow session note: ${shadowNote}` : "";
  });
}

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
  workout.timerElapsedMs = getWorkoutElapsedMs(workout);
  workout.timerStartedAt = null;
  workout.status = "completed";
  activeShadowWorkouts.delete(workout.id);
  document.getElementById("announcements").textContent = `${workout.title} finished.`;
  render();
  saveWorkout(true);
  if (cloudSaveTimer) {
    window.clearTimeout(cloudSaveTimer);
    cloudSaveTimer = null;
  }
  if (cloudEnabled) saveCloudState();
}

workoutAction.addEventListener("click", () => {
  if (!workout || workoutAction.disabled) return;
  if (workout.status === "in-progress") {
    finishWorkoutDialog.showModal();
    finishWithoutProofButton.focus();
    return;
  }
  if (workout.status === "completed") {
    resumeCompletedDialog.showModal();
    resumeCompletedButton.focus();
    return;
  }
  workout.status = "in-progress";
  workout.startedAt = new Date().toISOString();
  workout.timerElapsedMs = 0;
  workout.timerStartedAt = Date.now();
  render();
  saveWorkout();
  const firstInput = findNextWorkoutInput();
  if (firstInput) firstInput.focus();
  else document.getElementById("announcements").textContent = "All planned sets are logged.";
});

resumeCompletedButton.addEventListener("click", () => {
  if (!workout) return;
  resumeCompletedDialog.close();
  workout.status = "in-progress";
  workout.timerElapsedMs = Number.isFinite(workout.timerElapsedMs) ? workout.timerElapsedMs : 0;
  workout.timerStartedAt = Date.now();
  render();
  saveWorkout();
  const firstInput = findNextWorkoutInput();
  if (firstInput) firstInput.focus();
  else document.getElementById("announcements").textContent = "Workout resumed. All planned sets are logged; finish to download proof.";
});

startOverCompletedButton.addEventListener("click", () => {
  resumeCompletedDialog.close();
  startOverDialog.showModal();
  cancelStartOverButton.focus();
});

finishWithoutProofButton.addEventListener("click", finishWorkout);

finishWithProofButton.addEventListener("click", () => {
  if (!workout) return;
  const finishedWorkout = workout;
  finishWorkout();
  try {
    downloadWorkoutProof(finishedWorkout);
  } catch (error) {
    showNotice(`Could not download workout proof: ${error.message}`);
    return;
  }
});

function retryPendingCompletions() {
  if (!cloudEnabled || !selectedProfile) return;
  try {
    if (Object.keys(readPendingCompletions(selectedProfile)).length) saveCloudState();
  } catch (error) {
    showNotice("The pending workout finish could not be read. Your saved workout data was left unchanged.");
    console.error("Pending workout completion retry failed:", error);
  }
}

window.addEventListener("online", retryPendingCompletions);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") retryPendingCompletions();
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
      set.myo = false;
      set.myoReps = "";
      set.myoNotes = [];
      set.myoNotesConfirmed = false;
    });
  });
  workout.status = "planned";
  workout.startedAt = new Date().toISOString();
  workout.timerElapsedMs = 0;
  workout.timerStartedAt = null;
  render();
  saveWorkout();
  document.getElementById("announcements").textContent = `${workout.title} reset.`;
  workoutAction.focus();
});

workoutTimerToggle.addEventListener("click", () => {
  if (!workout || workout.status !== "in-progress") return;
  if (Number.isFinite(workout.timerStartedAt)) {
    workout.timerElapsedMs = getWorkoutElapsedMs(workout);
    workout.timerStartedAt = null;
  } else {
    workout.timerStartedAt = Date.now();
  }
  updateWorkoutTimerDisplay();
  saveWorkout();
});

addExerciseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!workout) return;
  const name = exerciseNameInput.value.trim();
  if (!name) {
    exerciseNameInput.focus();
    return;
  }
  beginStructuralUndo(`Add exercise: ${name}`);
  workout.exercises.push({
    id: makeId(),
    planId: makeId(),
    name: name.slice(0, 60),
    sets: [{ id: makeId(), planId: makeId(), weight: "", reps: "", rpe: "", llp: false, llpReps: "", myo: false, myoReps: "", myoNotes: [], myoNotesConfirmed: false }],
  });
  applyWorkoutPlanEdit(workout, workouts);
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
    if (input.dataset.field === "myoReps" && set.myoReps !== input.value) {
      set.myoNotesConfirmed = false;
    }
    set[input.dataset.field] = input.value;
    if (input.dataset.field === "llpReps" && input.value.trim() !== "") {
      set.llp = true;
      input.closest(".llp-cell").querySelector("[data-llp]").checked = true;
    } else if (input.dataset.field === "myoReps") {
      if (input.value.trim() !== "") {
        set.myo = true;
        input.closest(".myo-cell").querySelector("[data-myo]").checked = true;
      }
      updateMyoNotesButton(
        input.closest(".myo-cell"),
        exercise,
        set,
        exercise.sets.indexOf(set) + 1,
      );
    }
    updateInputValidity(input);
    updateExerciseProgress();
    saveWorkout();
    return;
  }

});

const exerciseEditDialog = document.getElementById("exercise-edit-dialog");
const exerciseInfoDialog = document.getElementById("exercise-info-dialog");
let exerciseEditContext = null;
let exerciseInfoReturnFocus = null;

function openExerciseEditor(exercise, trigger) {
  exerciseEditContext = { workoutId: workout.id, exerciseId: exercise.id, trigger };
  document.getElementById("exercise-edit-name").value = exercise.name;
  document.getElementById("exercise-edit-name").setCustomValidity("");
  document.getElementById("exercise-edit-setup").value = exercise.setup || "";
  document.getElementById("exercise-edit-info").open = Boolean(exercise.setup?.trim());
  exerciseEditDialog.showModal();
  document.getElementById("exercise-edit-name").focus({ preventScroll: true });
}

document.getElementById("exercise-edit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const exercise = workout?.id === exerciseEditContext?.workoutId
    ? workout.exercises.find((item) => item.id === exerciseEditContext.exerciseId) : null;
  if (!exercise || exercise.bailed) {
    showNotice("This exercise is no longer available for editing. Close this popup and reopen the workout.");
    return;
  }
  const nameInput = document.getElementById("exercise-edit-name");
  if (!nameInput.value.trim()) {
    nameInput.setCustomValidity("Enter an exercise name.");
    nameInput.reportValidity();
    return;
  }
  const name = nameInput.value.trim().slice(0, 60);
  const setup = document.getElementById("exercise-edit-setup").value.trim().slice(0, 300);
  if (name !== exercise.name || setup !== (exercise.setup || "")) {
    beginStructuralUndo("Edit exercise name and setup");
    exercise.name = name;
    exercise.setup = setup;
    applyWorkoutPlanEdit(workout, workouts);
    propagateExerciseName(workout, exercise, workouts);
    saveWorkout();
    renderExercises();
  }
  exerciseEditDialog.close();
});
document.getElementById("exercise-edit-name").addEventListener("input", (event) => {
  event.target.setCustomValidity("");
});
document.getElementById("cancel-exercise-edit").addEventListener("click", () => exerciseEditDialog.close());
exerciseEditDialog.addEventListener("close", () => {
  const context = exerciseEditContext;
  const trigger = context?.trigger?.isConnected ? context.trigger
    : Array.from(exerciseList.querySelectorAll('[data-action="edit-name"]'))
      .find((button) => button.dataset.exerciseId === context?.exerciseId);
  trigger?.focus({ preventScroll: true });
  exerciseEditContext = null;
});
document.getElementById("close-exercise-info").addEventListener("click", () => exerciseInfoDialog.close());
exerciseInfoDialog.addEventListener("close", () => {
  if (exerciseInfoReturnFocus?.isConnected) exerciseInfoReturnFocus.focus({ preventScroll: true });
  exerciseInfoReturnFocus = null;
});

function clearSetTechnique(set, field) {
  const technique = field === "myoReps" ? "myo" : "llp";
  set[technique] = false;
  set[field] = "";
  if (technique === "myo") {
    set.myoNotes = [];
    set.myoNotesConfirmed = false;
  }
}

exerciseList.addEventListener("change", (event) => {
  const input = event.target.closest("input[data-field]");
  if (!input || getFieldError(input.dataset.field, input.value)) return;
  if (["llpReps", "myoReps"].includes(input.dataset.field) && input.value.trim() === "") {
    const exercise = workout.exercises.find((item) => item.id === input.dataset.exerciseId);
    const set = exercise?.sets.find((item) => item.id === input.dataset.setId);
    if (!set) return;
    clearSetTechnique(set, input.dataset.field);
    const cell = input.closest("td");
    const checkbox = cell.querySelector("input[type='checkbox']");
    checkbox.checked = false;
    cell.querySelector(".myo-notes-button")?.remove();
    document.getElementById(`${set.id}-${input.dataset.field}-hint`)?.remove();
    input.remove();
    saveWorkout();
    checkbox.focus();
    return;
  }
  if (input.dataset.field === "myoReps") {
    const count = Number(input.value);
    if (Number.isInteger(count) && count > 0) {
      const exercise = workout.exercises.find((item) => item.id === input.dataset.exerciseId);
      const set = exercise?.sets.find((item) => item.id === input.dataset.setId);
      if (exercise && set) {
        openMyoNotesDialog(exercise, set, input);
        return;
      }
    }
  }
  if (["weight", "reps", "rpe", "llpReps", "myoReps"].includes(input.dataset.field)) {
    focusNextWorkoutInput(input);
  }
});

exerciseList.addEventListener("keydown", (event) => {
  const input = event.target.closest("input[data-field]");
  if (!input || !["Enter", "Next"].includes(event.key) || getFieldError(input.dataset.field, input.value)) return;
  if (["weight", "reps", "rpe", "llpReps", "myoReps"].includes(input.dataset.field)) {
    event.preventDefault();
    if (input.dataset.field === "myoReps") {
      const count = Number(input.value);
      const exercise = workout.exercises.find((item) => item.id === input.dataset.exerciseId);
      const set = exercise?.sets.find((item) => item.id === input.dataset.setId);
      if (Number.isInteger(count) && count > 0 && exercise && set) {
        openMyoNotesDialog(exercise, set, input);
        return;
      }
    }
    focusNextWorkoutInput(input);
  }
});

exerciseList.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[data-llp], input[data-myo]");
  if (!checkbox) return;
  const exercise = workout.exercises.find((item) => item.id === checkbox.dataset.exerciseId);
  const set = exercise?.sets.find((item) => item.id === checkbox.dataset.setId);
  if (!set) return;
  if (checkbox.dataset.myo) {
    set.myo = checkbox.checked;
    if (!set.myo) {
      set.myoReps = "";
      set.myoNotes = [];
      set.myoNotesConfirmed = false;
      const field = checkbox.closest(".myo-cell").querySelector("input[data-field='myoReps']");
      if (field) field.value = "";
    }
    saveWorkout();
    const setIndex = exercise.sets.indexOf(set);
    checkbox.setAttribute("aria-label", `MYO sets for set ${setIndex + 1} of ${exercise.name || "unnamed exercise"}`);
    const cell = checkbox.closest(".myo-cell");
    const shadowSet = findShadowSet(exercise, set);
    const numberField = cell.querySelector("input[data-field='myoReps']");
    if ((set.myo || shadowSet?.myo) && !numberField) {
      appendMyoRepsInput(cell, exercise, set, setIndex + 1);
      if (set.myo) cell.querySelector("input[data-field='myoReps']").focus();
    } else if (set.myo && numberField) {
      numberField.focus();
    } else if (!set.myo && !shadowSet?.myo && numberField) {
      numberField.remove();
      cell.querySelector(".myo-notes-button")?.remove();
      checkbox.focus();
    }
    return;
  }
  set.llp = checkbox.checked;
  saveWorkout();
  const cell = checkbox.closest(".llp-cell");
  const setIndex = exercise.sets.indexOf(set);
  const numberField = cell.querySelector("input[data-field='llpReps']");
  if (set.llp && !numberField) {
    appendLlpRepsInput(cell, exercise, set, setIndex + 1);
    cell.querySelector("input[data-field='llpReps']").focus();
  } else if (set.llp && numberField) {
    numberField.focus();
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
  if (button.dataset.action === "target") {
    openTargetDialog(workout, exercise, button);
    return;
  }
  if (button.dataset.action === "history") {
    openExerciseHistory(workout, exercise, button);
    return;
  }
  if (button.dataset.action === "edit-name") {
    if (exercise.bailed) return;
    openExerciseEditor(exercise, button);
    return;
  }
  if (button.dataset.action === "exercise-info") {
    exerciseInfoReturnFocus = button;
    document.getElementById("exercise-info-title").textContent = "Setup";
    document.getElementById("exercise-info-content").textContent = exercise.setup?.trim()
      || "No machine / cable setup info added";
    exerciseInfoDialog.showModal();
    document.getElementById("close-exercise-info").focus({ preventScroll: true });
    return;
  }
  if (button.dataset.action === "myo-notes") {
    const set = exercise.sets.find((item) => item.id === button.dataset.setId);
    if (set) openMyoNotesDialog(exercise, set, button, true);
    return;
  }
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
          set.myo = false;
          set.myoReps = "";
          set.myoNotes = [];
          set.myoNotesConfirmed = false;
          return;
        }
        set.weight = snapshot.weight;
        set.reps = snapshot.reps;
        set.rpe = snapshot.rpe;
        set.llp = snapshot.llp;
        set.llpReps = snapshot.llpReps;
        set.myo = snapshot.myo === true;
        set.myoReps = snapshot.myoReps ?? "";
        set.myoNotes = [...(snapshot.myoNotes ?? [])];
        set.myoNotesConfirmed = snapshot.myoNotesConfirmed === true;
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
    beginStructuralUndo(`Add set to ${exercise.name}`);
    const set = { id: makeId(), planId: makeId(), weight: "", reps: "", rpe: "", llp: false, llpReps: "", myo: false, myoReps: "", myoNotes: [], myoNotesConfirmed: false };
    exercise.sets.push(set);
    applyWorkoutPlanEdit(workout, workouts);
    focusId = `add-set-${exercise.id}`;
    announcement = `Set ${exercise.sets.length} added to ${exercise.name}.`;
  } else if (button.dataset.action === "remove-set") {
    pendingDeleteSet = { workoutId: workout.id, exerciseId: exercise.id, setId: button.dataset.setId, trigger: button };
    document.getElementById("delete-set-scope").textContent = mirroringEnabled
      ? "This removes the set and its recorded values from this week and all remaining weeks."
      : "This removes the set and its recorded values from this week only.";
    document.getElementById("delete-set-title").textContent =
      `Delete set ${exercise.sets.findIndex((set) => set.id === button.dataset.setId) + 1} from ${exercise.name}?`;
    deleteSetDialog.showModal();
    document.getElementById("cancel-delete-set").focus();
    return;
  } else {
    return;
  }

  render();
  saveWorkout();
  document.getElementById("announcements").textContent = announcement;
  const focusTarget = focusId && document.getElementById(focusId);
  (focusTarget || exerciseNameInput).focus();
});

const deleteSetDialog = document.getElementById("delete-set-dialog");
let pendingDeleteSet = null;
document.getElementById("cancel-delete-set").addEventListener("click", () => deleteSetDialog.close());
deleteSetDialog.addEventListener("close", () => {
  const trigger = pendingDeleteSet?.trigger;
  pendingDeleteSet = null;
  if (trigger?.isConnected) trigger.focus({ preventScroll: true });
});
document.getElementById("confirm-delete-set").addEventListener("click", () => {
  if (!pendingDeleteSet || workout?.id !== pendingDeleteSet.workoutId) return;
  const exercise = workout.exercises.find((item) => item.id === pendingDeleteSet.exerciseId);
  if (!exercise?.sets.some((item) => item.id === pendingDeleteSet.setId)) return;
  beginStructuralUndo(`Delete set from ${exercise.name}`);
  exercise.sets = exercise.sets.filter((item) => item.id !== pendingDeleteSet.setId);
  applyWorkoutPlanEdit(workout, workouts);
  pendingDeleteSet = null;
  deleteSetDialog.close();
  render();
  saveWorkout();
  document.getElementById(`add-set-${exercise.id}`)?.focus({ preventScroll: true });
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
  beginStructuralUndo(`Delete exercise: ${exercise.name}`);
  const removedIndex = workout.exercises.indexOf(exercise);
  workout.exercises = workout.exercises.filter((item) => item.id !== exercise.id);
  applyWorkoutPlanEdit(workout, workouts);
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
    myo: set.myo,
    myoReps: set.myoReps,
    myoNotes: [...(set.myoNotes ?? [])],
    myoNotesConfirmed: set.myoNotesConfirmed === true,
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

myoNotesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!pendingMyoNotes || pendingMyoNotes.viewing) return;
  const { exerciseId, setId, count, scrollX, scrollY } = pendingMyoNotes;
  const exercise = workout?.exercises.find((item) => item.id === exerciseId);
  const set = exercise?.sets.find((item) => item.id === setId);
  if (!exercise || !set) {
    myoNotesDialog.close();
    pendingMyoNotes = null;
    return;
  }
  set.myo = true;
  set.myoReps = String(count);
  set.myoNotes = Array.from(myoNotesRows.querySelectorAll("input"), (input) => input.value.trim());
  set.myoNotesConfirmed = true;
  pendingMyoNotes = null;
  myoNotesDialog.close();
  render();
  saveWorkout();
  exerciseList.querySelector(
    `[data-action="myo-notes"][data-exercise-id="${exercise.id}"][data-set-id="${set.id}"]`,
  )?.focus({ preventScroll: true });
  const restoreScroll = () => window.scrollTo(scrollX, scrollY);
  restoreScroll();
  window.requestAnimationFrame(restoreScroll);
  [100, 350].forEach((delay) => window.setTimeout(restoreScroll, delay));
});

editMyoNotesButton.addEventListener("click", () => {
  setMyoNotesViewing(false);
  myoNotesRows.querySelector("input")?.focus();
});

cancelMyoNotesButton.addEventListener("click", () => {
  const trigger = pendingMyoNotes?.trigger;
  pendingMyoNotes = null;
  myoNotesDialog.close();
  if (trigger?.isConnected) trigger.focus({ preventScroll: true });
});

myoNotesDialog.addEventListener("close", () => {
  const trigger = pendingMyoNotes?.trigger;
  pendingMyoNotes = null;
  if (trigger?.isConnected) trigger.focus({ preventScroll: true });
});

welcomeScreen.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-profile]");
  if (button) activateProfile(button.dataset.profile);
});

switchProfileButton.addEventListener("click", returnToProfilePicker);

cloudLoginButton.addEventListener("click", async () => {
  if (!supabaseClient) return;
  cloudLoginButton.disabled = true;
  setCloudLoginMessage("Opening Google sign-in…");
  try {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw error;
  } catch (error) {
    cloudLoginButton.disabled = false;
    setCloudLoginMessage("Google sign-in couldn't be started. Check the Supabase Google provider setup and try again.");
    console.error("Google sign-in failed:", error);
  }
});

async function signOutOfCloud() {
  if (!supabaseClient) return;
  if (selectedProfile) returnToProfilePicker();
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    showNotice("Sign out failed. Check your connection and try again.");
    console.error("Cloud sign-out failed:", error);
    return;
  }
  showCloudProfilePicker(false);
  setCloudLoginMessage("You have been signed out.");
}

cloudSignoutActiveButton.addEventListener("click", signOutOfCloud);

document.addEventListener("focusout", () => window.setTimeout(applyPendingCloudState, 0));
window.addEventListener("online", () => {
  if (cloudEnabled && selectedProfile) scheduleCloudSave();
});

window.setInterval(updateWorkoutTimerDisplay, 1000);
function initializePullToRefresh() {
  const shell = document.getElementById("app-shell");
  const indicator = document.getElementById("pull-refresh-indicator");
  let start = null;
  let distance = 0;
  let refreshing = false;
  let pulling = false;
  let settleTimer = null;
  const movePage = (offset, dragging = false) => {
    if (settleTimer) window.clearTimeout(settleTimer);
    settleTimer = null;
    shell.classList.add("pull-refresh-moving");
    for (const element of [shell, indicator]) {
      element.classList.toggle("is-pulling", dragging);
      element.style.setProperty("--pull-distance", `${offset}px`);
    }
    indicator.style.setProperty("--pull-progress", String(Math.min(1, offset / 64)));
  };
  const reset = () => {
    const wasMoving = pulling || refreshing || shell.classList.contains("pull-refresh-moving");
    start = null;
    distance = 0;
    pulling = false;
    if (!refreshing && wasMoving) {
      movePage(0);
      indicator.classList.remove("is-ready");
      settleTimer = window.setTimeout(() => {
        shell.classList.remove("pull-refresh-moving");
        shell.style.removeProperty("--pull-distance");
        indicator.hidden = true;
        settleTimer = null;
      }, 280);
    }
  };
  const eligible = () => !shell.hidden && Boolean(selectedProfile)
    && !refreshWorkoutButton.disabled && !document.querySelector("dialog[open]");
  document.documentElement.classList.add("pull-refresh-enabled");
  document.addEventListener("touchstart", (event) => {
    if (refreshing) return;
    reset();
    if (event.touches.length !== 1 || window.scrollY > 0 || !eligible()) return;
    if (event.target.closest("input, textarea, select, button, a, summary, [contenteditable], [role='slider']")) return;
    for (let node = event.target; node && node !== document.body; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight
        && /auto|scroll/.test(window.getComputedStyle(node).overflowY)) return;
    }
    start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  document.addEventListener("touchmove", (event) => {
    if (!start || refreshing) return;
    if (event.touches.length !== 1 || !eligible() || window.scrollY > 0) {
      reset();
      return;
    }
    const dx = event.touches[0].clientX - start.x;
    const dy = event.touches[0].clientY - start.y;
    if (!pulling && (dy < 0 || Math.abs(dx) > Math.max(10, dy))) {
      reset();
      return;
    }
    if (dy < 8 && !pulling) return;
    if (!event.cancelable) {
      reset();
      return;
    }
    event.preventDefault();
    pulling = true;
    distance = 112 * (1 - Math.exp(-Math.max(0, dy) / 160));
    indicator.hidden = false;
    movePage(distance, true);
    indicator.querySelector("svg").style.transform = `rotate(${distance * 3}deg)`;
    indicator.classList.toggle("is-ready", distance >= 64);
  }, { passive: false });
  document.addEventListener("touchend", async () => {
    const shouldRefresh = pulling && distance >= 64 && eligible();
    if (!shouldRefresh || refreshing) {
      reset();
      return;
    }
    refreshing = true;
    start = null;
    pulling = false;
    indicator.hidden = false;
    movePage(64);
    indicator.querySelector("svg").style.removeProperty("transform");
    indicator.classList.add("is-refreshing");
    const minimumSpin = new Promise((resolve) => window.setTimeout(resolve, 750));
    try {
      await refreshWorkoutData();
    } finally {
      await minimumSpin;
      refreshing = false;
      indicator.classList.remove("is-refreshing");
      reset();
    }
  });
  document.addEventListener("touchcancel", reset, { passive: true });
}

initializePullToRefresh();
initializeCloud();
