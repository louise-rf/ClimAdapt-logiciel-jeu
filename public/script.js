let actions = [];
let chart = null;
let mode = 0;
let history = [0];
let roomState = null;
let currentUser = null;
let isMaster = false;
let actionsReady = false;
let roomReady = false;
let roomInitialized = false;
let roomSubscribed = false;
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let roomRef = null;
let sessionRole = null;
let appBootstrapped = false;
let masterClaimAttempted = false;

const actionsCsvPath =
  document.body?.dataset.actionsCsv || "actions_selection.csv";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCgd2Z6NQS8risX-5W8F-hmcCRTxs-vYaM",
  authDomain: "climadapt-akteo-multi.firebaseapp.com",
  databaseURL:
    "https://climadapt-akteo-multi-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "climadapt-akteo-multi",
  storageBucket: "climadapt-akteo-multi.firebasestorage.app",
  messagingSenderId: "1070521178456",
  appId: "1:1070521178456:web:448844a4127d729cfaad2d",
};

const ROOM_PATH = "rooms/public-room";
const ACCESS_CODES = {
  "0000": "player",
  "1702": "master",
};

function getFirebaseAppName(role) {
  return role === "master"
    ? "climadapt-master-session"
    : "climadapt-player-session";
}
const RESOURCE_CATEGORY_ORDER = [
  "Ressources Techniques",
  "Ressources Solutions fondées sur la Nature",
  "Ressources Organisationnelles",
  "Ressources Financières",
  "Ressources Humaines",
];

const DEFAULT_ROOM_STATE = {
  masterUid: null,
  mode: 0,
  resetVersion: 0,
  selectedIds: {},
  history: [0],
  score: 0,
  updatedAt: 0,
};

const grid = document.getElementById("grid");
const categoryFilterSelect = document.getElementById("categoryFilter");

function normalizeTextKey(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);

  return rows.filter((currentRow) =>
    currentRow.some((cell) => cell.trim() !== "")
  );
}

function normalizeResourceCategory(category) {
  const cleaned = normalizeTextKey(
    (category || "").replace(/^Ressources\s+/i, "")
  );

  const canonicalByKey = {
    technique: "Ressources Techniques",
    techniques: "Ressources Techniques",
    humaines: "Ressources Humaines",
    organisationnelles: "Ressources Organisationnelles",
    financieres: "Ressources Financières",
    "solutions fondees sur la nature":
      "Ressources Solutions fondées sur la Nature",
  };

  return canonicalByKey[cleaned] || `Ressources ${(category || "").trim()}`;
}

function getActionTitle(row) {
  for (const key of [
    "Titre de l’action d’adaptation",
    "Titre de l'action d'adaptation",
    "Titre de l’action",
    "Titre de l'action",
    "Titre",
  ]) {
    const value = (row?.[key] || "").trim();
    if (value) {
      return value;
    }
  }
  return "(sans titre)";
}

function formatActionLabel(action) {
  const description = (action.description || "").trim();
  return description.replace(
    /\(ex\s*:\s*(.*?)\)/g,
    '<span class="ex">(ex : $1)</span>'
  );
}

function showMessage(message) {
  const msg = document.getElementById("msg");
  if (msg) {
    msg.textContent = message || "";
  }
}

function setRoleBadge(text) {
  const roleBadge = document.getElementById("roleBadge");
  if (roleBadge) {
    roleBadge.textContent = text;
  }
}

function isCurrentUserMaster() {
  return Boolean(
    sessionRole === "master" &&
    currentUser &&
    roomState &&
    roomState.masterUid === currentUser.uid
  );
}

function setRoleGateError(text) {
  const roleGateError = document.getElementById("roleGateError");
  if (roleGateError) {
    roleGateError.textContent = text || "";
  }
}

function hideRoleGate() {
  const gate = document.getElementById("roleGate");
  if (gate) {
    gate.classList.add("hidden");
    gate.style.display = "none";
  }
}

function showRoleGate() {
  const gate = document.getElementById("roleGate");
  if (gate) {
    gate.classList.remove("hidden");
    gate.style.display = "flex";
  }
}

