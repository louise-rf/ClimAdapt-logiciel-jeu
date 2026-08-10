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
let selectedRoomNumber = null;
let actionsCsvSnapshot = "";
let actionsCsvPollHandle = null;
let lastModeRulesShown = 0;
let roomDeletionHandled = false;
let roomDeletionPending = false;
let masterRiskSetupDirty = false;
let availableActionCatalogs = [];
let activeActionsCsvPath = "";
let actionsLoadToken = 0;
let playerSessionProfile = null;

const DEFAULT_ACTIONS_CSV_PATH =
  document.body?.dataset.actionsCsv || "actions_selection.csv";
const ACTION_CATALOGS_MANIFEST_PATH = "action-catalogs.json";
const DEFAULT_ACTION_CATALOGS = Object.freeze([
  {
    id: "default",
    label: "Catalogue principal",
    path: DEFAULT_ACTIONS_CSV_PATH,
  },
]);
const ROOM_DELETION_NOTICE_STORAGE_KEY = "climadapt-room-deletion-notice";
const PLAYER_SESSION_PROFILE_STORAGE_KEY = "climadapt-player-profile";

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

const ACCESS_CODES = {
  "0000": "player",
  "1702": "master",
};
const MIN_ROOM_NUMBER = 1;
const MAX_ROOM_NUMBER = 99;
const CLIMATE_RISK_OPTIONS = Object.freeze([
  "Chaleur extrême",
  "Feux de forêt",
  "Fortes pluies",
  "Inondation",
  "Modif T air",
  "Mouvements de terrain",
  "RGA",
  "Stress Hydrique",
  "Submersion marine",
  "Tempêtes",
  "Vague de chaleur",
  "Vague de gel",
]);
const DEFAULT_TOP_RISKS = Object.freeze([
  "Inondation",
  "Vague de chaleur",
  "RGA",
]);
const RISK_IMPACT_COPY = Object.freeze({
  Inondation: "Impacts : degats materiels et humains, evacuations possibles",
  "Vague de chaleur": "Impacts : sante des personnes fragiles, biodiversite",
  RGA: "Impacts : batis",
});
const MODE_RULES_COPY = {
  1: {
    eyebrow: "Manche 1",
    title: "Découverte des actions",
    intro: "Cette manche sert à explorer le catalogue et à construire une première sélection.",
    rules: [
      "Sélectionnez jusqu'à 3 actions d'adaptation par catégorie de ressources.",
      "Parcourez la catégorie qui vous a été atttribuée et utilisez les cartes pour lire les exemples.",
      "Le score détaillé n'est pas encore révélé pendant cette phase.",
    ],
  },
  2: {
    eyebrow: "Manche 2",
    title: "Élaborer une stratégie",
    intro: "Cette manche demande de composer une stratégie d'adaptation plus robuste.",
    rules: [
      "Construisez une sélection en respectant le budget de crédits affiché.",
      "Le score devient visible pour aider à comparer vos choix.",
      "L'objectif est de vous rapprocher au maximum d'une stratégie 10/10.",
    ],
  },
  3: {
    eyebrow: "Manche 3",
    title: "Amélioration continue",
    intro: "Cette dernière manche sert à analyser et affiner la stratégie finale.",
    rules: [
      "Ajustez la sélection finale en respectant le budget affiché.",
      "Consultez l'analyse finale pour repérer les axes à renforcer.",
      "Les résultats peuvent être exporter en PDF à la fin de la manche.",
    ],
  },
};

function getFirebaseAppName(role) {
  return role === "master"
    ? "climadapt-master-session"
    : "climadapt-player-session";
}

function buildRoomPath(roomNumber) {
  return `rooms/${roomNumber}`;
}

function parseRoomNumber(value) {
  const normalizedValue = String(value || "").trim();

  if (!/^\d{1,2}$/.test(normalizedValue)) {
    return null;
  }

  const roomNumber = Number(normalizedValue);
  if (
    !Number.isInteger(roomNumber) ||
    roomNumber < MIN_ROOM_NUMBER ||
    roomNumber > MAX_ROOM_NUMBER
  ) {
    return null;
  }

  return roomNumber;
}

function getTodayDateString() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, "0");
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const year = String(today.getFullYear());
  return `${day}/${month}/${year}`;
}

function normalizePlayerIdentityPart(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function readPlayerProfileInputs() {
  return {
    firstName: normalizePlayerIdentityPart(
      document.getElementById("playerFirstNameInput")?.value
    ),
    lastName: normalizePlayerIdentityPart(
      document.getElementById("playerLastNameInput")?.value
    ),
  };
}

function setPlayerProfileInputs(profile) {
  const firstNameInput = document.getElementById("playerFirstNameInput");
  const lastNameInput = document.getElementById("playerLastNameInput");

  if (firstNameInput) {
    firstNameInput.value = profile?.firstName || "";
  }

  if (lastNameInput) {
    lastNameInput.value = profile?.lastName || "";
  }
}

function savePlayerSessionProfile(profile) {
  playerSessionProfile = profile;

  try {
    if (!profile) {
      window.sessionStorage.removeItem(PLAYER_SESSION_PROFILE_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      PLAYER_SESSION_PROFILE_STORAGE_KEY,
      JSON.stringify(profile)
    );
  } catch (error) {
    console.warn("Impossible d'enregistrer le profil joueur.", error);
  }
}

function loadPlayerSessionProfile() {
  try {
    const rawValue = window.sessionStorage.getItem(
      PLAYER_SESSION_PROFILE_STORAGE_KEY
    );

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);
    const firstName = normalizePlayerIdentityPart(parsed?.firstName);
    const lastName = normalizePlayerIdentityPart(parsed?.lastName);
    const date = String(parsed?.date || "").trim();

    if (!firstName || !lastName || !date) {
      return null;
    }

    return {
      firstName,
      lastName,
      date,
      roomNumber: parseRoomNumber(parsed?.roomNumber) || null,
    };
  } catch (error) {
    console.warn("Impossible de relire le profil joueur.", error);
    return null;
  }
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
  actionsCatalogPath: DEFAULT_ACTIONS_CSV_PATH,
  selectedIds: {},
  topRisks: [],
  history: [0],
  score: 0,
  updatedAt: 0,
};

const grid = document.getElementById("grid");
const categoryFilterSelect = document.getElementById("categoryFilter");
const ACTIONS_CSV_POLL_INTERVAL_MS = 15000;
const PERFECT_SELECTION_SIZE = 15;
const ROUND_ONE_SELECTION_SIZE = 15;
const CREDIT_HALF_UNIT = 0.5;
const PERFECT_TAG_BITS = {
  1: 1 << 0,
  2: 1 << 1,
  3: 1 << 2,
  4: 1 << 3,
  6: 1 << 4,
  7: 1 << 5,
  8: 1 << 6,
  10: 1 << 7,
};
const PERFECT_REQUIRED_TAG_MASK = Object.values(PERFECT_TAG_BITS).reduce(
  (acc, bit) => acc | bit,
  0
);
const PERFECT_ALL_CATEGORY_MASK = (1 << RESOURCE_CATEGORY_ORDER.length) - 1;
let perfectScoreAnalysis = null;
let perfectScoreAnalysisToken = 0;
let creditBudgetHalfUnits = 0;
let chartCardPinned = false;
let victoryModalVisible = false;
let victoryReachedDuringCurrentStreak = false;
const CHART_PIN_STORAGE_KEY = "climadapt-chart-pinned";

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

function parseNormalizedCredit(value) {
  const normalized = String(value || "")
    .replace(",", ".")
    .trim();
  const amount = Number(normalized);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.max(0, Math.min(3, amount));
}

function formatCreditAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "0";
  }
  if (Number.isInteger(amount)) {
    return String(amount);
  }
  return amount.toFixed(1).replace(".", ",");
}

function formatNormalizedCredit(value) {
  return formatCreditAmount(parseNormalizedCredit(value));
}

function creditToHalfUnits(value) {
  return Math.max(0, Math.round(parseNormalizedCredit(value) / CREDIT_HALF_UNIT));
}

function halfUnitsToCredit(value) {
  return Number(value || 0) * CREDIT_HALF_UNIT;
}

function formatCreditAmountFromHalfUnits(value) {
  return formatCreditAmount(halfUnitsToCredit(value));
}

function isRoundOneMode(state) {
  return Number(state?.mode) === 1;
}

function shouldRevealScore(state, selectedCount) {
  const currentMode = Number(state?.mode) || 0;

  if (currentMode === 2 || currentMode === 3) {
    return true;
  }

  if (currentMode === 1) {
    return selectedCount >= ROUND_ONE_SELECTION_SIZE;
  }

  return false;
}

function buildCreditMeterMarkup(action) {
  const creditValue = parseNormalizedCredit(action.creditNormalized);
  const circles = [0, 1, 2]
    .map((index) => {
      const fill = Math.max(0, Math.min(1, creditValue - index));
      return `
        <span
          class="action-card__credit-circle"
          style="--credit-fill:${fill};"
          aria-hidden="true"
        >
          <span class="action-card__credit-symbol">&euro;</span>
        </span>
      `;
    })
    .join("");

  return `
    <div class="action-card__credit-meter" aria-label="Crédit ${formatNormalizedCredit(creditValue)} sur 3">
      <span class="action-card__credit-value">${formatNormalizedCredit(creditValue)}</span>
      <span class="action-card__credit-stack">
        ${circles}
      </span>
    </div>
  `;
}

function showMessage(message) {
  const msg = document.getElementById("msg");
  if (msg) {
    msg.textContent = message || "";
  }
}

function sanitizeTopRisks(value) {
  const rawValues = Array.isArray(value)
    ? value
    : value && typeof value === "object"
    ? Object.keys(value)
        .sort((left, right) => Number(left) - Number(right))
        .map((key) => value[key])
    : [];
  const seen = new Set();

  return rawValues
    .map((risk) => String(risk || "").trim())
    .filter((risk) => CLIMATE_RISK_OPTIONS.includes(risk))
    .filter((risk) => {
      if (seen.has(risk)) {
        return false;
      }

      seen.add(risk);
      return true;
    })
    .slice(0, 3);
}

function hasConfiguredTopRisks(state) {
  return sanitizeTopRisks(state?.topRisks).length === 3;
}

function getDisplayedTopRisks(state) {
  const selectedTopRisks = sanitizeTopRisks(state?.topRisks);
  return selectedTopRisks.length === 3
    ? selectedTopRisks
    : [...DEFAULT_TOP_RISKS];
}

function normalizeCatalogPathKey(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .split("#")[0]
    .split("?")[0];
}