function showAppShell() {
  const appShell = document.getElementById("appShell");
  if (appShell) {
    appShell.classList.remove("hidden");
    appShell.style.display = "block";
  }
}

function hideAppShell() {
  const appShell = document.getElementById("appShell");
  if (appShell) {
    appShell.classList.add("hidden");
    appShell.style.display = "none";
  }
}

async function bootstrapApp(role) {
  if (appBootstrapped) {
    return;
  }

  sessionRole = role;
  setRoleBadge(role === "master" ? "Maître de partie" : "Joueur");
  setRoleGateError("Chargement en cours...");
  const submit = document.getElementById("roleCodeSubmit");
  const input = document.getElementById("roleCodeInput");

  if (submit) {
    submit.disabled = true;
  }

  if (input) {
    input.disabled = true;
  }

  try {
    initFirebase();
    await loadActionsFromCSV();
    showAppShell();
    hideRoleGate();
    document.body.classList.remove("role-gate-open");
    document.body.classList.add("app-open");
    applyInitialVisibility();
    appBootstrapped = true;
    setRoleGateError("");
  } catch (error) {
    console.error(error);
    appBootstrapped = false;
    setRoleGateError("Impossible de démarrer la partie.");

    if (submit) {
      submit.disabled = false;
    }

    if (input) {
      input.disabled = false;
      input.focus();
    }
  }
}

function handleRoleCodeSubmit() {
  const input = document.getElementById("roleCodeInput");
  const rawCode = (input?.value || "").trim();
  const normalizedCode = rawCode.replace(/\s+/g, "");
  const role = ACCESS_CODES[normalizedCode];

  if (!role) {
    setRoleGateError("Code invalide.");
    return;
  }

  setRoleGateError("Accès autorisé. Chargement...");
  bootstrapApp(role).catch((error) => {
    console.error(error);
    appBootstrapped = false;
    setRoleGateError("Impossible de démarrer la partie.");
  });
}

function normalizeRoomState(value) {
  const next = {
    ...DEFAULT_ROOM_STATE,
    ...(value || {}),
  };

  const selectedIds = value?.selectedIds || {};
  next.selectedIds = Array.isArray(selectedIds)
    ? selectedIds.reduce((acc, entry, index) => {
        if (entry) {
          acc[String(index)] = true;
        }
        return acc;
      }, {})
    : { ...selectedIds };

  const historyValue = value?.history;
  if (Array.isArray(historyValue)) {
    next.history = [...historyValue];
  } else if (historyValue && typeof historyValue === "object") {
    next.history = Object.keys(historyValue)
      .sort((left, right) => Number(left) - Number(right))
      .map((key) => historyValue[key])
      .filter((entry) => entry !== undefined && entry !== null);
  } else {
    next.history = [0];
  }

  if (!Array.isArray(next.history) || next.history.length === 0) {
    next.history = [0];
  }

  next.mode = Number(next.mode) || 0;
  next.resetVersion = Number(next.resetVersion) || 0;
  next.score = Number(next.score) || 0;
  return next;
}

function getSelectedActionsFromState(state) {
  const selectedIds = state?.selectedIds || {};
  return actions.filter((action) => selectedIds[String(action.id)]);
}

function getOrderedCategories() {
  const categories = [...new Set(
    actions
      .map((action) => action.cat)
      .filter(Boolean)
  )];

  return categories.sort((left, right) => {
    const leftIndex = RESOURCE_CATEGORY_ORDER.indexOf(left);
    const rightIndex = RESOURCE_CATEGORY_ORDER.indexOf(right);

    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    }

    return left.localeCompare(right, "fr", { sensitivity: "base" });
  });
}

function computeMetricsFromSelection(selectedActions) {
  const tags = selectedActions.map((action) => Number(action.tag));
  const categories = [...new Set(selectedActions.map((action) => action.cat))];
  let score = 0;

  const criteria = {
    1: false,
    2: false,
    3: false,
    4: false,
    5: false,
    6: false,
    7: false,
    8: false,
    9: false,
    10: false,
  };

  if (tags.includes(1)) {
    score++;
    criteria[1] = true;
  }

  if (tags.includes(2)) {
    score++;
    criteria[2] = true;
  }

  if (tags.includes(3)) {
    score++;
    criteria[3] = true;
  }

  if (tags.includes(4)) {
    score++;
    criteria[4] = true;
  }

  if (tags.filter((tag) => tag === 5).length > 1) {
    score++;
    criteria[5] = true;
  }

  const nature = selectedActions.filter((action) =>
    (action.cat || "").includes("Nature")
  ).length;
  const tech = selectedActions.filter((action) =>
    (action.cat || "").includes("Techniques")
  ).length;

  if (tags.includes(6) && nature / ((nature + tech) || 1) >= 0.5) {
    score++;
    criteria[6] = true;
  }

  if (tags.includes(7)) {
    score++;
    criteria[7] = true;
  }

  if (tags.includes(8) && !tags.includes(9)) {
    score++;
    criteria[8] = true;
  }

  if (tags.includes(10)) {
    score++;
    criteria[9] = true;
  }

  const neededCategories = [
    "Ressources Solutions fondées sur la Nature",
    "Ressources Organisationnelles",
    "Ressources Financières",
    "Ressources Humaines",
    "Ressources Techniques",
  ];

  if (neededCategories.every((category) => categories.includes(category))) {
    score++;
    criteria[10] = true;
  }

  score = Math.max(0, Math.min(10, score));

  return {
    score,
    criteria,
    categories,
  };
}

function updateFinalAnalysis(criteria) {
  const axis1 = ((criteria[4] + criteria[5]) / 2) * 100;
  const axis2 = ((criteria[1] + criteria[2]) / 2) * 100;
  const axis3 =
    ((criteria[3] + criteria[6] + criteria[8] + criteria[10]) / 4) * 100;
  const axis4 = ((criteria[7] + criteria[9]) / 2) * 100;

  const axis1Fill = document.getElementById("axis1Fill");
  const axis2Fill = document.getElementById("axis2Fill");
  const axis3Fill = document.getElementById("axis3Fill");
  const axis4Fill = document.getElementById("axis4Fill");

  if (axis1Fill) axis1Fill.style.width = `${axis1}%`;
  if (axis2Fill) axis2Fill.style.width = `${axis2}%`;
  if (axis3Fill) axis3Fill.style.width = `${axis3}%`;
  if (axis4Fill) axis4Fill.style.width = `${axis4}%`;
}

function initChart(initialHistory = [0]) {
  const ctx = document.getElementById("chart");
  if (!ctx) {
    return;
  }

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: initialHistory.map((_, index) => index),
      datasets: [
        {
          data: initialHistory,
          tension: 0.3,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        y: { min: 0, max: 10 },
      },
    },
  });
}

function syncChartFromState(state) {
  if (!chart) {
    initChart(state.history || [0]);
    return;
  }

  const nextHistory = Array.isArray(state.history) && state.history.length
    ? state.history
    : [0];

  chart.data.labels = nextHistory.map((_, index) => index);
  chart.data.datasets[0].data = nextHistory;
  chart.update();
}