function formatActionCatalogLabel(path) {
  const filename = String(path || "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop();
  return (filename || "Catalogue").replace(/\.csv$/i, "");
}

function getAvailableActionCatalogs() {
  return availableActionCatalogs.length
    ? availableActionCatalogs
    : [...DEFAULT_ACTION_CATALOGS];
}

function setAvailableActionCatalogs(entries) {
  const uniqueCatalogs = new Map();

  [...DEFAULT_ACTION_CATALOGS, ...(Array.isArray(entries) ? entries : [])].forEach(
    (entry, index) => {
      const path = String(entry?.path || "").trim();
      if (!path || !/\.csv(?:[?#].*)?$/i.test(path)) {
        return;
      }

      const key = normalizeCatalogPathKey(path);
      if (!key || uniqueCatalogs.has(key)) {
        return;
      }

      const label = String(entry?.label || "").trim() || formatActionCatalogLabel(path);
      const id = String(entry?.id || `catalog-${index + 1}`).trim() || `catalog-${index + 1}`;

      uniqueCatalogs.set(key, { id, label, path });
    }
  );

  availableActionCatalogs = Array.from(uniqueCatalogs.values());
  activeActionsCsvPath = sanitizeActionsCatalogPath(activeActionsCsvPath);
}

function findActionCatalogByPath(path) {
  const normalizedPath = normalizeCatalogPathKey(path);
  if (!normalizedPath) {
    return null;
  }

  return (
    getAvailableActionCatalogs().find(
      (entry) => normalizeCatalogPathKey(entry.path) === normalizedPath
    ) || null
  );
}

function sanitizeActionsCatalogPath(path) {
  return (
    findActionCatalogByPath(path)?.path ||
    DEFAULT_ACTION_CATALOGS[0]?.path ||
    DEFAULT_ACTIONS_CSV_PATH
  );
}

function getRoomActionsCatalogPath(state) {
  return sanitizeActionsCatalogPath(state?.actionsCatalogPath);
}

async function loadActionCatalogOptions() {
  try {
    const url = new URL(ACTION_CATALOGS_MANIFEST_PATH, window.location.href);
    url.searchParams.set("_ts", String(Date.now()));
    const response = await fetch(url, { cache: "no-store" });
    const entries = await response.json();
    setAvailableActionCatalogs(entries);
  } catch (error) {
    console.warn("Impossible de charger la liste des catalogues d'actions.", error);
    setAvailableActionCatalogs([]);
  }

  renderMasterActionCatalogOptions(getRoomActionsCatalogPath(roomState || DEFAULT_ROOM_STATE));
}

function setMasterRiskSetupError(text) {
  const masterRiskSetupError = document.getElementById("masterRiskSetupError");
  if (masterRiskSetupError) {
    masterRiskSetupError.textContent = text || "";
  }
}

function getMasterRiskSelectElements() {
  return [1, 2, 3].map((index) =>
    document.getElementById(`masterRiskSelect${index}`)
  );
}

function getMasterRiskSelectValues() {
  return getMasterRiskSelectElements().map((select) =>
    String(select?.value || "").trim()
  );
}

function getMasterActionCatalogSelectElement() {
  return document.getElementById("masterActionCatalogSelect");
}

function getMasterActionCatalogValue() {
  return sanitizeActionsCatalogPath(
    String(getMasterActionCatalogSelectElement()?.value || "").trim()
  );
}

function renderMasterRiskSelectOptions(selectedValues = []) {
  const selects = getMasterRiskSelectElements();
  if (selects.some((select) => !select)) {
    return;
  }

  selects.forEach((select, index) => {
    const currentValue = selectedValues[index] || "";
    const blockedValues = new Set(
      selectedValues.filter((value, valueIndex) => value && valueIndex !== index)
    );
    const fragment = document.createDocumentFragment();
    const placeholder = document.createElement("option");

    placeholder.value = "";
    placeholder.textContent = "...";
    fragment.appendChild(placeholder);

    CLIMATE_RISK_OPTIONS.forEach((risk) => {
      const option = document.createElement("option");

      option.value = risk;
      option.textContent = risk;
      option.disabled = blockedValues.has(risk);
      option.selected = risk === currentValue;
      fragment.appendChild(option);
    });

    select.innerHTML = "";
    select.appendChild(fragment);
    select.value = currentValue;
  });
}

function renderMasterActionCatalogOptions(selectedPath = DEFAULT_ACTIONS_CSV_PATH) {
  const select = getMasterActionCatalogSelectElement();
  if (!select) {
    return;
  }

  const currentPath = sanitizeActionsCatalogPath(selectedPath);
  const fragment = document.createDocumentFragment();

  getAvailableActionCatalogs().forEach((catalog) => {
    const option = document.createElement("option");

    option.value = catalog.path;
    option.textContent = catalog.label;
    option.selected =
      normalizeCatalogPathKey(catalog.path) === normalizeCatalogPathKey(currentPath);
    fragment.appendChild(option);
  });

  select.innerHTML = "";
  select.appendChild(fragment);
  select.value = currentPath;
}

function setRoleBadge(text) {
  const roleBadge = document.getElementById("roleBadge");
  if (roleBadge) {
    roleBadge.textContent = text;
  }
}

function setRoomBadge(roomNumber) {
  const roomBadge = document.getElementById("roomBadge");
  if (roomBadge) {
    roomBadge.textContent = roomNumber ? `Room ${roomNumber}` : "Room -";
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

function setRoomGateError(text) {
  const roomGateError = document.getElementById("roomGateError");
  if (roomGateError) {
    roomGateError.textContent = text || "";
  }
}

function consumeRoomDeletionNotice() {
  try {
    const notice = window.sessionStorage.getItem(ROOM_DELETION_NOTICE_STORAGE_KEY);
    if (notice) {
      window.sessionStorage.removeItem(ROOM_DELETION_NOTICE_STORAGE_KEY);
    }
    return notice || "";
  } catch (error) {
    console.warn("Impossible de lire le message de suppression de room.", error);
    return "";
  }
}

function resetToInitialRoomGate(message) {
  if (roomRef) {
    roomRef.off();
  }

  roomState = null;
  roomReady = false;
  roomInitialized = false;
  roomSubscribed = false;
  roomRef = null;
  sessionRole = null;
  selectedRoomNumber = null;
  currentUser = null;
  isMaster = false;
  appBootstrapped = false;
  masterClaimAttempted = false;
  roomDeletionPending = false;
  masterRiskSetupDirty = false;
  mode = 0;
  history = [0];
  lastModeRulesShown = 0;
  victoryReachedDuringCurrentStreak = false;

  closeVictoryModal();
  closeModeRulesModal();
  applyInitialVisibility();
  hideAppShell();
  showRoleGate();
  showRoomGateStep();
  document.body.classList.add("role-gate-open");
  document.body.classList.remove("app-open");

  setRoomBadge(null);
  setRoleBadge("Joueur");
  setRoomGateError(message || "");
  setRoleGateError("");
  setMasterRiskSetupError("");
  showMessage("");

  const roomInput = document.getElementById("roomNumberInput");
  const roleInput = document.getElementById("roleCodeInput");
  const roleSubmit = document.getElementById("roleCodeSubmit");
  const consentCheckbox = document.getElementById("roomConsentCheckbox");
  const selectedRoomLabel = document.getElementById("selectedRoomLabel");
  const firstNameInput = document.getElementById("playerFirstNameInput");
  const lastNameInput = document.getElementById("playerLastNameInput");

  if (roomInput) {
    roomInput.value = "";
  }

  if (roleInput) {
    roleInput.value = "";
    roleInput.disabled = false;
  }

  if (roleSubmit) {
    roleSubmit.disabled = false;
  }

  if (consentCheckbox) {
    consentCheckbox.checked = false;
  }

  if (selectedRoomLabel) {
    selectedRoomLabel.textContent = "Room -";
  }

  if (firstNameInput) {
    firstNameInput.value = "";
    firstNameInput.disabled = false;
  }

  if (lastNameInput) {
    lastNameInput.value = "";
    lastNameInput.disabled = false;
  }

  savePlayerSessionProfile(null);

  getMasterRiskSelectElements().forEach((select) => {
    if (select) {
      select.value = "";
    }
  });
  renderMasterRiskSelectOptions();
  renderMasterActionCatalogOptions(DEFAULT_ACTIONS_CSV_PATH);

  roomInput?.focus();
}

function redirectToInitialRoomScreen(message) {
  if (roomDeletionHandled) {
    return;
  }

  roomDeletionHandled = true;
  resetToInitialRoomGate(message);
}

function closeModeRulesModal() {
  const modal = document.getElementById("modeRulesModal");
  if (!modal) {
    return;
  }

  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function openVictoryModal() {
  const modal = document.getElementById("victoryModal");
  if (!modal) {
    return;
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  victoryModalVisible = true;
}

function getActivePlayerProfile() {
  return playerSessionProfile || loadPlayerSessionProfile();
}

function buildDiplomaFileName(profile) {
  const firstName = normalizePlayerIdentityPart(profile?.firstName).replace(/[^\p{L}\p{N}]+/gu, "-");
  const lastName = normalizePlayerIdentityPart(profile?.lastName).replace(/[^\p{L}\p{N}]+/gu, "-");
  const safeFirstName = firstName || "joueur";
  const safeLastName = lastName || "";
  return `Diplome-ClimAdapt-${safeFirstName}${safeLastName ? `-${safeLastName}` : ""}.pdf`;
}

async function downloadDiplomaPdf() {
  const profile = getActivePlayerProfile();

  if (!profile?.firstName || !profile?.lastName) {
    showMessage("Nom et prénom du joueur introuvables pour personnaliser le diplôme.");
    return;
  }

  if (!window.PDFLib) {
    showMessage("La bibliothèque PDF n'est pas disponible.");
    return;
  }

  try {
    showMessage("Préparation du diplôme...");

    const sourceUrl = new URL("images/Diplôme ClimAdapt.pdf", window.location.href);
    const response = await fetch(sourceUrl.href, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Impossible de charger le diplôme (${response.status}).`);
    }

    const pdfBytes = await response.arrayBuffer();
    const pdfDoc = await window.PDFLib.PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPage(0);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(window.PDFLib.StandardFonts.Helvetica);
    const playerFullName = `${profile.firstName} ${profile.lastName}`;
    const dateText = profile.date || getTodayDateString();
    const [dateDay = "", dateMonth = "", dateYear = ""] = dateText.split("/");
    const dateDigits = `${dateDay}${dateMonth}${dateYear}`.split("");
    const nameFontSize = Math.max(36, Math.min(51, width * 0.057));
    const dateFontSize = 26;
    const nameTextWidth = font.widthOfTextAtSize(playerFullName, nameFontSize);
    const nameTextY = height * 0.483;
    const dateTextY = 45.42;
    const dateDigitStartX = 1086.05;
    const dateDigitAdvanceX = 15.08;

    page.drawText(playerFullName, {
      x: (width - nameTextWidth) / 2,
      y: nameTextY,
      size: nameFontSize,
      font,
      color: window.PDFLib.rgb(0, 0, 0),
    });

    dateDigits.forEach((digit, index) => {
      const slashOffset = index >= 2 ? 11.91 : 0;
      const secondSlashOffset = index >= 4 ? 11.9 : 0;
      page.drawText(digit, {
        x: dateDigitStartX + dateDigitAdvanceX * index + slashOffset + secondSlashOffset,
        y: dateTextY,
        size: dateFontSize,
        font,
        color: window.PDFLib.rgb(0, 0, 0),
      });
    });

    const personalizedPdfBytes = await pdfDoc.save();
    const blob = new Blob([personalizedPdfBytes], { type: "application/pdf" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = buildDiplomaFileName(profile);
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    showMessage("");
  } catch (error) {
    console.error(error);
    showMessage("Impossible de générer le diplôme personnalisé.");
  }
}

function closeVictoryModal() {
  const modal = document.getElementById("victoryModal");
  if (!modal) {
    return;
  }

  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  victoryModalVisible = false;

  if (document.getElementById("modeRulesModal")?.classList.contains("hidden")) {
    document.body.classList.remove("modal-open");
  }
}

function updateVictoryModalState(state) {
  const isWinningState =
    Number(state?.mode) === 3 && Number(state?.score) === 10;

  if (isWinningState && !victoryReachedDuringCurrentStreak) {
    victoryReachedDuringCurrentStreak = true;
    openVictoryModal();
    return;
  }

  if (!isWinningState) {
    victoryReachedDuringCurrentStreak = false;
    if (victoryModalVisible) {
      closeVictoryModal();
    }
  }
}

function openModeRulesModal(nextMode) {
  const copy = MODE_RULES_COPY[nextMode];
  const modal = document.getElementById("modeRulesModal");
  const eyebrow = document.getElementById("modeRulesEyebrow");
  const title = document.getElementById("modeRulesTitle");
  const intro = document.getElementById("modeRulesIntro");
  const list = document.getElementById("modeRulesList");

  if (!copy || !modal || !eyebrow || !title || !intro || !list) {
    return;
  }

  eyebrow.textContent = copy.eyebrow;
  title.textContent = copy.title;
  intro.textContent = copy.intro;
  list.innerHTML = copy.rules.map((rule) => `<li>${rule}</li>`).join("");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function maybeShowModeRules(nextMode) {
  if (!MODE_RULES_COPY[nextMode]) {
    closeModeRulesModal();
    return;
  }

  if (lastModeRulesShown === nextMode) {
    return;
  }

  lastModeRulesShown = nextMode;
  openModeRulesModal(nextMode);
}

function isRoomConsentAccepted() {
  return Boolean(document.getElementById("roomConsentCheckbox")?.checked);
}

function showRoomGateStep() {
  document.getElementById("roomGateStep")?.classList.remove("hidden");
  document.getElementById("roleGateStep")?.classList.add("hidden");
}

function showRoleGateStep() {
  document.getElementById("roomGateStep")?.classList.add("hidden");
  document.getElementById("roleGateStep")?.classList.remove("hidden");
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
  roomDeletionHandled = false;
  roomDeletionPending = false;

  if (appBootstrapped) {
    return;
  }

  if (!selectedRoomNumber) {
    setRoleGateError("Choisissez une room valide.");
    showRoomGateStep();
    return;
  }

  sessionRole = role;
  setRoomBadge(selectedRoomNumber);
  setRoleBadge(role === "master" ? "Maître de partie" : "Joueur");
  setRoleGateError("Chargement en cours...");
  const submit = document.getElementById("roleCodeSubmit");
  const input = document.getElementById("roleCodeInput");
  const firstNameInput = document.getElementById("playerFirstNameInput");
  const lastNameInput = document.getElementById("playerLastNameInput");

  if (submit) {
    submit.disabled = true;
  }

  if (input) {
    input.disabled = true;
  }

  if (firstNameInput) {
    firstNameInput.disabled = true;
  }

  if (lastNameInput) {
    lastNameInput.disabled = true;
  }

  try {
    await loadActionCatalogOptions();
    initFirebase();
    await loadActionsFromCSV(getRoomActionsCatalogPath(DEFAULT_ROOM_STATE));
    startActionsCsvPolling();
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

    if (firstNameInput) {
      firstNameInput.disabled = false;
    }

    if (lastNameInput) {
      lastNameInput.disabled = false;
    }
  }
}

function handleRoomNumberSubmit() {
  if (!isRoomConsentAccepted()) {
    setRoomGateError("Vous devez accepter cette condition pour continuer.");
    document.getElementById("roomConsentCheckbox")?.focus();
    return;
  }

  const input = document.getElementById("roomNumberInput");
  const roomNumber = parseRoomNumber(input?.value);

  if (!roomNumber) {
    setRoomGateError("Saisissez un numéro de room entre 1 et 99.");
    return;
  }

  selectedRoomNumber = roomNumber;
  setRoomBadge(roomNumber);
  setRoomGateError("");
  setRoleGateError("");
  showRoleGateStep();

  const label = document.getElementById("selectedRoomLabel");
  if (label) {
    label.textContent = `Room ${roomNumber}`;
  }

  document.getElementById("roleCodeInput")?.focus();
}

function handleRoleCodeSubmit() {
  if (!isRoomConsentAccepted()) {
    setRoleGateError("Vous devez accepter cette condition pour rejoindre la room.");
    showRoomGateStep();
    document.getElementById("roomConsentCheckbox")?.focus();
    return;
  }

  const input = document.getElementById("roleCodeInput");
  const rawCode = (input?.value || "").trim();
  const normalizedCode = rawCode.replace(/\s+/g, "");
  const role = ACCESS_CODES[normalizedCode];

  if (!role) {
    setRoleGateError("Code invalide.");
    return;
  }

  const { firstName, lastName } = readPlayerProfileInputs();

  if (!firstName || !lastName) {
    setRoleGateError("Saisissez le prenom et le nom du joueur.");
    if (!firstName) {
      document.getElementById("playerFirstNameInput")?.focus();
    } else {
      document.getElementById("playerLastNameInput")?.focus();
    }
    return;
  }

  savePlayerSessionProfile({
    firstName,
    lastName,
    date: getTodayDateString(),
    roomNumber: selectedRoomNumber,
  });

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

  next.actionsCatalogPath = getRoomActionsCatalogPath(next);
  next.topRisks = sanitizeTopRisks(next.topRisks);
  next.mode = Number(next.mode) || 0;
  next.resetVersion = Number(next.resetVersion) || 0;
  next.score = Number(next.score) || 0;
  return next;
}

function getSelectedActionsFromState(state) {
  const selectedIds = state?.selectedIds || {};
  return actions.filter((action) => selectedIds[String(action.id)]);
}

function getSelectionCreditHalfUnits(selectedActions) {
  return selectedActions.reduce(
    (total, action) => total + creditToHalfUnits(action.creditNormalized),
    0
  );
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

function buildDisplayedActionNumberMap() {
  const numberMap = new Map();
  let displayNumber = 1;

  getOrderedCategories().forEach((category) => {
    actions
      .filter((action) => action.cat === category && isActionVisibleForRole(action))
      .forEach((action) => {
        numberMap.set(String(action.id), displayNumber);
        displayNumber++;
      });
  });

  return numberMap;
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

function formatBigInt(value) {
  return value
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatPercentage(count, total) {
  if (!total) {
    return "0 %";
  }

  const ratio = (Number(count) / Number(total)) * 100;
  if (!Number.isFinite(ratio) || ratio === 0) {
    return "< 0,01 %";
  }
  if (ratio >= 10) {
    return `${ratio.toFixed(1).replace(".", ",")} %`;
  }
  if (ratio >= 1) {
    return `${ratio.toFixed(2).replace(".", ",")} %`;
  }
  return `${ratio.toFixed(3).replace(".", ",")} %`;
}

function getAxesForAction(action) {
  const tag = Number(action.tag);
  const axisMap = {
    1: [2],
    2: [2],
    3: [3],
    4: [1],
    5: [1],
    6: [3],
    7: [4],
    8: [3],
    9: [4],
    10: [4],
  };

  return axisMap[tag] || [];
}

function getCategoryBit(category) {
  const index = RESOURCE_CATEGORY_ORDER.indexOf(category);
  return index === -1 ? 0 : 1 << index;
}

function getOptimizationSignature(action) {
  const tag = Number(action.tag);
  const category = action.cat || "";
  return {
    tagMask: PERFECT_TAG_BITS[tag] || 0,
    tagFiveCount: tag === 5 ? 1 : 0,
    blocksPerfectScore: tag === 9,
    categoryBit: getCategoryBit(category),
    natureCount: category.includes("Nature") ? 1 : 0,
    techCount: category.includes("Techniques") ? 1 : 0,
    creditHalfUnits: creditToHalfUnits(action.creditNormalized),
  };
}

function buildOptimizationGroups(sourceActions = actions) {
  const groupsBySignature = new Map();

  sourceActions.forEach((action) => {
    const signature = getOptimizationSignature(action);
    const key = [
      signature.tagMask,
      signature.tagFiveCount,
      signature.blocksPerfectScore ? 1 : 0,
      signature.categoryBit,
      signature.natureCount,
      signature.techCount,
      signature.creditHalfUnits,
    ].join("|");

    if (!groupsBySignature.has(key)) {
      groupsBySignature.set(key, {
        ...signature,
        actions: [],
      });
    }

    groupsBySignature.get(key).actions.push(action);
  });

  return [...groupsBySignature.values()]
    .map((group) => ({
      ...group,
      count: group.actions.length,
      actions: [...group.actions].sort((left, right) => left.id - right.id),
    }))
    .sort((left, right) => {
      const leftWeight =
        Number(left.blocksPerfectScore) * 100 +
        Number(left.tagMask !== 0) * 10 +
        left.categoryBit +
        left.tagFiveCount;
      const rightWeight =
        Number(right.blocksPerfectScore) * 100 +
        Number(right.tagMask !== 0) * 10 +
        right.categoryBit +
        right.tagFiveCount;
      return leftWeight - rightWeight;
    });
}

function getSelectionOptimizationState(selectedActions) {
  return selectedActions.reduce(
    (acc, action) => {
      const signature = getOptimizationSignature(action);
      acc.mask |= signature.tagMask;
      acc.tagFiveCount = Math.min(2, acc.tagFiveCount + signature.tagFiveCount);
      acc.categoryMask |= signature.categoryBit;
      acc.natureCount += signature.natureCount;
      acc.techCount += signature.techCount;
      acc.creditHalfUnits += signature.creditHalfUnits;
      acc.blocksPerfectScore =
        acc.blocksPerfectScore || signature.blocksPerfectScore;
      return acc;
    },
    {
      mask: 0,
      tagFiveCount: 0,
      categoryMask: 0,
      natureCount: 0,
      techCount: 0,
      creditHalfUnits: 0,
      blocksPerfectScore: false,
    }
  );
}

function analyzeSelectionCompletion(state) {
  if (!state || creditBudgetHalfUnits <= 0) {
    return {
      status: "pending",
      selection: [],
    };
  }

  const selectedActions = getSelectedActionsFromState(state);
  const selectedIds = state.selectedIds || {};
  const selectionState = getSelectionOptimizationState(selectedActions);
  const remainingBudgetHalfUnits =
    creditBudgetHalfUnits - selectionState.creditHalfUnits;

  if (remainingBudgetHalfUnits < 0 || selectionState.blocksPerfectScore) {
    return {
      status: "impossible",
      selection: [],
    };
  }

  if (
    isPerfectSelectionState(
      selectionState.mask,
      selectionState.tagFiveCount,
      selectionState.categoryMask,
      selectionState.natureCount,
      selectionState.techCount
    )
  ) {
    return {
      status: "already-perfect",
      selection: [],
    };
  }

  const remainingActions = actions.filter(
    (action) => !selectedIds[String(action.id)]
  );
  const groups = buildOptimizationGroups(remainingActions);
  const suffixMasks = new Array(groups.length + 1).fill(0);
  const suffixCategoryMasks = new Array(groups.length + 1).fill(0);
  const suffixTagFiveCounts = new Array(groups.length + 1).fill(0);
  const suffixNatureCounts = new Array(groups.length + 1).fill(0);

  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index];
    suffixMasks[index] = suffixMasks[index + 1] | group.tagMask;
    suffixCategoryMasks[index] =
      suffixCategoryMasks[index + 1] | group.categoryBit;
    suffixTagFiveCounts[index] =
      suffixTagFiveCounts[index + 1] + group.count * group.tagFiveCount;
    suffixNatureCounts[index] =
      suffixNatureCounts[index + 1] + group.count * group.natureCount;
  }

  function canStillReachPerfect(
    groupIndex,
    mask,
    tagFiveCount,
    categoryMask,
    natureCount,
    techCount
  ) {
    if (
      ((mask | suffixMasks[groupIndex]) & PERFECT_REQUIRED_TAG_MASK) !==
      PERFECT_REQUIRED_TAG_MASK
    ) {
      return false;
    }

    if (
      ((categoryMask | suffixCategoryMasks[groupIndex]) &
        PERFECT_ALL_CATEGORY_MASK) !==
      PERFECT_ALL_CATEGORY_MASK
    ) {
      return false;
    }

    if (tagFiveCount + suffixTagFiveCounts[groupIndex] < 2) {
      return false;
    }

    if (natureCount + suffixNatureCounts[groupIndex] < techCount) {
      return false;
    }

    return true;
  }

  const memo = new Map();

  function findBestCompletion(
    groupIndex,
    mask,
    tagFiveCount,
    categoryMask,
    natureCount,
    techCount,
    budgetHalfUnitsLeft
  ) {
    if (budgetHalfUnitsLeft < 0) {
      return null;
    }

    if (
      isPerfectSelectionState(
        mask,
        tagFiveCount,
        categoryMask,
        natureCount,
        techCount
      )
    ) {
      return {
        selection: [],
        cardCount: 0,
        creditHalfUnits: 0,
      };
    }

    if (groupIndex >= groups.length) {
      return null;
    }

    if (
      !canStillReachPerfect(
        groupIndex,
        mask,
        tagFiveCount,
        categoryMask,
        natureCount,
        techCount
      )
    ) {
      return null;
    }

    const key = [
      groupIndex,
      mask,
      tagFiveCount,
      categoryMask,
      natureCount,
      techCount,
      budgetHalfUnitsLeft,
    ].join("|");

    if (memo.has(key)) {
      return memo.get(key);
    }

    const group = groups[groupIndex];
    const maxTake = group.creditHalfUnits > 0
      ? Math.min(group.count, Math.floor(budgetHalfUnitsLeft / group.creditHalfUnits))
      : group.count;
    let best = null;

    for (let take = 0; take <= maxTake; take++) {
      if (group.blocksPerfectScore && take > 0) {
        continue;
      }

      const cost = take * group.creditHalfUnits;
      const nextMask = take > 0 ? mask | group.tagMask : mask;
      const nextTagFiveCount = Math.min(2, tagFiveCount + take * group.tagFiveCount);
      const nextCategoryMask = take > 0 ? categoryMask | group.categoryBit : categoryMask;
      const nextNatureCount = natureCount + take * group.natureCount;
      const nextTechCount = techCount + take * group.techCount;
      const tail = findBestCompletion(
        groupIndex + 1,
        nextMask,
        nextTagFiveCount,
        nextCategoryMask,
        nextNatureCount,
        nextTechCount,
        budgetHalfUnitsLeft - cost
      );

      if (!tail) {
        continue;
      }

      const candidate = {
        selection: [
          ...group.actions.slice(0, take),
          ...tail.selection,
        ],
        cardCount: take + tail.cardCount,
        creditHalfUnits: cost + tail.creditHalfUnits,
      };

      if (
        !best ||
        candidate.cardCount < best.cardCount ||
        (candidate.cardCount === best.cardCount &&
          candidate.creditHalfUnits < best.creditHalfUnits)
      ) {
        best = candidate;
      }
    }

    memo.set(key, best);
    return best;
  }

  const result = findBestCompletion(
    0,
    selectionState.mask,
    selectionState.tagFiveCount,
    selectionState.categoryMask,
    selectionState.natureCount,
    selectionState.techCount,
    remainingBudgetHalfUnits
  );

  return result
    ? {
        status: "ok",
        selection: result.selection,
      }
    : {
        status: "impossible",
        selection: [],
      };
}

function buildCombinationCounter() {
  const cache = new Map();

  return function combination(n, k) {
    if (k < 0 || k > n) {
      return 0n;
    }

    const normalizedK = Math.min(k, n - k);
    const key = `${n}|${normalizedK}`;

    if (cache.has(key)) {
      return cache.get(key);
    }

    let result = 1n;
    for (let i = 1; i <= normalizedK; i++) {
      result = (result * BigInt(n - normalizedK + i)) / BigInt(i);
    }

    cache.set(key, result);
    return result;
  };
}

function isPerfectSelectionState(mask, tagFiveCount, categoryMask, natureCount, techCount) {
  return (
    mask === PERFECT_REQUIRED_TAG_MASK &&
    tagFiveCount >= 2 &&
    categoryMask === PERFECT_ALL_CATEGORY_MASK &&
    natureCount > 0 &&
    natureCount >= techCount
  );
}

function analyzePerfectSelections() {
  if (actions.length < PERFECT_SELECTION_SIZE) {
    return {
      count: 0n,
      totalCombinations: 0n,
      sampleSelections: [],
      budgetHalfUnits: 0,
    };
  }

  const groups = buildOptimizationGroups();
  const combine = buildCombinationCounter();
  const suffixCounts = new Array(groups.length + 1).fill(0);
  const suffixMasks = new Array(groups.length + 1).fill(0);
  const suffixCategoryMasks = new Array(groups.length + 1).fill(0);
  const suffixTagFiveCounts = new Array(groups.length + 1).fill(0);

  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index];
    suffixCounts[index] = suffixCounts[index + 1] + group.count;
    suffixMasks[index] = suffixMasks[index + 1] | group.tagMask;
    suffixCategoryMasks[index] =
      suffixCategoryMasks[index + 1] | group.categoryBit;
    suffixTagFiveCounts[index] =
      suffixTagFiveCounts[index + 1] + group.count * group.tagFiveCount;
  }

  const memo = new Map();

  function countSolutions(
    groupIndex,
    remaining,
    mask,
    tagFiveCount,
    categoryMask,
    natureCount,
    techCount
  ) {
    if (remaining === 0) {
      return isPerfectSelectionState(
        mask,
        tagFiveCount,
        categoryMask,
        natureCount,
        techCount
      )
        ? { count: 1n, totalCreditHalfUnits: 0n }
        : { count: 0n, totalCreditHalfUnits: 0n };
    }

    if (groupIndex >= groups.length || remaining > suffixCounts[groupIndex]) {
      return { count: 0n, totalCreditHalfUnits: 0n };
    }

    if (((mask | suffixMasks[groupIndex]) & PERFECT_REQUIRED_TAG_MASK) !== PERFECT_REQUIRED_TAG_MASK) {
      return { count: 0n, totalCreditHalfUnits: 0n };
    }

    if (((categoryMask | suffixCategoryMasks[groupIndex]) & PERFECT_ALL_CATEGORY_MASK) !== PERFECT_ALL_CATEGORY_MASK) {
      return { count: 0n, totalCreditHalfUnits: 0n };
    }

    if (tagFiveCount + suffixTagFiveCounts[groupIndex] < 2) {
      return { count: 0n, totalCreditHalfUnits: 0n };
    }

    const key = [
      groupIndex,
      remaining,
      mask,
      tagFiveCount,
      categoryMask,
      natureCount,
      techCount,
    ].join("|");

    if (memo.has(key)) {
      return memo.get(key);
    }

    const group = groups[groupIndex];
    let total = 0n;
    let totalCreditHalfUnits = 0n;
    const maxTake = Math.min(remaining, group.count);

    for (let take = 0; take <= maxTake; take++) {
      if (group.blocksPerfectScore && take > 0) {
        break;
      }

      const nextMask = take > 0 ? mask | group.tagMask : mask;
      const nextTagFiveCount = Math.min(2, tagFiveCount + take * group.tagFiveCount);
      const nextCategoryMask = take > 0 ? categoryMask | group.categoryBit : categoryMask;
      const nextNatureCount = natureCount + take * group.natureCount;
      const nextTechCount = techCount + take * group.techCount;
      const remainder = countSolutions(
        groupIndex + 1,
        remaining - take,
        nextMask,
        nextTagFiveCount,
        nextCategoryMask,
        nextNatureCount,
        nextTechCount
      );

      if (remainder.count > 0n) {
        const combinations = combine(group.count, take);
        const branchCount = combinations * remainder.count;
        const branchCreditHalfUnits =
          combinations *
          (remainder.totalCreditHalfUnits +
            remainder.count * BigInt(take * group.creditHalfUnits));
        total += branchCount;
        totalCreditHalfUnits += branchCreditHalfUnits;
      }
    }

    const result = {
      count: total,
      totalCreditHalfUnits,
    };
    memo.set(key, result);
    return result;
  }

  const metrics = countSolutions(0, PERFECT_SELECTION_SIZE, 0, 0, 0, 0, 0);
  const count = metrics.count;
  const budgetHalfUnits =
    count > 0n
      ? Number(
          (metrics.totalCreditHalfUnits + count - 1n) / count
        )
      : 0;

  const budgetMemo = new Map();

  function countSolutionsWithinBudget(
    groupIndex,
    remaining,
    mask,
    tagFiveCount,
    categoryMask,
    natureCount,
    techCount,
    remainingBudgetHalfUnits
  ) {
    if (remainingBudgetHalfUnits < 0) {
      return 0n;
    }

    if (remaining === 0) {
      return isPerfectSelectionState(
        mask,
        tagFiveCount,
        categoryMask,
        natureCount,
        techCount
      )
        ? 1n
        : 0n;
    }

    if (groupIndex >= groups.length || remaining > suffixCounts[groupIndex]) {
      return 0n;
    }

    if (((mask | suffixMasks[groupIndex]) & PERFECT_REQUIRED_TAG_MASK) !== PERFECT_REQUIRED_TAG_MASK) {
      return 0n;
    }

    if (((categoryMask | suffixCategoryMasks[groupIndex]) & PERFECT_ALL_CATEGORY_MASK) !== PERFECT_ALL_CATEGORY_MASK) {
      return 0n;
    }

    if (tagFiveCount + suffixTagFiveCounts[groupIndex] < 2) {
      return 0n;
    }

    const key = [
      groupIndex,
      remaining,
      mask,
      tagFiveCount,
      categoryMask,
      natureCount,
      techCount,
      remainingBudgetHalfUnits,
    ].join("|");

    if (budgetMemo.has(key)) {
      return budgetMemo.get(key);
    }

    const group = groups[groupIndex];
    let total = 0n;
    const maxTake = group.creditHalfUnits > 0
      ? Math.min(
          remaining,
          group.count,
          Math.floor(remainingBudgetHalfUnits / group.creditHalfUnits)
        )
      : Math.min(remaining, group.count);

    for (let take = 0; take <= maxTake; take++) {
      if (group.blocksPerfectScore && take > 0) {
        break;
      }

      const cost = take * group.creditHalfUnits;
      if (cost > remainingBudgetHalfUnits) {
        break;
      }

      const nextMask = take > 0 ? mask | group.tagMask : mask;
      const nextTagFiveCount = Math.min(2, tagFiveCount + take * group.tagFiveCount);
      const nextCategoryMask = take > 0 ? categoryMask | group.categoryBit : categoryMask;
      const nextNatureCount = natureCount + take * group.natureCount;
      const nextTechCount = techCount + take * group.techCount;
      const remainder = countSolutionsWithinBudget(
        groupIndex + 1,
        remaining - take,
        nextMask,
        nextTagFiveCount,
        nextCategoryMask,
        nextNatureCount,
        nextTechCount,
        remainingBudgetHalfUnits - cost
      );

      if (remainder > 0n) {
        total += combine(group.count, take) * remainder;
      }
    }

    budgetMemo.set(key, total);
    return total;
  }

  function buildSample(
    groupIndex,
    remaining,
    mask,
    tagFiveCount,
    categoryMask,
    natureCount,
    techCount,
    selections,
    remainingBudgetHalfUnits
  ) {
    if (remainingBudgetHalfUnits < 0) {
      return null;
    }

    if (remaining === 0) {
      return isPerfectSelectionState(
        mask,
        tagFiveCount,
        categoryMask,
        natureCount,
        techCount
      )
        ? selections
        : null;
    }

    const group = groups[groupIndex];
    const maxTake = Math.min(remaining, group.count);

    for (let take = 0; take <= maxTake; take++) {
      if (group.blocksPerfectScore && take > 0) {
        break;
      }

      const cost = take * group.creditHalfUnits;
      if (cost > remainingBudgetHalfUnits) {
        break;
      }

      const nextMask = take > 0 ? mask | group.tagMask : mask;
      const nextTagFiveCount = Math.min(2, tagFiveCount + take * group.tagFiveCount);
      const nextCategoryMask = take > 0 ? categoryMask | group.categoryBit : categoryMask;
      const nextNatureCount = natureCount + take * group.natureCount;
      const nextTechCount = techCount + take * group.techCount;
      const remainder = countSolutionsWithinBudget(
        groupIndex + 1,
        remaining - take,
        nextMask,
        nextTagFiveCount,
        nextCategoryMask,
        nextNatureCount,
        nextTechCount,
        remainingBudgetHalfUnits - cost
      );

      if (remainder > 0n) {
        const nextSelections =
          take > 0
            ? [...selections, ...group.actions.slice(0, take)]
            : selections;
        const result = buildSample(
          groupIndex + 1,
          remaining - take,
          nextMask,
          nextTagFiveCount,
          nextCategoryMask,
          nextNatureCount,
          nextTechCount,
          nextSelections,
          remainingBudgetHalfUnits - cost
        );

        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  function buildTakeOrder(maxTake, mode) {
    const values = Array.from({ length: maxTake + 1 }, (_, index) => index);
    if (mode === "desc") {
      return values.reverse();
    }
    if (mode === "center") {
      const center = Math.floor(maxTake / 2);
      return values.sort((left, right) => {
        const leftDistance = Math.abs(left - center);
        const rightDistance = Math.abs(right - center);
        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }
        return right - left;
      });
    }
    return values;
  }

  function buildVariantSample(
    groupIndex,
    remaining,
    mask,
    tagFiveCount,
    categoryMask,
    natureCount,
    techCount,
    selections,
    mode,
    remainingBudgetHalfUnits
  ) {
    if (remainingBudgetHalfUnits < 0) {
      return null;
    }

    if (remaining === 0) {
      return isPerfectSelectionState(
        mask,
        tagFiveCount,
        categoryMask,
        natureCount,
        techCount
      )
        ? selections
        : null;
    }

    const group = groups[groupIndex];
    const maxTake = Math.min(remaining, group.count);
    const takeOrder = buildTakeOrder(maxTake, mode);

    for (const take of takeOrder) {
      if (group.blocksPerfectScore && take > 0) {
        continue;
      }

      const cost = take * group.creditHalfUnits;
      if (cost > remainingBudgetHalfUnits) {
        continue;
      }

      const nextMask = take > 0 ? mask | group.tagMask : mask;
      const nextTagFiveCount = Math.min(2, tagFiveCount + take * group.tagFiveCount);
      const nextCategoryMask = take > 0 ? categoryMask | group.categoryBit : categoryMask;
      const nextNatureCount = natureCount + take * group.natureCount;
      const nextTechCount = techCount + take * group.techCount;
      const remainder = countSolutionsWithinBudget(
        groupIndex + 1,
        remaining - take,
        nextMask,
        nextTagFiveCount,
        nextCategoryMask,
        nextNatureCount,
        nextTechCount,
        remainingBudgetHalfUnits - cost
      );

      if (remainder === 0n) {
        continue;
      }

      let chosenActions = [];
      if (take > 0) {
        if (mode === "desc") {
          chosenActions = group.actions.slice(group.actions.length - take);
        } else if (mode === "center") {
          const start = Math.max(0, Math.floor((group.actions.length - take) / 2));
          chosenActions = group.actions.slice(start, start + take);
        } else {
          chosenActions = group.actions.slice(0, take);
        }
      }

      const result = buildVariantSample(
        groupIndex + 1,
        remaining - take,
        nextMask,
        nextTagFiveCount,
        nextCategoryMask,
        nextNatureCount,
        nextTechCount,
        [...selections, ...chosenActions],
        mode,
        remainingBudgetHalfUnits - cost
      );

      if (result) {
        return result;
      }
    }

    return null;
  }

  const totalCombinations = combine(actions.length, PERFECT_SELECTION_SIZE);
  const sampleSelections = [];
  const seen = new Set();

  if (count > 0n) {
    const primarySample =
      buildSample(0, PERFECT_SELECTION_SIZE, 0, 0, 0, 0, 0, [], budgetHalfUnits) || [];
    const variants = [
      primarySample,
      buildVariantSample(0, PERFECT_SELECTION_SIZE, 0, 0, 0, 0, 0, [], "desc", budgetHalfUnits) || [],
      buildVariantSample(0, PERFECT_SELECTION_SIZE, 0, 0, 0, 0, 0, [], "center", budgetHalfUnits) || [],
    ];

    variants.forEach((selection) => {
      if (!selection.length) {
        return;
      }
      const normalized = [...selection].sort((left, right) => left.id - right.id);
      const key = normalized.map((action) => action.id).join("-");
      if (!seen.has(key)) {
        seen.add(key);
        sampleSelections.push(normalized);
      }
    });
  }

  return {
    count,
    totalCombinations,
    sampleSelections,
    budgetHalfUnits,
  };
}

function renderMasterPerfectPanel() {
  const box = document.getElementById("masterPerfectBox");
  const countEl = document.getElementById("masterPerfectCount");
  const statusEl = document.getElementById("masterPerfectStatus");
  const listEl = document.getElementById("masterPerfectList");
  const visible = sessionRole === "master";

  if (!box || !countEl || !statusEl || !listEl) {
    return;
  }

  box.style.display = visible ? "block" : "none";
  box.classList.toggle("hidden", !visible);

  if (!visible) {
    return;
  }

  if (!perfectScoreAnalysis) {
    countEl.textContent = "...";
    statusEl.textContent = "Calcul des combinaisons 10/10 en cours.";
    listEl.innerHTML = "";
    return;
  }

  countEl.textContent = formatBigInt(perfectScoreAnalysis.count);

  if (perfectScoreAnalysis.count === 0n) {
    statusEl.textContent = "Aucune combinaison de 15 actions ne permet d'atteindre 10/10.";
    listEl.innerHTML = "";
    return;
  }

  const displayNumberMap = buildDisplayedActionNumberMap();
  const completion = analyzeSelectionCompletion(roomState);
  const percentage = formatPercentage(
    perfectScoreAnalysis.count,
    perfectScoreAnalysis.totalCombinations
  );
  countEl.textContent = percentage;
  statusEl.textContent = `Un lot de reference et le complement a selectionner pour atteindre 10/10 sous ${formatCreditAmountFromHalfUnits(
    perfectScoreAnalysis.budgetHalfUnits
  )} credits.`;
  const referenceSelection = perfectScoreAnalysis.sampleSelections[0] || [];
  const sortedReferenceSelection = [...referenceSelection].sort((left, right) => {
    const leftNumber = displayNumberMap.get(String(left.id)) || left.id;
    const rightNumber = displayNumberMap.get(String(right.id)) || right.id;
    return leftNumber - rightNumber;
  });
  const referenceItems = sortedReferenceSelection
    .map((action) => {
      const displayNumber = displayNumberMap.get(String(action.id)) || action.id;
      const axes = getAxesForAction(action);
      const axesLabel = axes.length
        ? ` (axe${axes.length > 1 ? "s" : ""} ${axes.join(", ")}, tag ${action.tag})`
        : ` (tag ${action.tag})`;
      return `<li><strong>${displayNumber}.</strong> ${action.title}${axesLabel}</li>`;
    })
    .join("");

  let completionMarkup = "<li><strong>A selectionner maintenant</strong> : impossible</li>";

  if (completion.status === "already-perfect") {
    completionMarkup =
      "<li><strong>A selectionner maintenant</strong> : rien, la selection actuelle atteint deja 10/10.</li>";
  } else if (completion.status === "ok") {
    const sortedCompletionSelection = [...completion.selection].sort((left, right) => {
      const leftNumber = displayNumberMap.get(String(left.id)) || left.id;
      const rightNumber = displayNumberMap.get(String(right.id)) || right.id;
      return leftNumber - rightNumber;
    });
    const completionItems = sortedCompletionSelection
      .map((action) => {
        const displayNumber = displayNumberMap.get(String(action.id)) || action.id;
        const axes = getAxesForAction(action);
        const axesLabel = axes.length
          ? ` (axe${axes.length > 1 ? "s" : ""} ${axes.join(", ")}, tag ${action.tag})`
          : ` (tag ${action.tag})`;
        return `<li><strong>${displayNumber}.</strong> ${action.title}${axesLabel}</li>`;
      })
      .join("");
    const completionCredits = formatCreditAmountFromHalfUnits(
      getSelectionCreditHalfUnits(sortedCompletionSelection)
    );
    completionMarkup =
      `<li><strong>A selectionner maintenant</strong> (${completionCredits} credits)<ol>${completionItems}</ol></li>`;
  }

  listEl.innerHTML =
    `<li><strong>Lot de reference</strong> (${formatCreditAmountFromHalfUnits(
      getSelectionCreditHalfUnits(sortedReferenceSelection)
    )} credits)<ol>${referenceItems}</ol></li>` +
    completionMarkup;
}

function schedulePerfectScoreAnalysis() {
  perfectScoreAnalysis = null;
  creditBudgetHalfUnits = 0;
  renderMasterPerfectPanel();

  if (actions.length < PERFECT_SELECTION_SIZE) {
    perfectScoreAnalysis = {
      count: 0n,
      totalCombinations: 0n,
      sampleSelections: [],
      budgetHalfUnits: 0,
    };
    creditBudgetHalfUnits = 0;
    maybeRender();
    renderMasterPerfectPanel();
    return;
  }

  const token = ++perfectScoreAnalysisToken;
  window.setTimeout(() => {
    if (token !== perfectScoreAnalysisToken) {
      return;
    }

    try {
      perfectScoreAnalysis = analyzePerfectSelections();
      creditBudgetHalfUnits = perfectScoreAnalysis.budgetHalfUnits || 0;
    } catch (error) {
      console.error(error);
      perfectScoreAnalysis = {
        count: 0n,
        totalCombinations: 0n,
        sampleSelections: [],
        budgetHalfUnits: 0,
      };
      creditBudgetHalfUnits = 0;
    }

    maybeRender();
    renderMasterPerfectPanel();
  }, 0);
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

function renderTopRisks(state) {
  const topRisks = getDisplayedTopRisks(state);

  topRisks.forEach((risk, index) => {
    const labelEl = document.getElementById(`riskLabel${index + 1}`);
    const impactEl = document.getElementById(`riskImpact${index + 1}`);

    if (labelEl) {
      labelEl.textContent = risk;
    }

    if (impactEl) {
      impactEl.textContent = "";
      impactEl.classList.add("hidden");
    }
  });
}

function renderMasterRiskSetup(state) {
  const shouldShowSetup =
    Number(state?.mode) === 0 &&
    isCurrentUserMaster() &&
    !hasConfiguredTopRisks(state);

  if (!shouldShowSetup) {
    masterRiskSetupDirty = false;
    setMasterRiskSetupError("");
    return;
  }

  const selectedValues = masterRiskSetupDirty
    ? getMasterRiskSelectValues()
    : sanitizeTopRisks(state?.topRisks);
  const selectedCatalogPath = masterRiskSetupDirty
    ? getMasterActionCatalogValue()
    : getRoomActionsCatalogPath(state);

  renderMasterRiskSelectOptions(selectedValues);
  renderMasterActionCatalogOptions(selectedCatalogPath);
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
  const showMasterRiskSetup =
    nextMode === 0 &&
    isCurrentUserMaster() &&
    !hasConfiguredTopRisks(roomState);
  const homeScreen = document.getElementById("homeScreen");
  const masterRiskSetupScreen = document.getElementById(
    "masterRiskSetupScreen"
  );
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
  const selectionBudgetLabel = document.getElementById("selectionBudgetLabel");

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

  if (homeScreen) {
    homeScreen.classList.toggle("hidden", nextMode !== 0 || showMasterRiskSetup);
  }
  if (masterRiskSetupScreen) {
    masterRiskSetupScreen.classList.toggle(
      "hidden",
      nextMode !== 0 || !showMasterRiskSetup
    );
  }
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
    startButton.style.display =
      isCurrentUserMaster() && nextMode === 0 && !showMasterRiskSetup
        ? ""
        : "none";
  }

  if (homeMeta) {
    homeMeta.textContent = isCurrentUserMaster()
      ? "Maître de partie"
      : "Mode joueur";
  }

  if (selectionBudgetLabel) {
    selectionBudgetLabel.textContent = nextMode === 1 ? "Actions" : "Crédits";
  }

  document.body.classList.toggle("round-one-mode", nextMode === 1);
  syncChartPinUI(nextMode);
  maybeShowModeRules(nextMode);
}

function getChartCardElements() {
  return {
    chartCard: document.getElementById("chartCard"),
    chartCardHost: document.getElementById("chartCardHost"),
    chartPinToggle: document.getElementById("chartPinToggle"),
  };
}

function applyChartPinnedState(nextMode) {
  const { chartCard, chartCardHost, chartPinToggle } = getChartCardElements();
  if (!chartCard || !chartCardHost) {
    return;
  }

  const canPin = nextMode === 2 || nextMode === 3;
  const shouldPin = canPin && chartCardPinned;

  chartCard.classList.toggle("chart-card--pinned", shouldPin);
  document.body.classList.toggle("chart-card-pinned", shouldPin);

  if (chartPinToggle) {
    chartPinToggle.classList.toggle("hidden", !canPin);
    chartPinToggle.textContent = shouldPin ? "Desepingler" : "Epingler";
    chartPinToggle.setAttribute("aria-pressed", shouldPin ? "true" : "false");
  }

  if (chart) {
    window.requestAnimationFrame(() => {
      if (chart) {
        chart.resize();
      }
    });
  }
}

function syncChartPinUI(nextMode = mode) {
  if (nextMode !== 2 && nextMode !== 3 && chartCardPinned) {
    chartCardPinned = false;
    try {
      window.localStorage.setItem(CHART_PIN_STORAGE_KEY, "0");
    } catch (error) {
      console.warn("Impossible de sauvegarder l'etat d'epinglage.", error);
    }
  }

  applyChartPinnedState(nextMode);
}

function toggleChartPin() {
  if (mode !== 2 && mode !== 3) {
    return;
  }

  chartCardPinned = !chartCardPinned;

  try {
    window.localStorage.setItem(
      CHART_PIN_STORAGE_KEY,
      chartCardPinned ? "1" : "0"
    );
  } catch (error) {
    console.warn("Impossible de sauvegarder l'etat d'epinglage.", error);
  }

  syncChartPinUI(mode);
}

function updatePermissionUI() {
  const modeBox = document.querySelector(".mode-box");
  const modeButtons = document.querySelectorAll(".mode-box button");
  const resetBtn = document.querySelector(".reset-btn");
  const startBtn = document.querySelector(".home-screen__cta");
  const roleIsMaster = isCurrentUserMaster();
  const hasTopRisks = hasConfiguredTopRisks(roomState);

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
    startBtn.disabled = !roleIsMaster || !hasTopRisks;
    startBtn.title = !roleIsMaster
      ? "Réservé au maître de partie"
      : hasTopRisks
      ? ""
      : "Choisissez d'abord 3 risques climatiques.";
    startBtn.style.display = roleIsMaster && mode === 0 && hasTopRisks ? "" : "none";
  }

  const roleBadge = document.getElementById("roleBadge");
  if (roleBadge) {
    roleBadge.textContent = roleIsMaster
      ? "Maître de partie"
      : "Joueur";
  }

  renderMasterPerfectPanel();
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

categoryFilterSelect?.addEventListener("change", applyCategoryFilter);

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
        ${buildCreditMeterMarkup(action)}
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
        ${buildCreditMeterMarkup(action)}
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
  const persistedScore = Number(state?.score);
  const score = Number.isFinite(persistedScore) ? persistedScore : metrics.score;
  const selectedCount = selectedActions.length;
  const selectedCreditHalfUnits = getSelectionCreditHalfUnits(selectedActions);
  const selectedCredits = halfUnitsToCredit(selectedCreditHalfUnits);
  const budgetCredits = halfUnitsToCredit(creditBudgetHalfUnits);
  const isRoundOne = isRoundOneMode(state);
  const selectionTarget = isRoundOne
    ? ROUND_ONE_SELECTION_SIZE
    : creditBudgetHalfUnits;
  const revealScore =
    shouldRevealScore(state, selectedCount) ||
    (isCurrentUserMaster() && (Number(state?.mode) === 2 || Number(state?.mode) === 3));
  const ratio = score / 10;

  const scoreEl = document.getElementById("score");
  const scoreGaugeFill = document.getElementById("scoreGaugeFill");
  const actionProgressFill = document.getElementById("actionProgressFill");
  const actionProgress = actionProgressFill
    ? actionProgressFill.parentElement
    : null;
  const countEl = document.getElementById("count");
  const selectionBudgetLabel = document.getElementById("selectionBudgetLabel");
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
    const actionRatio =
      selectionTarget > 0
        ? (isRoundOne
            ? Math.min(selectedCount, selectionTarget) / selectionTarget
            : Math.min(selectedCreditHalfUnits, selectionTarget) / selectionTarget)
        : 0;
    actionProgressFill.style.width = `${actionRatio * 100}%`;
    if (actionProgress) {
      actionProgress.classList.toggle(
        "action-progress--full",
        selectionTarget > 0 &&
          (isRoundOne
            ? selectedCount >= selectionTarget
            : selectedCreditHalfUnits >= selectionTarget)
      );
    }
  }

  if (selectionBudgetLabel) {
    selectionBudgetLabel.textContent = isRoundOne ? "Actions" : "Crédits";
  }

  if (countEl) {
    countEl.textContent = isRoundOne
      ? String(selectedCount)
      : formatCreditAmount(selectedCredits);
  }

  const countBudgetEl = document.getElementById("countBudget");
  if (countBudgetEl) {
    countBudgetEl.textContent = selectionTarget > 0
      ? (isRoundOne
          ? String(ROUND_ONE_SELECTION_SIZE)
          : formatCreditAmount(budgetCredits))
      : "...";
  }

  if (summary) {
    const numbers = [...document.querySelectorAll('#grid input[type="checkbox"]:checked')]
      .map((input) => Number(input.dataset.displayNumber))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);

    summary.innerHTML = `Actions : ${
      numbers.length ? numbers.join(", ") : "0 action"
    }<br>Credits : ${formatCreditAmount(selectedCredits)}`;
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
  renderTopRisks(roomState);
  renderMasterRiskSetup(roomState);
  renderSelectionState(roomState);
  renderScoreBlock(roomState);
  updateVictoryModalState(roomState);
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

function buildActionsFromCsvText(csvText) {
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
      creditNormalized: parseNormalizedCredit(
        getCell(row, ["Crédit normalisé", "Credit normalise"])
      ),
    };
  });
}

function refreshActionsFromCsvText(csvText) {
  buildActionsFromCsvText(csvText);
  renderActionsGrid();
  schedulePerfectScoreAnalysis();
  if (roomReady) {
    renderRoomState();
  }
}

async function loadActionsFromCSV(nextPath = activeActionsCsvPath || DEFAULT_ACTIONS_CSV_PATH) {
  const catalogPath = sanitizeActionsCatalogPath(nextPath);
  const requestToken = ++actionsLoadToken;
  const url = new URL(catalogPath, window.location.href);

  url.searchParams.set("_ts", String(Date.now()));
  const response = await fetch(url, { cache: "no-store" });
  const csvText = await response.text();
  if (/<!doctype html/i.test(csvText)) {
    throw new Error(`Catalogue invalide: ${catalogPath}`);
  }

  if (requestToken !== actionsLoadToken) {
    return;
  }

  activeActionsCsvPath = catalogPath;
  actionsCsvSnapshot = csvText;

  refreshActionsFromCsvText(csvText);
  actionsReady = true;
  maybeRender();
}

function startActionsCsvPolling() {
  if (actionsCsvPollHandle) {
    return;
  }

  actionsCsvPollHandle = window.setInterval(async () => {
    try {
      const url = new URL(activeActionsCsvPath || DEFAULT_ACTIONS_CSV_PATH, window.location.href);
      url.searchParams.set("_ts", String(Date.now()));
      const response = await fetch(url, { cache: "no-store" });
      const csvText = await response.text();

      if (!csvText || /<!doctype html/i.test(csvText) || csvText === actionsCsvSnapshot) {
        return;
      }

      actionsCsvSnapshot = csvText;
      refreshActionsFromCsvText(csvText);
    } catch (error) {
      console.error(error);
    }
  }, ACTIONS_CSV_POLL_INTERVAL_MS);
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
  roomRef = firebaseDb.ref(buildRoomPath(selectedRoomNumber));

  firebaseAuth
    .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch(() => {});

  firebaseAuth.onAuthStateChanged(async (user) => {
    currentUser = user;

    if (!user) {
      showMessage("Connexion Firebase en cours...");
      return;
    }

    await ensureRoomExists();
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

async function ensureRoomExists() {
  if (!roomRef || roomInitialized) {
    return;
  }

  try {
    await roomRef.transaction((current) => {
      if (current) {
        return current;
      }

      return {
        ...DEFAULT_ROOM_STATE,
        updatedAt: Date.now(),
      };
    });
    roomInitialized = true;
  } catch (error) {
    console.error(error);
    showMessage("Impossible de créer ou rejoindre la room Firebase.");
    throw error;
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
    if (!snapshot.exists()) {
      if (roomDeletionPending) {
        return;
      }

      redirectToInitialRoomScreen("La room a été réinitialisée.");
      return;
    }

    roomState = normalizeRoomState(snapshot.val());
    roomReady = true;
    isMaster = isCurrentUserMaster();
    const nextCatalogPath = getRoomActionsCatalogPath(roomState);
    const catalogChanged =
      normalizeCatalogPathKey(nextCatalogPath) !==
      normalizeCatalogPathKey(activeActionsCsvPath);

    if (catalogChanged) {
      actionsReady = false;
      loadActionsFromCSV(nextCatalogPath).catch((error) => {
        console.error(error);
        actionsReady = true;
        maybeRender();
        showMessage("Impossible de charger le catalogue de fiches actions.");
      });
    }

    maybeRender();
  });
}

async function handleMasterRiskSetupSubmit() {
  if (!roomRef || !isCurrentUserMaster()) {
    setMasterRiskSetupError("Reserve au maitre de partie.");
    return;
  }

  const selects = getMasterRiskSelectElements();
  if (selects.some((select) => !select)) {
    return;
  }

  const selectedValues = getMasterRiskSelectValues();
  const firstMissingSelect = selects.find(
    (select) => !String(select.value || "").trim()
  );

  if (firstMissingSelect) {
    setMasterRiskSetupError("Choisissez 3 aleas climatiques.");
    firstMissingSelect.focus();
    return;
  }

  const topRisks = sanitizeTopRisks(selectedValues);
  if (topRisks.length !== 3 || topRisks.length !== selectedValues.length) {
    setMasterRiskSetupError("Choisissez 3 aleas differents.");
    renderMasterRiskSelectOptions(selectedValues);
    return;
  }

  const selectedCatalogPath = getMasterActionCatalogValue();
  if (!selectedCatalogPath) {
    setMasterRiskSetupError("Choisissez un catalogue de fiches actions.");
    getMasterActionCatalogSelectElement()?.focus();
    return;
  }

  const submitButton = document.getElementById("masterRiskSetupSubmit");
  if (submitButton) {
    submitButton.disabled = true;
  }

  setMasterRiskSetupError("");

  try {
    const result = await roomRef.transaction((current) => {
      const next = normalizeRoomState(current);
      const previousCatalogPath = getRoomActionsCatalogPath(next);
      const catalogChanged =
        normalizeCatalogPathKey(previousCatalogPath) !==
        normalizeCatalogPathKey(selectedCatalogPath);

      next.topRisks = topRisks;
      next.actionsCatalogPath = selectedCatalogPath;
      if (catalogChanged) {
        next.selectedIds = {};
        next.history = [0];
        next.score = 0;
        next.resetVersion = (Number(next.resetVersion) || 0) + 1;
      }
      next.updatedAt = Date.now();
      return next;
    });

    if (!result.committed) {
      setMasterRiskSetupError("Impossible d'enregistrer ce top 3.");
    } else {
      masterRiskSetupDirty = false;
    }
  } catch (error) {
    console.error(error);
    setMasterRiskSetupError("Impossible d'enregistrer ce top 3.");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

async function requestSelectionToggle(actionId) {
  if (!roomRef) {
    return;
  }

  let blockedByBudget = false;
  let blockedByActionLimit = false;

  try {
    await roomRef.transaction((current) => {
      const next = normalizeRoomState(current);
      const key = String(actionId);

      if (next.selectedIds[key]) {
        delete next.selectedIds[key];
      } else {
        const targetAction = actions.find((action) => String(action.id) === key);
        const currentCreditHalfUnits = getSelectionCreditHalfUnits(
          getSelectedActionsFromState(next)
        );
        const currentSelectionCount = getSelectedActionsFromState(next).length;
        const nextCreditHalfUnits =
          currentCreditHalfUnits +
          creditToHalfUnits(targetAction?.creditNormalized || 0);

        if (next.mode === 1 && currentSelectionCount >= ROUND_ONE_SELECTION_SIZE) {
          blockedByActionLimit = true;
          return;
        }

        if (
          next.mode !== 1 &&
          creditBudgetHalfUnits > 0 &&
          nextCreditHalfUnits > creditBudgetHalfUnits
        ) {
          blockedByBudget = true;
          return;
        }

        next.selectedIds[key] = true;
      }

      const selectedActions = getSelectedActionsFromState(next);
      const metrics = computeMetricsFromSelection(selectedActions);
      next.score = metrics.score;
      next.history = [...(next.history || [0]), metrics.score];
      next.updatedAt = Date.now();

      return next;
    });

    if (blockedByBudget) {
      showMessage(
        `Budget de credits atteint (${formatCreditAmountFromHalfUnits(
          creditBudgetHalfUnits
        )}).`
      );
    } else if (blockedByActionLimit) {
      showMessage(`Limite atteinte (${ROUND_ONE_SELECTION_SIZE} actions).`);
    }
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
    roomDeletionPending = true;
    await roomRef.remove();
    redirectToInitialRoomScreen("La room a été réinitialisée.");
  } catch (error) {
    roomDeletionPending = false;
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

  if (!hasConfiguredTopRisks(roomState)) {
    setMasterRiskSetupError("Choisissez d'abord vos 3 risques climatiques.");
    renderMasterRiskSetup(roomState || DEFAULT_ROOM_STATE);
    document.getElementById("masterRiskSelect1")?.focus();
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

function exportPDFEnhanced() {
  const selectedActions = getSelectedActionsFromState(roomState || DEFAULT_ROOM_STATE);
  const grouped = {};
  const assets = {
    logo: new URL("images/Akteologo.svg", window.location.href).href,
    riskCard: new URL("images/calcul risque.png", window.location.href).href,
    adaptationPathCard: new URL("images/chemin adaptation.png", window.location.href).href,
    bestPracticesCard: new URL("images/bonnes pratiques.png", window.location.href).href,
  };

  selectedActions.forEach((action) => {
    if (!grouped[action.cat]) {
      grouped[action.cat] = [];
    }
    grouped[action.cat].push(action.title);
  });

  let html = `
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        :root{
          --background_color:#fbfcf8;
          --surface_color:#ffffff;
          --surface_soft_color:#f5f7f3;
          --text_color:#0f1511;
          --muted_color:#5c6761;
          --border_color:rgba(15, 21, 17, 0.12);
          --accent_color:#99ff99;
          --accent_soft_color:rgba(153, 255, 153, 0.18);
          --accent_ink_color:#103010;
          --font_family:"Lato", system-ui, sans-serif;
          --radius_md:12px;
          --shadow_soft:0 16px 40px rgba(0, 0, 0, 0.06);
        }
        *{box-sizing:border-box;}
        body{
          margin:0;
          font-family:var(--font_family);
          padding:24px;
          color:var(--text_color);
          background:
            radial-gradient(circle at top left, var(--accent_soft_color), transparent 35%),
            radial-gradient(circle at top right, var(--accent_soft_color), transparent 30%),
            var(--background_color);
        }
        .cover{
          min-height:calc(100vh - 48px);
          display:flex;
          align-items:center;
          justify-content:center;
          page-break-after:always;
          margin-bottom:24px;
        }
        .cover-panel{
          width:min(100%, 1180px);
          min-height:calc(100vh - 140px);
          padding:56px;
          border-radius:28px;
          background:var(--accent_color);
          color:var(--accent_ink_color);
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:36px;
          text-align:center;
          box-shadow:var(--shadow_soft);
        }
        .cover-panel img{
          width:min(76vw, 620px);
          max-height:38vh;
          object-fit:contain;
        }
        .cover-panel h1{
          margin:0;
          font-size:clamp(3.2rem, 5vw, 5.6rem);
          color:var(--accent_ink_color);
        }
        .cards{display:block;margin:28px 0 36px;}
        .card{
          border:1px solid var(--border_color);
          border-radius:var(--radius_md);
          padding:18px;
          background:var(--surface_color);
          box-shadow:var(--shadow_soft);
          break-inside:avoid;
          min-height:calc(100vh - 120px);
          display:flex;
          flex-direction:column;
          justify-content:center;
          page-break-after:always;
          margin-bottom:24px;
        }
        .card img{
          display:block;
          width:100%;
          height:calc(100vh - 220px);
          min-height:900px;
          object-fit:contain;
        }
        h2{color:var(--text_color);margin:0 0 16px;}
        .section-rule{
          width:64px;
          height:4px;
          border-radius:999px;
          background:var(--accent_color);
          margin:0 0 18px;
        }
        .cat{
          margin-top:18px;
          padding:14px 16px;
          background:var(--surface_soft_color);
          border:1px solid var(--border_color);
          border-radius:var(--radius_md);
          break-inside:avoid;
        }
        .cat strong{
          display:block;
          margin-bottom:8px;
          color:var(--accent_ink_color);
        }
        .cat ul{margin:0;padding-left:20px;}
        .cat li{margin-bottom:6px;color:var(--muted_color);}
        @media print{
          body{padding:16px;}
          .cover{
            min-height:calc(100vh - 32px);
            margin-bottom:0;
          }
          .cover-panel{
            width:100%;
            min-height:calc(100vh - 64px);
            padding:40px;
            border-radius:24px;
          }
          .card{
            min-height:calc(100vh - 64px);
            margin-bottom:0;
          }
          .card img{
            height:calc(100vh - 180px);
            min-height:0;
          }
        }
      </style>
    </head>
    <body>
      <div class="cover">
        <div class="cover-panel">
          <img src="${assets.logo}" alt="Logo Akteo">
          <h1>Atelier ClimAdapt</h1>
        </div>
      </div>

      <div class="cards">
        <div class="card">
          <img src="${assets.riskCard}" alt="Fiche calcul risque">
        </div>
        <div class="card">
          <img src="${assets.adaptationPathCard}" alt="Fiche chemin adaptation">
        </div>
        <div class="card">
          <img src="${assets.bestPracticesCard}" alt="Fiche bonnes pratiques">
        </div>
      </div>

      <div class="section-rule"></div>
      <h2>Actions sélectionnées</h2>
  `;

  Object.keys(grouped).forEach((category) => {
    html += `<div class="cat"><strong>${category}</strong><ul>`;
    grouped[category].forEach((title) => {
      html += `<li>${title}</li>`;
    });
    html += `</ul></div>`;
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
  closeModeRulesModal();
}

function initRoleGate() {
  const roomDeletionNotice = consumeRoomDeletionNotice();
  const savedPlayerProfile = loadPlayerSessionProfile();
  showRoleGate();

  const roomForm = document.getElementById("roomGateForm");
  const roomInput = document.getElementById("roomNumberInput");
  const form = document.getElementById("roleGateForm");
  const input = document.getElementById("roleCodeInput");
  const submit = document.getElementById("roleCodeSubmit");
  const backButton = document.getElementById("roleGateBack");
  const consentCheckbox = document.getElementById("roomConsentCheckbox");
  const firstNameInput = document.getElementById("playerFirstNameInput");
  const lastNameInput = document.getElementById("playerLastNameInput");
  const modeRulesClose = document.getElementById("modeRulesClose");
  const modeRulesBackdrop = document.getElementById("modeRulesBackdrop");
  const victoryModalClose = document.getElementById("victoryModalClose");
  const victoryModalDownload = document.getElementById("victoryModalDownload");
  const masterRiskSetupForm = document.getElementById("masterRiskSetupForm");
  const masterRiskSelects = getMasterRiskSelectElements();
  const masterActionCatalogSelect = getMasterActionCatalogSelectElement();

  showRoomGateStep();
  setRoomGateError(roomDeletionNotice);
  setRoleGateError("");
  playerSessionProfile = savedPlayerProfile;
  setPlayerProfileInputs(savedPlayerProfile);

  if (savedPlayerProfile?.roomNumber && roomInput) {
    roomInput.value = String(savedPlayerProfile.roomNumber).padStart(2, "0");
  }

  roomForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleRoomNumberSubmit();
  });

  roomInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleRoomNumberSubmit();
    }
  });

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

  firstNameInput?.addEventListener("input", () => {
    setRoleGateError("");
  });

  lastNameInput?.addEventListener("input", () => {
    setRoleGateError("");
  });

  backButton?.addEventListener("click", (event) => {
    event.preventDefault();
    setRoleGateError("");
    showRoomGateStep();
    roomInput?.focus();
  });

  consentCheckbox?.addEventListener("change", () => {
    if (consentCheckbox.checked) {
      setRoomGateError("");
      setRoleGateError("");
    }
  });

  masterRiskSetupForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    handleMasterRiskSetupSubmit();
  });

  masterRiskSelects.forEach((select) => {
    select?.addEventListener("change", () => {
      masterRiskSetupDirty = true;
      renderMasterRiskSelectOptions(getMasterRiskSelectValues());
      setMasterRiskSetupError("");
    });
  });

  masterActionCatalogSelect?.addEventListener("change", () => {
    masterRiskSetupDirty = true;
    setMasterRiskSetupError("");
  });

  modeRulesClose?.addEventListener("click", closeModeRulesModal);
  modeRulesBackdrop?.addEventListener("click", closeModeRulesModal);
  victoryModalClose?.addEventListener("click", closeVictoryModal);
  victoryModalDownload?.addEventListener("click", downloadDiplomaPdf);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModeRulesModal();
      closeVictoryModal();
    }
  });

  renderMasterRiskSelectOptions();
  renderMasterActionCatalogOptions(DEFAULT_ACTIONS_CSV_PATH);
  roomInput?.focus();
}

applyInitialVisibility();
hideAppShell();
document.body.classList.add("role-gate-open");
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initRoleGate);
} else {
  initRoleGate();
}

function exportPDFCustom() {
  const selectedActions = getSelectedActionsFromState(roomState || DEFAULT_ROOM_STATE);
  const grouped = {};
  const assets = {
    logo: new URL("images/Akteologo.svg", window.location.href).href,
    riskCard: new URL("images/calcul risque.png", window.location.href).href,
    adaptationPathCard: new URL("images/chemin adaptation.png", window.location.href).href,
    bestPracticesCard: new URL("images/bonnes pratiques.png", window.location.href).href,
  };

  selectedActions.forEach((action) => {
    if (!grouped[action.cat]) {
      grouped[action.cat] = [];
    }
    grouped[action.cat].push(action.title);
  });

  let html = `
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        :root{
          --background_color:#fbfcf8;
          --surface_color:#ffffff;
          --surface_soft_color:#f5f7f3;
          --text_color:#0f1511;
          --muted_color:#5c6761;
          --border_color:rgba(15, 21, 17, 0.12);
          --border_strong_color:rgba(15, 21, 17, 0.22);
          --accent_color:#99ff99;
          --accent_soft_color:rgba(153, 255, 153, 0.18);
          --accent_ink_color:#103010;
          --font_family:"Lato", system-ui, sans-serif;
          --radius_md:12px;
          --shadow_soft:0 16px 40px rgba(0, 0, 0, 0.06);
        }
        *{box-sizing:border-box;}
        body{
          margin:0;
          font-family:var(--font_family);
          padding:24px;
          color:var(--text_color);
          background:
            radial-gradient(circle at top left, var(--accent_soft_color), transparent 35%),
            radial-gradient(circle at top right, var(--accent_soft_color), transparent 30%),
            var(--background_color);
        }
        .cover{
          min-height:calc(100vh - 48px);
          display:flex;
          align-items:center;
          justify-content:center;
          page-break-after:always;
          margin-bottom:24px;
        }
        .cover-panel{
          width:min(100%, 1180px);
          min-height:calc(100vh - 140px);
          padding:56px;
          border-radius:28px;
          background:var(--accent_color);
          color:var(--accent_ink_color);
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:36px;
          text-align:center;
          box-shadow:var(--shadow_soft);
        }
        .cover-panel img{
          width:min(76vw, 620px);
          max-height:38vh;
          object-fit:contain;
        }
        .cover-panel h1{
          margin:0;
          font-size:clamp(3.2rem, 5vw, 5.6rem);
          color:var(--accent_ink_color);
        }
        .banner{
          display:flex;
          align-items:center;
          gap:24px;
          padding:16px 0 24px;
          border-bottom:1px solid var(--border_strong_color);
          margin-bottom:28px;
        }
        .cards{display:block;margin:28px 0 36px;}
        .card{
          border:1px solid var(--border_color);
          border-radius:var(--radius_md);
          padding:18px;
          background:var(--surface_color);
          box-shadow:var(--shadow_soft);
          break-inside:avoid;
          min-height:calc(100vh - 120px);
          display:flex;
          flex-direction:column;
          justify-content:center;
          page-break-after:always;
          margin-bottom:24px;
        }
        .card img{
          display:block;
          width:100%;
          height:calc(100vh - 220px);
          min-height:900px;
          object-fit:contain;
        }
        h2{color:var(--text_color);margin:0 0 16px;}
        .cat{
          margin-top:18px;
          padding:14px 16px;
          background:var(--surface_soft_color);
          border:1px solid var(--border_color);
          border-radius:var(--radius_md);
          break-inside:avoid;
        }
        .cat strong{
          display:block;
          margin-bottom:8px;
          color:var(--accent_ink_color);
        }
        .cat ul{margin:0;padding-left:20px;}
        .cat li{margin-bottom:6px;color:var(--muted_color);}
        .section-rule{
          width:64px;
          height:4px;
          border-radius:999px;
          background:var(--accent_color);
          margin:0 0 18px;
        }
        @media print{
          body{padding:16px;}
          .cover{
            min-height:calc(100vh - 32px);
            margin-bottom:0;
          }
          .cover-panel{
            width:100%;
            min-height:calc(100vh - 64px);
            padding:40px;
            border-radius:24px;
          }
          .card{
            min-height:calc(100vh - 64px);
            margin-bottom:0;
          }
          .card img{
            height:calc(100vh - 180px);
            min-height:0;
          }
        }
      </style>
    </head>
    <body>
      <div class="cover">
        <div class="cover-panel">
          <img src="${assets.logo}" alt="Logo Akteo">
          <h1>Atelier ClimAdapt</h1>
        </div>
      </div>

      <div class="cards">
        <div class="card">
          <img src="${assets.riskCard}" alt="Fiche calcul risque">
        </div>
        <div class="card">
          <img src="${assets.adaptationPathCard}" alt="Fiche chemin adaptation">
        </div>
        <div class="card">
          <img src="${assets.bestPracticesCard}" alt="Fiche bonnes pratiques">
        </div>
      </div>

      <div class="section-rule"></div>
      <h2>Actions selectionnées</h2>
  `;

  Object.keys(grouped).forEach((category) => {
    html += `<div class="cat"><strong>${category}</strong><ul>`;
    grouped[category].forEach((title) => {
      html += `<li>${title}</li>`;
    });
    html += `</ul></div>`;
  });

  html += `</body></html>`;

  const win = window.open("", "", "width=900,height=700");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.print();
  }
}

exportPDF = exportPDFEnhanced;

try {
  chartCardPinned = window.localStorage.getItem(CHART_PIN_STORAGE_KEY) === "1";
} catch (error) {
  chartCardPinned = false;
}

document.getElementById("chartPinToggle")?.addEventListener("click", toggleChartPin);

window.setMode = setMode;
window.startWorkshop = startWorkshop;
window.resetGame = resetGame;
window.exportPDF = exportPDF;