function renderModeUI(nextMode) {
  const homeScreen = document.getElementById("homeScreen");
  const dashboard = document.getElementById("dashboard");
  const sidebar = document.querySelector(".sidebar");
  const gridEl = document.getElementById("grid");
  const header = document.getElementById("mainHeader");
  const chartCardEl = document.querySelector(".chart-card");
  const riskCardEl = document.querySelector(".risk-card");
  const categoryFilterWrap = document.getElementById("categoryFilterWrap");
  const modeLabel = document.getElementById("modeLabel");
  const modeTitle = document.getElementById("modeTitle");
  const chartTitle = document.querySelector(".chart-card h3");
  const canvas = document.getElementById("chart");
  const pdfBtn = document.getElementById("pdfBtn");
  const criteriaBox = document.getElementById("criteriaBox");

  const modeCopy = {
    1: {
      label: "Manche 1",
      title: "Découvrir des actions d'adaptation",
    },
    2: {
      label: "Manche 2",
      title: "Elaborer une stratégie d'adaptation",
    },
    3: {
      label: "Manche 3",
      title: "Une amélioration continue",
    },
  };

  if (homeScreen) homeScreen.classList.toggle("hidden", nextMode !== 0);
  if (dashboard) dashboard.classList.toggle("hidden", nextMode === 0);
  if (sidebar) sidebar.classList.toggle("hidden", nextMode === 0);
  if (gridEl) gridEl.classList.toggle("hidden", nextMode === 0);
  if (header) header.classList.toggle("hidden", nextMode === 0);

  if (modeLabel && modeCopy[nextMode]) {
    modeLabel.textContent = modeCopy[nextMode].label;
  }

  if (modeTitle && modeCopy[nextMode]) {
    modeTitle.textContent = modeCopy[nextMode].title;
  }

  if (categoryFilterWrap) {
    categoryFilterWrap.style.display = nextMode >= 1 ? "flex" : "none";
  }

  if (chartCardEl) {
    chartCardEl.style.display = nextMode >= 2 ? "" : "none";
  }

  if (riskCardEl) {
    riskCardEl.style.display = nextMode >= 2 ? "" : "none";
  }

  if (criteriaBox) {
    criteriaBox.style.display = "none";
  }

  if (chartTitle) {
    chartTitle.classList.remove("future-title");
    if (nextMode === 1) {
      chartTitle.textContent = "À venir ...";
      chartTitle.classList.add("future-title");
    } else if (nextMode >= 2) {
      chartTitle.textContent = nextMode === 3 ? "Analyse finale" : "Évolution du score";
    }
  }

  if (canvas) {
    canvas.classList.toggle("hidden-chart", nextMode === 1 || nextMode === 3);
    if (nextMode === 2) {
      canvas.style.removeProperty("display");
    }
  }

  if (pdfBtn) {
    pdfBtn.classList.toggle("pdf-hidden", nextMode !== 3);
  }

  const finalAnalysis = document.getElementById("finalAnalysis");
  if (finalAnalysis) {
    finalAnalysis.classList.toggle("hidden", nextMode !== 3);
  }

  const startButton = document.querySelector(".home-screen__cta");
  const homeMeta = document.querySelector(".home-screen__meta");
  if (startButton) {
    startButton.textContent = "Commencer l'atelier";
    startButton.style.display = isCurrentUserMaster() && nextMode === 0 ? "" : "none";
  }

  if (homeMeta) {
    homeMeta.textContent = isCurrentUserMaster()
      ? "Maître de partie"
      : "Mode joueur";
  }
}

function updatePermissionUI() {
  const modeBox = document.querySelector(".mode-box");
  const modeButtons = document.querySelectorAll(".mode-box button");
  const resetBtn = document.querySelector(".reset-btn");
  const startBtn = document.querySelector(".home-screen__cta");
  const roleIsMaster = isCurrentUserMaster();

  if (modeBox) {
    modeBox.style.display = roleIsMaster ? "flex" : "none";
  }

  modeButtons.forEach((button) => {
    button.disabled = !roleIsMaster;
    button.title = roleIsMaster
      ? ""
      : "Réservé au maître de partie";
    button.style.display = roleIsMaster ? "" : "none";
  });

  if (resetBtn) {
    resetBtn.disabled = !roleIsMaster;
    resetBtn.title = roleIsMaster
      ? ""
      : "Réservé au maître de partie";
    resetBtn.style.display = roleIsMaster ? "" : "none";
  }

  if (startBtn) {
    startBtn.disabled = !roleIsMaster;
    startBtn.title = roleIsMaster
      ? ""
      : "Réservé au maître de partie";
    startBtn.style.display = roleIsMaster && mode === 0 ? "" : "none";
  }

  const roleBadge = document.getElementById("roleBadge");
  if (roleBadge) {
    roleBadge.textContent = roleIsMaster
      ? "Maître de partie"
      : "Joueur";
  }
}

function renderCategoryFilter() {
  if (!categoryFilterSelect) {
    return;
  }

  const categories = getOrderedCategories();

  categoryFilterSelect.innerHTML =
    `<option value="">Tout afficher</option>` +
    categories.map((category) => `<option value="${category}">${category}</option>`).join("");

  categoryFilterSelect.value = "";
}

function applyCategoryFilter() {
  const selectedCategory = categoryFilterSelect?.value || "";

  document.querySelectorAll(".category-section").forEach((section) => {
    const matchCategory =
      selectedCategory === "" || section.dataset.cat === selectedCategory;
    section.style.display = matchCategory ? "" : "none";
  });
}

function renderActionsGrid() {
  if (!grid) {
    return;
  }

  grid.innerHTML = "";

  const categories = getOrderedCategories();

  let globalNumber = 1;

  categories.forEach((category) => {
    const section = document.createElement("div");
    section.className = "category-section";
    section.dataset.cat = category;
    section.innerHTML = `
      <h2 class="cat-title">${category}</h2>
      <div class="actions-grid"></div>
    `;

    const actionsGrid = section.querySelector(".actions-grid");
    actions
      .filter((action) => action.cat === category && isActionVisibleForRole(action))
      .forEach((action) => {
        const card = document.createElement("div");
        card.className = "action-card";
        card.dataset.cat = action.cat;
        card.dataset.actionId = String(action.id);
        card.dataset.displayNumber = String(globalNumber);
        card.innerHTML = buildActionCardMarkup(action, globalNumber);
        actionsGrid.appendChild(card);
        globalNumber++;
      });

    grid.appendChild(section);
  });

  renderCategoryFilter();
  applyCategoryFilter();
}

function isActionVisibleForRole() {
  return true;
}

function buildActionCardMarkup(action, number) {
  return `
    <div class="action-card__inner">
      <div class="action-card__face action-card__face--front">
        <input
          class="action-checkbox"
          type="checkbox"
          data-id="${action.id}"
          data-display-number="${number}"
          data-cat="${action.cat}"
          data-tag="${action.tag}"
        >

        <div class="action-card__content">
          <div class="action-card__title">
            <strong>${number}.</strong> ${action.title}
          </div>

          <button type="button" class="action-card__flip-btn">
            En savoir plus ...
          </button>

          <button type="button" class="select-btn">
            Sélectionner
          </button>
        </div>
      </div>

      <div class="action-card__face action-card__face--back">
        <div class="action-card__back-copy">
          <div class="action-card__back-title">Exemple</div>
          <div class="action-card__desc">
            ${formatActionLabel(action)}
          </div>
        </div>

        <button type="button" class="action-card__back-btn">
          Retour
        </button>
      </div>
    </div>
  `;
}

function renderSelectionState(state) {
  const selectedIds = state?.selectedIds || {};

  document.querySelectorAll(".action-card").forEach((card) => {
    const checkbox = card.querySelector(".action-checkbox");
    const selectButton = card.querySelector(".select-btn");
    if (!checkbox || !selectButton) {
      return;
    }

    const checked = Boolean(selectedIds[checkbox.dataset.id]);
    checkbox.checked = checked;
    card.classList.toggle("selected", checked);
    selectButton.textContent = checked ? "✓" : "Sélectionner";
  });
}

function renderScoreBlock(state) {
  const selectedActions = getSelectedActionsFromState(state);
  const metrics = computeMetricsFromSelection(selectedActions);
  const score = metrics.score;
  const selectedCount = selectedActions.length;
  const revealScore =
    state.mode === 2 || state.mode === 3 || selectedCount === 15;
  const ratio = score / 10;

  const scoreEl = document.getElementById("score");
  const scoreGaugeFill = document.getElementById("scoreGaugeFill");
  const actionProgressFill = document.getElementById("actionProgressFill");
  const actionProgress = actionProgressFill
    ? actionProgressFill.parentElement
    : null;
  const countEl = document.getElementById("count");
  const summary = document.getElementById("summaryText");

  if (scoreEl) {
    scoreEl.textContent = revealScore ? String(score) : "??";
    scoreEl.classList.toggle("score--placeholder", !revealScore);
    scoreEl.style.color = revealScore
      ? `rgb(${Math.round(255 * (1 - ratio))},${Math.round(255 * ratio)},0)`
      : "var(--text_color)";
  }

  if (scoreGaugeFill && scoreGaugeFill.parentElement?.parentElement) {
    scoreGaugeFill.parentElement.parentElement.style.setProperty(
      "--score-ratio",
      revealScore ? String(ratio) : "0"
    );
  }

  if (actionProgressFill) {
    const actionRatio = Math.min(selectedCount, 15) / 15;
    actionProgressFill.style.width = `${actionRatio * 100}%`;
    if (actionProgress) {
      actionProgress.classList.toggle("action-progress--full", selectedCount >= 15);
    }
  }

  if (countEl) {
    countEl.textContent = String(selectedCount);
  }

  if (summary) {
    const numbers = [...document.querySelectorAll('#grid input[type="checkbox"]:checked')]
      .map((input) => Number(input.dataset.displayNumber))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);

    summary.innerHTML = `Actions : ${
      numbers.length ? numbers.join(", ") : "0 action"
    }`;
  }

  updateFinalAnalysis(metrics.criteria);
  syncChartFromState(state);
}

function renderRoomState() {
  if (!roomState) {
    return;
  }

  mode = roomState.mode;
  history = Array.isArray(roomState.history) && roomState.history.length
    ? [...roomState.history]
    : [0];

  renderModeUI(mode);
  renderSelectionState(roomState);
  renderScoreBlock(roomState);
  updatePermissionUI();
  showMessage("");
}

function ensureChartExists() {
  if (!chart) {
    initChart(history);
  }
}

function maybeRender() {
  if (!actionsReady || !roomReady) {
    return;
  }

  ensureChartExists();
  renderRoomState();
}

async function loadActionsFromCSV() {
  const response = await fetch(new URL(actionsCsvPath, window.location.href));
  const csvText = await response.text();

  const rows = parseCSV(csvText);
  const headers = rows.shift() || [];
  const headerIndex = new Map(
    headers.map((header, index) => [
      normalizeTextKey(header.replace(/^\uFEFF/, "")),
      index,
    ])
  );

  const getCell = (row, possibleHeaders) => {
    for (const header of possibleHeaders) {
      const index = headerIndex.get(normalizeTextKey(header));
      if (index !== undefined) {
        return row[index]?.trim() || "";
      }
    }
    return "";
  };

  actions = rows.map((row, index) => {
    const category = normalizeResourceCategory(
      getCell(row, ["Cat", "Categorie ressources"])
    );

    return {
      id: index + 1,
      title: getCell(row, [
        "Titre",
        "Titre de l'action",
        "Titre de l'action d'adaptation",
      ]),
      description: getCell(row, ["Exemple"]),
      cat: category,
      tag: Number(getCell(row, ["Tag", "Score"])),
    };
  });

  renderActionsGrid();
  actionsReady = true;
  maybeRender();
}

function initFirebase() {
  if (!window.firebase) {
    showMessage("Firebase SDK manquant.");
    return;
  }

  const firebaseAppName = getFirebaseAppName(sessionRole);

  if (firebase.apps.find((app) => app.name === firebaseAppName)) {
    firebaseApp = firebase.app(firebaseAppName);
  } else {
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG, firebaseAppName);
  }

  firebaseAuth = firebase.auth(firebaseApp);
  firebaseDb = firebase.database(firebaseApp);
  roomRef = firebaseDb.ref(ROOM_PATH);

  firebaseAuth
    .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch(() => {});

  firebaseAuth.onAuthStateChanged(async (user) => {
    currentUser = user;

    if (!user) {
      showMessage("Connexion Firebase en cours...");
      return;
    }

    isMaster = isCurrentUserMaster();
    updatePermissionUI();
    maybeRender();

    if (sessionRole === "master") {
      await claimMasterControl();
    }

    ensureRoomSubscription();
  });

  if (!firebaseAuth.currentUser) {
    firebaseAuth.signInAnonymously().catch((error) => {
      console.error(error);
      showMessage(
        "Connexion anonyme Firebase impossible. Active l'authentification anonyme."
      );
    });
  }
}

async function claimMasterControl() {
  if (!roomRef || !currentUser || sessionRole !== "master" || masterClaimAttempted) {
    return;
  }

  masterClaimAttempted = true;

  try {
    const result = await roomRef.transaction((current) => {
      const next = normalizeRoomState(current);
      next.masterUid = currentUser.uid;
      next.updatedAt = Date.now();
      return next;
    });

    if (!result.committed) {
      showMessage("Le maître de partie n'a pas pu être revendiqué sur Firebase.");
    }
  } catch (error) {
    console.error(error);
    showMessage("Le maître de partie n'a pas pu être revendiqué sur Firebase.");
  }
}

function ensureRoomSubscription() {
  if (roomSubscribed || !roomRef || !currentUser) {
    return;
  }

  roomSubscribed = true;
  roomRef.on("value", (snapshot) => {
    roomState = normalizeRoomState(snapshot.val());
    roomReady = true;
    isMaster = isCurrentUserMaster();
    maybeRender();
  });
}

async function requestSelectionToggle(actionId) {
  if (!roomRef) {
    return;
  }

  try {
    await roomRef.transaction((current) => {
      const next = normalizeRoomState(current);
      const key = String(actionId);

      if (next.selectedIds[key]) {
        delete next.selectedIds[key];
      } else {
        next.selectedIds[key] = true;
      }

      const selectedActions = getSelectedActionsFromState(next);
      const metrics = computeMetricsFromSelection(selectedActions);
      next.score = metrics.score;
      next.history = [...(next.history || [0]), metrics.score];
      next.updatedAt = Date.now();

      return next;
    });
  } catch (error) {
    console.error(error);
    showMessage("Impossible de synchroniser la sélection.");
  }
}

async function requestModeChange(nextMode) {
  if (!roomRef || !isCurrentUserMaster()) {
    showMessage("Réservé au maître de partie.");
    return;
  }

  try {
    await roomRef.transaction((current) => {
      const next = normalizeRoomState(current);
      next.mode = nextMode;
      next.resetVersion = (Number(next.resetVersion) || 0) + 1;

      if (nextMode === 1 || nextMode === 2 || nextMode === 3) {
        next.selectedIds = {};
        next.history = [0];
        next.score = 0;
      }

      next.updatedAt = Date.now();
      return next;
    });
  } catch (error) {
    console.error(error);
    showMessage("Impossible de changer de manche.");
  }
}

async function requestReset() {
  if (!roomRef || !isCurrentUserMaster()) {
    showMessage("Réservé au maître de partie.");
    return;
  }

  try {
    await roomRef.transaction((current) => {
      const next = normalizeRoomState(current);
      next.mode = 0;
      next.selectedIds = {};
      next.history = [0];
      next.score = 0;
      next.resetVersion = (Number(next.resetVersion) || 0) + 1;
      next.updatedAt = Date.now();
      return next;
    });
  } catch (error) {
    console.error(error);
    showMessage("Impossible de réinitialiser la partie.");
  }
}

function setMode(nextMode) {
  if (nextMode === 1) {
    startWorkshop();
    return;
  }

  if (nextMode === 2 || nextMode === 3) {
    requestModeChange(nextMode);
    return;
  }
}

function resetGame() {
  requestReset();
}

function startWorkshop() {
  if (!isCurrentUserMaster()) {
    showMessage("Réservé au maître de partie.");
    return;
  }

  requestModeChange(1);
}

function exportPDF() {
  const selectedActions = getSelectedActionsFromState(roomState || DEFAULT_ROOM_STATE);
  const grouped = {};

  selectedActions.forEach((action) => {
    if (!grouped[action.cat]) {
      grouped[action.cat] = [];
    }
    grouped[action.cat].push(action.title);
  });

  let html = `
    <html>
    <head>
      <style>
        body{font-family:Arial;padding:20px;}
        h1{color:#7C51A6;}
        h2{color:#224A1E;margin-top:20px;}
        .crit{margin-bottom:10px;padding:10px;border-left:4px solid #7C51A6;}
        .cat{margin-top:20px;padding:10px;background:#f4f4f4;border-radius:8px;}
      </style>
    </head>
    <body>
      <h1>Rapport - Stratégie d’adaptation</h1>

      <h2>10 critères d’une bonne stratégie</h2>

      <div class="crit">1 Une stratégie d’adaptation doit être continue et flexible.</div>
      <div class="crit">2 Plusieurs temporalités doivent être visibles dans une stratégie.</div>
      <div class="crit">3 Une collaboration avec les acteurs du territoire permet de mutualiser les efforts.</div>
      <div class="crit">4 Le calcul des risques est complet et priorise les risques entre eux.</div>
      <div class="crit">5 La chaîne de valeur de l’entreprise est analysée en entier.</div>
      <div class="crit">6 Les solutions fondées sur la nature doivent être privilégiées face aux solutions grises.</div>
      <div class="crit">7 La prise de décision doit être soutenue par des outils et des indicateurs.</div>
      <div class="crit">8 Les préjudices importants ainsi que la maladaptation doivent être évités.</div>
      <div class="crit">9 Les différentes strates de l’entreprise doivent être formées sur les sujets d’adaptation.</div>
      <div class="crit">10 Une stratégie ne doit pas se concentrer sur une unique catégorie d’actions.</div>

      <h2>Actions sélectionnées</h2>
  `;

  Object.keys(grouped).forEach((category) => {
    html += `<div class="cat"><strong>${category}</strong><br>`;
    grouped[category].forEach((title) => {
      html += `- ${title}<br>`;
    });
    html += `</div>`;
  });

  html += `</body></html>`;

  const win = window.open("", "", "width=900,height=700");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.print();
  }
}

function toggleCardFlip(card, active) {
  if (!card) {
    return;
  }
  card.classList.toggle("is-flipped", active);
}

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!target.matches("#grid input[type='checkbox']")) {
    return;
  }

  requestSelectionToggle(target.dataset.id);
});

document.addEventListener("click", (event) => {
  const flipButton = event.target.closest(".action-card__flip-btn");
  const backButton = event.target.closest(".action-card__back-btn");

  if (flipButton || backButton) {
    const card = event.target.closest(".action-card");
    toggleCardFlip(card, Boolean(flipButton));
    return;
  }

  const selectButton = event.target.closest(".select-btn");
  if (!selectButton) {
    return;
  }

  const card = event.target.closest(".action-card");
  const checkbox = card?.querySelector(".action-checkbox");
  if (!checkbox) {
    return;
  }

  requestSelectionToggle(checkbox.dataset.id);
});

function applyInitialVisibility() {
  document.getElementById("dashboard")?.classList.add("hidden");
  document.getElementById("grid")?.classList.add("hidden");
  document.getElementById("mainHeader")?.classList.add("hidden");
  document.querySelector(".sidebar")?.classList.add("hidden");
}

function initRoleGate() {
  showRoleGate();

  const form = document.getElementById("roleGateForm");
  const input = document.getElementById("roleCodeInput");
  const submit = document.getElementById("roleCodeSubmit");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleRoleCodeSubmit();
  });

  submit?.addEventListener("click", (event) => {
    event.preventDefault();
    handleRoleCodeSubmit();
  });

  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleRoleCodeSubmit();
    }
  });

  input?.focus();
}

applyInitialVisibility();
hideAppShell();
document.body.classList.add("role-gate-open");
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initRoleGate);
} else {
  initRoleGate();
}

window.setMode = setMode;
window.startWorkshop = startWorkshop;
window.resetGame = resetGame;
window.exportPDF = exportPDF;
