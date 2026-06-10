const STORAGE_KEY = "evercam-saved-camera-ids";
const LOOKUP_HISTORY_KEY = "evercam-lookup-history";
const REMEMBERED_USERNAME_KEY = "evercam-remembered-username";
const REMEMBERED_PASSWORD_KEY = "evercam-remembered-password";
const LOCAL_FEED_STORAGE_KEY = "evercam-local-feed-settings";
const MAX_SAVED = 8;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // PWA support is helpful but should never block the installer workflow.
    });
  });
}

const lookupForm = document.getElementById("lookup-form");
const lookupInput = document.getElementById("lookup-id");
const lookupSuggestions = document.getElementById("lookup-suggestions");
const authUsernameInput = document.getElementById("auth-username");
const authPasswordInput = document.getElementById("auth-password");
const rememberLoginInput = document.getElementById("remember-login");
const savedCameras = document.getElementById("saved-cameras");
const clearHistoryButton = document.getElementById("clear-history");
const clearLoginButton = document.getElementById("clear-login");
const refreshButton = document.getElementById("refresh-button");
const saveSnapshotJobButton = document.getElementById("save-snapshot-job");
const prevCameraButton = document.getElementById("prev-camera-button");
const nextCameraButton = document.getElementById("next-camera-button");
const overlayPrevCameraButton = document.getElementById("overlay-prev-camera-button");
const overlayNextCameraButton = document.getElementById("overlay-next-camera-button");
const snapshotTabButton = document.getElementById("snapshot-tab");
const liveTabButton = document.getElementById("live-tab");
const localTabButton = document.getElementById("local-tab");
const viewerPanel = document.querySelector(".viewer-panel");
const viewerTitle = document.getElementById("viewer-title");
const snapshotPanel = document.getElementById("snapshot-panel");
const livePanel = document.getElementById("live-panel");
const localPanel = document.getElementById("local-panel");
const statusText = document.getElementById("status");
const currentCameraText = document.getElementById("current-camera");
const snapshotImage = document.getElementById("snapshot-image");
const snapshotPlaceholder = document.getElementById("snapshot-placeholder");
const liveVideo = document.getElementById("live-video");
const livePlaceholder = document.getElementById("live-placeholder");
const localIpInput = document.getElementById("local-ip");
const localPortInput = document.getElementById("local-port");
const cameraBrandSelect = document.getElementById("camera-brand");
const openLocalCameraButton = document.getElementById("open-local-camera");
const resetLocalDefaultsButton = document.getElementById("reset-local-defaults");
const localUrlText = document.getElementById("local-url");
const localHelpText = document.getElementById("local-help");
const lookupStatusText = document.getElementById("lookup-status");
const jobResult = document.getElementById("job-result");
const jobNameText = document.getElementById("job-name");
const jobMetaText = document.getElementById("job-meta");
const jobWorksheetLink = document.getElementById("job-worksheet-link");
const jobCameras = document.getElementById("job-cameras");
const jobNotePanel = document.getElementById("job-note-panel");
const jobNoteContent = document.getElementById("job-note-content");
const jobNoteCamera = document.getElementById("job-note-camera");
const jobNoteImages = document.getElementById("job-note-images");
const jobNoteFiles = document.getElementById("job-note-files");
const jobNoteStatus = document.getElementById("job-note-status");
const saveJobNoteButton = document.getElementById("save-job-note");
const adminSnapshotTools = document.getElementById("admin-snapshot-tools");
const adminSnapshotLink = document.getElementById("admin-snapshot-link");

let currentCameraId = "";
let currentCameraName = "";
let currentObjectUrl = "";
let currentTab = "snapshot";
let hlsPlayer = null;
let currentJob = null;
let sessionAuthToken = "";
let currentCameraCollection = [];
let currentCameraMeta = null;
let selectedJobFiles = [];
let currentSnapshotBlob = null;

function scrollViewerIntoView() {
  if (!viewerPanel) {
    return;
  }

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  window.requestAnimationFrame(() => {
    viewerPanel.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start"
    });
  });
}

function getSavedCameraIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function setSavedCameraIds(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

function getLookupHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOOKUP_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function setLookupHistory(items) {
  localStorage.setItem(LOOKUP_HISTORY_KEY, JSON.stringify(items));
}

function getRememberedUsername() {
  return localStorage.getItem(REMEMBERED_USERNAME_KEY) || "";
}

function setRememberedUsername(username) {
  if (!username) {
    localStorage.removeItem(REMEMBERED_USERNAME_KEY);
    return;
  }
  localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
}

function getRememberedPassword() {
  return localStorage.getItem(REMEMBERED_PASSWORD_KEY) || "";
}

function setRememberedPassword(password) {
  if (!password) {
    localStorage.removeItem(REMEMBERED_PASSWORD_KEY);
    return;
  }
  localStorage.setItem(REMEMBERED_PASSWORD_KEY, password);
}

function getLocalFeedSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_FEED_STORAGE_KEY) || "{}");
    return {
      ip: parsed.ip || "192.168.8.101",
      port: parsed.port || "80",
      brand: parsed.brand || "auto"
    };
  } catch {
    return { ip: "192.168.8.101", port: "80", brand: "auto" };
  }
}

function setLocalFeedSettings(settings) {
  localStorage.setItem(LOCAL_FEED_STORAGE_KEY, JSON.stringify(settings));
}

function rememberLookupValue(value) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return;

  const next = [normalized, ...getLookupHistory().filter((item) => item !== normalized)].slice(0, 12);
  setLookupHistory(next);
}

function rememberCameraId(cameraId) {
  const normalized = cameraId.trim().toLowerCase();
  if (!normalized) return;

  const next = [normalized, ...getSavedCameraIds().filter((id) => id !== normalized)].slice(0, MAX_SAVED);
  setSavedCameraIds(next);
  renderSavedCameraIds();
}

function removeCameraId(cameraId) {
  const next = getSavedCameraIds().filter((id) => id !== cameraId);
  setSavedCameraIds(next);
  renderSavedCameraIds();
}

function renderSavedCameraIds() {
  const ids = getSavedCameraIds();
  savedCameras.innerHTML = "";
  clearHistoryButton.disabled = ids.length === 0;

  if (ids.length === 0) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "No saved camera IDs yet.";
    savedCameras.appendChild(empty);
    return;
  }

  ids.forEach((cameraId) => {
    const chip = document.createElement("div");
    chip.className = "saved-camera";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "saved-camera-load";
    loadButton.textContent = cameraId;
    loadButton.addEventListener("click", () => {
      loadCurrentView(cameraId, {
        preserveSummary: !jobResult.hidden,
        preserveLookupValue: lookupInput.value
      });
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "saved-camera-remove";
    removeButton.textContent = "x";
    removeButton.setAttribute("aria-label", `Remove ${cameraId}`);
    removeButton.addEventListener("click", () => removeCameraId(cameraId));

    chip.append(loadButton, removeButton);
    savedCameras.appendChild(chip);
  });
}

function setStatus(message, tone = "") {
  statusText.textContent = message;
  statusText.className = `status${tone ? ` ${tone}` : ""}`;
}

function setLookupStatus(message, tone = "") {
  lookupStatusText.textContent = message;
  lookupStatusText.className = `helper-text${tone ? ` ${tone}` : ""}`;
}

function setJobNoteStatus(message, tone = "") {
  jobNoteStatus.textContent = message;
  jobNoteStatus.className = `helper-text${tone ? ` ${tone}` : ""}`;
}

function canAddJobNotes(job) {
  return String(job?.status || "").trim().toLowerCase() === "scheduled";
}

function setLookupStatusHtml(message, tone = "") {
  lookupStatusText.innerHTML = message;
  lookupStatusText.className = `helper-text${tone ? ` ${tone}` : ""}`;
}

function setProjectAccessRequiredMessage() {
  setLookupStatusHtml(
    'Project found, but <span class="lookup-emphasis">your user does not have access to this project or its cameras</span>. Sign in with a user who does.',
    "error"
  );
}

function updateCurrentCameraText(cameraId = currentCameraId, cameraName = currentCameraName) {
  const normalizedId = (cameraId || "").trim().toLowerCase();
  const friendlyName = (cameraName || "").trim();

  if (!normalizedId) {
    currentCameraText.textContent = "No camera selected yet.";
    return;
  }

  currentCameraText.textContent = friendlyName
    ? `Current camera: ${friendlyName} (${normalizedId})`
    : `Current camera: ${normalizedId}`;
  updateCameraNavigation();
}

function getCameraDisplayName(camera) {
  const candidate = camera?.name
    || camera?.cameraName
    || camera?.Camera_Name
    || camera?.label
    || "";
  return String(candidate || "").trim();
}

function setCurrentCameraCollection(cameras = []) {
  currentCameraCollection = Array.isArray(cameras)
    ? cameras
        .map((camera) => ({
          id: (camera.id || "").trim().toLowerCase(),
          name: getCameraDisplayName(camera)
        }))
        .filter((camera) => camera.id)
    : [];
  updateCameraNavigation();
}

function updateCameraCollectionName(cameraId, cameraName) {
  const normalizedId = String(cameraId || "").trim().toLowerCase();
  const displayName = String(cameraName || "").trim();
  if (!normalizedId || !displayName || !currentCameraCollection.length) {
    return;
  }

  let changed = false;
  currentCameraCollection = currentCameraCollection.map((camera) => {
    if (camera.id !== normalizedId || camera.name === displayName) {
      return camera;
    }
    changed = true;
    return { ...camera, name: displayName };
  });

  if (changed && !jobResult.hidden) {
    renderCameraSelection(currentCameraCollection, currentCameraId);
  }
}


function updateCameraNavigation() {
  const currentIndex = currentCameraCollection.findIndex((camera) => camera.id === currentCameraId);
  const showNavigation = currentCameraCollection.length > 1 && currentIndex !== -1;
  const showOverlayNavigation = showNavigation && currentTab === "snapshot";

  prevCameraButton.hidden = !showNavigation;
  nextCameraButton.hidden = !showNavigation;
  overlayPrevCameraButton.hidden = !showOverlayNavigation;
  overlayNextCameraButton.hidden = !showOverlayNavigation;

  if (!showNavigation) {
    prevCameraButton.disabled = true;
    nextCameraButton.disabled = true;
    overlayPrevCameraButton.disabled = true;
    overlayNextCameraButton.disabled = true;
    return;
  }

  prevCameraButton.disabled = currentIndex <= 0;
  nextCameraButton.disabled = currentIndex >= currentCameraCollection.length - 1;
  overlayPrevCameraButton.disabled = currentIndex <= 0;
  overlayNextCameraButton.disabled = currentIndex >= currentCameraCollection.length - 1;
}

function updateSaveSnapshotJobButton() {
  const canSaveSnapshot = Boolean(
    currentTab === "snapshot" &&
    currentJob?.id &&
    canAddJobNotes(currentJob) &&
    currentSnapshotBlob &&
    currentCameraId
  );

  saveSnapshotJobButton.hidden = !canSaveSnapshot;
  saveSnapshotJobButton.disabled = !canSaveSnapshot;
}

function getJobFileKey(file) {
  return [file.name, file.size, file.lastModified].join("::");
}

function appendSelectedJobFiles(files) {
  const nextFiles = Array.isArray(files) ? files : Array.from(files || []);
  const seen = new Set(selectedJobFiles.map((entry) => getJobFileKey(entry.file)));

  nextFiles.forEach((file) => {
    const key = getJobFileKey(file);
    if (!seen.has(key)) {
      selectedJobFiles.push({ file });
      seen.add(key);
    }
  });
}

function renderSelectedJobFiles() {
  const files = selectedJobFiles;
  jobNoteFiles.textContent = files.length
    ? `${files.length} photo${files.length === 1 ? "" : "s"} selected: ${files.map((entry, index) => `install photo ${String(index + 1).padStart(2, "0")}${getPreferredImageExtension(entry.file)}`).join(", ")}`
    : "No photos selected.";
}

function getSnapshotTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getSnapshotFilenameTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + `-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function getSafeFilenamePart(value) {
  return String(value || "camera")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "camera";
}

function resetJobNoteForm() {
  jobNoteContent.value = "";
  selectedJobFiles = [];
  jobNoteCamera.value = "";
  jobNoteImages.value = "";
  renderSelectedJobFiles();
  setJobNoteStatus("");
}

function showJobNotePanel() {
  jobNotePanel.hidden = false;
  renderSelectedJobFiles();
}

function hideJobNotePanel() {
  jobNotePanel.hidden = true;
  resetJobNoteForm();
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function getPreferredImageExtension(file) {
  const type = String(file?.type || "").toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  return ".jpg";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not process image."));
    image.src = src;
  });
}

async function prepareJobImageForUpload(file, index) {
  const uploadName = `install photo ${String(index + 1).padStart(2, "0")}.jpg`;

  if (!String(file?.type || "").startsWith("image/")) {
    return {
      name: uploadName,
      type: file?.type || "application/octet-stream",
      contentBase64: await fileToBase64(file)
    };
  }

  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(dataUrl);
  const maxDimension = 1800;
  let { width, height } = image;

  if (width > maxDimension || height > maxDimension) {
    const scale = Math.min(maxDimension / width, maxDimension / height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);

  const compressedBlob = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not compress image."));
        return;
      }
      resolve(blob);
    }, "image/jpeg", 0.82);
  });

  return {
    name: uploadName,
    type: "image/jpeg",
    contentBase64: await fileToBase64(compressedBlob)
  };
}

function navigateCamera(direction) {
  const currentIndex = currentCameraCollection.findIndex((camera) => camera.id === currentCameraId);
  if (currentIndex === -1) {
    return;
  }

  const target = currentCameraCollection[currentIndex + direction];
  if (!target) {
    return;
  }

  currentCameraName = target.name || "";
  updateCurrentCameraText(target.id, currentCameraName);
  loadCurrentView(target.id, {
    preserveSummary: !jobResult.hidden,
    preserveLookupValue: lookupInput.value,
    preserveCameraName: true
  });
}

function hideLookupSuggestions() {
  lookupSuggestions.hidden = true;
  lookupSuggestions.innerHTML = "";
}

function renderLookupSuggestions(query) {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 3) {
    hideLookupSuggestions();
    return;
  }

  const matches = getLookupHistory()
    .filter((item) => item.startsWith(normalized) && item !== normalized)
    .slice(0, 6);

  if (!matches.length) {
    hideLookupSuggestions();
    return;
  }

  lookupSuggestions.innerHTML = "";
  matches.forEach((match) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lookup-suggestion";
    button.textContent = match;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      lookupInput.value = match;
      hideLookupSuggestions();
      lookupInput.focus();
      const length = match.length;
      lookupInput.setSelectionRange(length, length);
    });
    lookupSuggestions.appendChild(button);
  });

  lookupSuggestions.hidden = false;
}

function buildSnapshotUrl(cameraId) {
  const encodedId = encodeURIComponent(cameraId.toLowerCase());
  return `https://media.evercam.io/v2/cameras/${encodedId}/live/snapshot?t=${Date.now()}`;
}

function buildHlsUrl(cameraId) {
  const encodedId = encodeURIComponent(cameraId.toLowerCase());
  return `https://media.evercam.io/v2/cameras/${encodedId}/hls?t=${Date.now()}`;
}

function buildCameraDetailsUrl(cameraId) {
  const encodedId = encodeURIComponent(cameraId.toLowerCase());
  return `https://media.evercam.io/v2/cameras/${encodedId}`;
}

function buildProjectCamerasUrl(projectId) {
  const encodedId = encodeURIComponent(projectId.toLowerCase());
  return `https://media.evercam.io/v2/projects/${encodedId}/cameras`;
}

function buildAdminSnapshotUrl(camera) {
  if (!camera?.nvr_host || !camera?.model) {
    return "";
  }

  const model = String(camera.model).toLowerCase();
  const host = `192-168-8-101-${camera.nvr_host}`;
  const auth = "admin:Mehcam4Mehcam";

  if (model.includes("hikvision")) {
    return `https://${auth}@${host}/ISAPI/Streaming/channels/101/picture`;
  }

  if (model.includes("milesight")) {
    return `https://${auth}@${host}/snapshot.cgi`;
  }

  return "";
}

function updateAdminSnapshotUi(camera = currentCameraMeta) {
  const adminUrl = buildAdminSnapshotUrl(camera);
  adminSnapshotTools.hidden = !adminUrl;

  if (!adminUrl) {
    adminSnapshotLink.hidden = true;
    adminSnapshotLink.removeAttribute("href");
    return;
  }

  adminSnapshotLink.href = adminUrl;
  adminSnapshotLink.hidden = false;
}

function applyCameraMetadata(camera) {
  if (!camera) {
    return;
  }

  currentCameraMeta = camera;
  currentCameraName = getCameraDisplayName(camera) || currentCameraName;
  updateCameraCollectionName(camera.id || currentCameraId, currentCameraName);
  updateCurrentCameraText(camera.id || currentCameraId, currentCameraName);
  updateAdminSnapshotUi(camera);
}

function getCameraStateSummary(camera) {
  if (!camera) {
    return "";
  }

  const parts = [];
  const status = camera.status || camera.State || "";
  const offlineReason = camera.offline_reason || camera.offlineReason || "";
  const lastOnline = camera.last_online_at || camera.lastOnlineAt || "";

  if (status) {
    parts.push(`Status: ${status}`);
  }

  if (offlineReason) {
    parts.push(`Reason: ${offlineReason}`);
  }

  if (lastOnline) {
    parts.push(`Last online: ${lastOnline}`);
  }

  return parts.join(" | ");
}

function getSnapshotFailureMessage(statusCode, camera) {
  if (statusCode === 401) {
    return "Login failed or session expired. Please sign in again.";
  }

  if (statusCode === 400) {
    return "Camera found, but Evercam cannot return a live snapshot while this camera is in its current status.";
  }

  if (statusCode === 403) {
    return "Camera found, but your user does not have viewer access to this camera.";
  }

  const stateSummary = getCameraStateSummary(camera);
  if (camera) {
    return stateSummary
      ? `Camera found, but the snapshot is not available right now. ${stateSummary}`
      : "Camera found, but the snapshot is not available right now.";
  }

  return authUsernameInput.value.trim()
    ? "Could not load that camera. Check the camera ID, camera access, or browser restrictions."
    : "Could not load that camera. It may be private, unavailable, or the ID may be incorrect.";
}

async function readResponseBlobWithProgress(response, onProgress) {
  if (!response.body || typeof response.body.getReader !== "function") {
    onProgress?.(null);
    return response.blob();
  }

  const totalBytes = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedBytes += value.length;
      onProgress?.(totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : null);
    }
  }

  return new Blob(chunks, {
    type: response.headers.get("content-type") || "image/jpeg"
  });
}

function buildLocalCameraUrl() {
  const ip = localIpInput.value.trim() || "192.168.8.101";
  const port = localPortInput.value.trim() || "80";
  return `http://${ip}:${port}`;
}

function updateLocalFeedUi() {
  const brand = cameraBrandSelect.value;
  const localUrl = buildLocalCameraUrl();
  localUrlText.textContent = `Local address: ${localUrl}`;

  const brandHint = brand === "hikvision"
    ? "Likely Hikvision. Opening the local web interface should prompt for the camera login."
    : brand === "milesight"
      ? "Likely Milesight. Opening the local web interface should prompt for the camera login."
      : "Open the local web interface and log in on the camera LAN if prompted.";

  localHelpText.textContent = `${brandHint} Hosted web apps usually cannot auto-scan your local network, so direct browser detection is limited.`;

  setLocalFeedSettings({
    ip: localIpInput.value.trim() || "192.168.8.101",
    port: localPortInput.value.trim() || "80",
    brand
  });
}

async function getAuthHeaders() {
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value;

  if (!username || !password) {
    sessionAuthToken = "";
    return {};
  }

  if (rememberLoginInput.checked) {
    setRememberedUsername(username);
    setRememberedPassword(password);
  } else {
    setRememberedUsername("");
    setRememberedPassword("");
  }

  const loginResponse = await fetch("https://media.evercam.io/v2/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (!loginResponse.ok) {
    let message = "Evercam login failed.";
    try {
      const errorJson = await loginResponse.json();
      message = errorJson.message || errorJson.error || message;
    } catch {
      // Ignore JSON parsing errors and keep generic message.
    }
    throw new Error(message);
  }

  const loginJson = await loginResponse.json();
  const loginToken = loginJson.token;
  if (!loginToken) {
    throw new Error("Evercam login succeeded but no token was returned.");
  }

  sessionAuthToken = loginToken;

  if (rememberLoginInput.checked && window.PasswordCredential && navigator.credentials?.store) {
    try {
      const credential = new window.PasswordCredential({
        id: username,
        password,
        name: username
      });
      await navigator.credentials.store(credential);
    } catch {
      // Ignore browser credential storage failures and continue with login.
    }
  }

  return { Authorization: `Bearer ${sessionAuthToken}` };
}

function getCurrentAuthToken() {
  return sessionAuthToken || "";
}

function renderCameraSelection(cameras, selectedCameraId = "") {
  jobCameras.innerHTML = "";

  if (!cameras.length) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "No cameras found.";
    jobCameras.appendChild(empty);
    return;
  }

  cameras.forEach((camera) => {
    const chip = document.createElement("div");
    chip.className = "saved-camera";

    const loadButton = document.createElement("button");
    loadButton.type = "button";
    loadButton.className = "saved-camera-load";
    const displayName = getCameraDisplayName(camera) || camera.id;
    loadButton.textContent = displayName;
    loadButton.title = displayName !== camera.id
      ? `${displayName} (${camera.id})`
      : camera.id;
    loadButton.setAttribute(
      "aria-label",
      displayName !== camera.id ? `Load ${displayName}` : `Load ${camera.id}`
    );
    if (selectedCameraId && camera.id === selectedCameraId) {
      loadButton.setAttribute("aria-current", "true");
    }
    loadButton.addEventListener("click", () => {
      loadCurrentView(camera.id, {
        preserveSummary: true,
        preserveLookupValue: lookupInput.value.trim().toLowerCase(),
        preserveCameraName: true
      });
    });

    chip.append(loadButton);
    jobCameras.appendChild(chip);
  });
}

function renderJobResult(job, selectedCameraId = "") {
  currentJob = job;
  jobResult.hidden = false;
  jobNameText.textContent = `${job.jobNumber} - ${job.name}`;

  const meta = [];
  if (job.projectName) meta.push(`Project: ${job.projectName}`);
  if (job.installDate) meta.push(`Install: ${job.installDate}`);
  jobMetaText.textContent = meta.join(" | ");

  if (job.worksheetUrl) {
    jobWorksheetLink.href = job.worksheetUrl;
    jobWorksheetLink.hidden = false;
  } else {
    jobWorksheetLink.hidden = true;
    jobWorksheetLink.removeAttribute("href");
  }

  renderCameraSelection(job.cameras, selectedCameraId);
  if (canAddJobNotes(job)) {
    showJobNotePanel();
  } else {
    hideJobNotePanel();
  }
}

function renderProjectResult(projectId, cameras, selectedCameraId = "") {
  currentJob = null;
  jobResult.hidden = false;
  jobResult.classList.toggle("project-emphasis", cameras.length > 1);
  jobNameText.textContent = cameras[0]?.projectName || projectId;
  jobMetaText.textContent = cameras.length > 1
    ? `${cameras.length} cameras found for this project. The first snapshot has been loaded automatically.`
    : "1 camera found for this project.";
  jobWorksheetLink.hidden = true;
  jobWorksheetLink.removeAttribute("href");
  renderCameraSelection(cameras, selectedCameraId);
  hideJobNotePanel();
}

function hideJobResult() {
  currentJob = null;
  jobResult.hidden = true;
  jobResult.classList.remove("project-emphasis");
  jobNameText.textContent = "";
  jobMetaText.textContent = "";
  jobWorksheetLink.hidden = true;
  jobWorksheetLink.removeAttribute("href");
  jobCameras.innerHTML = "";
  hideJobNotePanel();
  setCurrentCameraCollection([]);
  currentSnapshotBlob = null;
  updateSaveSnapshotJobButton();
}

function looksLikeProjectId(value) {
  return /^[a-z0-9]{5}-[a-z0-9]{5}$/i.test(value.trim());
}

function cleanupObjectUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = "";
  }
}

function cleanupHls() {
  if (hlsPlayer) {
    hlsPlayer.destroy();
    hlsPlayer = null;
  }

  liveVideo.pause();
  liveVideo.removeAttribute("src");
  liveVideo.load();
}

function switchTab(tab, options = {}) {
  currentTab = tab;
  const isSnapshot = tab === "snapshot";
  const isLive = tab === "live";
  const isLocal = tab === "local";

  snapshotTabButton.classList.toggle("active", isSnapshot);
  liveTabButton.classList.toggle("active", isLive);
  localTabButton.classList.toggle("active", isLocal);
  snapshotTabButton.setAttribute("aria-selected", String(isSnapshot));
  liveTabButton.setAttribute("aria-selected", String(isLive));
  localTabButton.setAttribute("aria-selected", String(isLocal));
  snapshotPanel.hidden = !isSnapshot;
  livePanel.hidden = !isLive;
  localPanel.hidden = !isLocal;
  viewerTitle.textContent = isSnapshot ? "Live Snapshot" : isLive ? "Live Feed" : "Local Feed";
  refreshButton.textContent = isSnapshot ? "Refresh Snapshot" : isLive ? "Refresh Live Feed" : "Refresh Local Feed";
  setStatus(
    currentCameraId
      ? isSnapshot
        ? "Ready to refresh the latest snapshot."
        : isLive
          ? "Ready to load the live feed."
          : "Ready to open the local camera feed."
      : isSnapshot
        ? "Enter a camera ID to load a snapshot."
        : isLive
          ? "Enter a camera ID to load a live feed."
          : "Enter a camera ID to prepare the local feed."
  );

  if (currentCameraId && !isLocal && !options.suppressLoad) {
    loadCurrentView(currentCameraId, {
      preserveSummary: !jobResult.hidden,
      preserveLookupValue: lookupInput.value
    });
  }

  if (isLocal) {
    updateLocalFeedUi();
  }

  updateSaveSnapshotJobButton();
}

async function loadSnapshot(cameraId, options = {}) {
  const normalized = cameraId.trim().toLowerCase();
  if (!normalized) {
    setStatus("Enter a camera ID first.", "error");
    return;
  }

  currentCameraId = normalized;
  currentSnapshotBlob = null;
  updateSaveSnapshotJobButton();
  if (!options.preserveCameraName) {
    currentCameraName = "";
  }
  currentCameraMeta = null;
  updateAdminSnapshotUi(null);
  if (!options.preserveSummary) {
    hideJobResult();
  }
  if (options.preserveLookupValue) {
    lookupInput.value = options.preserveLookupValue;
  } else {
    lookupInput.value = normalized;
  }
  refreshButton.disabled = false;
  updateCurrentCameraText(normalized);
  setStatus("Loading snapshot...", "");
  rememberCameraId(normalized);

  snapshotImage.hidden = true;
  snapshotPlaceholder.hidden = false;
  snapshotPlaceholder.textContent = "Loading latest snapshot...";
  scrollViewerIntoView();

  cleanupObjectUrl();
  cleanupHls();

  try {
    const headers = await getAuthHeaders();
    try {
      const detailsResponse = await fetch(buildCameraDetailsUrl(normalized), { headers });
      if (detailsResponse.ok) {
        const detailsJson = await detailsResponse.json();
        const camera = Array.isArray(detailsJson.cameras) ? detailsJson.cameras[0] : null;
        applyCameraMetadata(camera);
      }
    } catch {
      // Ignore metadata lookup failures and continue trying the snapshot itself.
    }

    const response = await fetch(buildSnapshotUrl(normalized), {
      headers
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }

    setStatus("Success. Snapshot is loading in the background...", "success");
    snapshotPlaceholder.textContent = "Snapshot found. Downloading image...";

    const blob = await readResponseBlobWithProgress(response, (percent) => {
      if (percent === null) {
        setStatus("Success. Snapshot is loading in the background...", "success");
        snapshotPlaceholder.textContent = "Snapshot found. Downloading image...";
        return;
      }

      setStatus(`Success. Snapshot is loading in the background... ${percent}%`, "success");
      snapshotPlaceholder.textContent = `Downloading snapshot... ${percent}%`;
    });

    currentSnapshotBlob = blob;
    currentObjectUrl = URL.createObjectURL(blob);
    snapshotImage.src = currentObjectUrl;
    snapshotImage.alt = `Live snapshot for ${normalized}`;
    snapshotImage.hidden = false;
    snapshotPlaceholder.hidden = true;
    setStatus("Snapshot loaded.", "success");
    updateSaveSnapshotJobButton();
  } catch (error) {
    currentSnapshotBlob = null;
    updateSaveSnapshotJobButton();
    const message = getSnapshotFailureMessage(error.statusCode, currentCameraMeta);
    setStatus(message, "error");
    snapshotImage.hidden = true;
    snapshotPlaceholder.hidden = false;
    snapshotPlaceholder.textContent = "Snapshot unavailable for this camera ID.";
  }
}

async function loadLiveFeed(cameraId, options = {}) {
  const normalized = cameraId.trim().toLowerCase();
  if (!normalized) {
    setStatus("Enter a camera ID first.", "error");
    return;
  }

  currentCameraId = normalized;
  currentSnapshotBlob = null;
  updateSaveSnapshotJobButton();
  if (!options.preserveCameraName) {
    currentCameraName = "";
  }
  currentCameraMeta = null;
  updateAdminSnapshotUi(null);
  if (!options.preserveSummary) {
    hideJobResult();
  }
  if (options.preserveLookupValue) {
    lookupInput.value = options.preserveLookupValue;
  } else {
    lookupInput.value = normalized;
  }
  refreshButton.disabled = false;
  updateCurrentCameraText(normalized);
  setStatus("Loading live feed...", "");
  rememberCameraId(normalized);

  snapshotImage.hidden = true;
  snapshotPlaceholder.hidden = false;
  snapshotPlaceholder.textContent = "Snapshot will appear here.";
  liveVideo.hidden = true;
  livePlaceholder.hidden = false;
  livePlaceholder.textContent = "Connecting to live feed...";
  scrollViewerIntoView();

  cleanupObjectUrl();
  cleanupHls();

  try {
    const headers = await getAuthHeaders();
    const token = getCurrentAuthToken();
    const detailsResponse = await fetch(buildCameraDetailsUrl(normalized), {
      headers
    });

    if (!detailsResponse.ok) {
      throw new Error(`HTTP ${detailsResponse.status}`);
    }

      const detailsJson = await detailsResponse.json();
      const camera = Array.isArray(detailsJson.cameras) ? detailsJson.cameras[0] : null;
      applyCameraMetadata(camera);
      const hlsUrl = camera?.proxy_url?.hls || buildHlsUrl(normalized);

    if (window.Hls && window.Hls.isSupported()) {
      hlsPlayer = new window.Hls({
        xhrSetup: (xhr) => {
          if (token) {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          }
        }
      });
      hlsPlayer.loadSource(hlsUrl);
      hlsPlayer.attachMedia(liveVideo);
      hlsPlayer.on(window.Hls.Events.MANIFEST_PARSED, () => {
        liveVideo.hidden = false;
        livePlaceholder.hidden = true;
        liveVideo.play().catch(() => {});
        setStatus("Live feed loaded.", "success");
      });
      hlsPlayer.on(window.Hls.Events.ERROR, (_event, data) => {
        if (data && data.fatal) {
          cleanupHls();
          liveVideo.hidden = true;
          livePlaceholder.hidden = false;
          livePlaceholder.textContent = "Live feed unavailable for this camera ID.";
          setStatus("Could not load the live feed. Check camera support, token access, or browser restrictions.", "error");
        }
      });
      return;
    }

    if (liveVideo.canPlayType("application/vnd.apple.mpegurl")) {
      liveVideo.src = hlsUrl;
      liveVideo.hidden = false;
      livePlaceholder.hidden = true;
      liveVideo.addEventListener("loadedmetadata", () => {
        liveVideo.play().catch(() => {});
      }, { once: true });
      setStatus(token
        ? "Live feed may require browser support for bearer-authenticated HLS."
        : "Live feed loaded.", token ? "error" : "success");
      return;
    }

    throw new Error("HLS unsupported");
  } catch (error) {
    cleanupHls();
    liveVideo.hidden = true;
    livePlaceholder.hidden = false;
    livePlaceholder.textContent = "Live feed unavailable for this camera ID.";
    setStatus("Could not load the live feed. This camera may not support HLS, or the browser may block it.", "error");
  }
}

function loadCurrentView(cameraId, options = {}) {
  const normalized = cameraId.trim().toLowerCase();
  if (currentTab === "live") {
    return loadLiveFeed(normalized, options);
  }

  if (currentTab === "local") {
    currentCameraId = normalized;
    if (!options.preserveSummary) {
      hideJobResult();
    }
    if (options.preserveLookupValue) {
      lookupInput.value = options.preserveLookupValue;
      } else {
        lookupInput.value = currentCameraId;
      }
      updateCurrentCameraText(currentCameraId);
      rememberCameraId(currentCameraId);
    updateLocalFeedUi();
    setStatus("Ready to open the local camera feed on the onsite network.", "success");
    return;
  }

  return loadSnapshot(normalized, options);
}
refreshButton.addEventListener("click", () => {
  if (currentCameraId) {
    loadCurrentView(currentCameraId, {
      preserveSummary: !jobResult.hidden,
      preserveLookupValue: lookupInput.value
    });
  }
});

prevCameraButton.addEventListener("click", () => navigateCamera(-1));
nextCameraButton.addEventListener("click", () => navigateCamera(1));
overlayPrevCameraButton.addEventListener("click", () => navigateCamera(-1));
overlayNextCameraButton.addEventListener("click", () => navigateCamera(1));

snapshotImage.addEventListener("click", () => {
  if (!currentObjectUrl || snapshotImage.hidden) {
    return;
  }

  window.open(currentObjectUrl, "_blank", "noopener,noreferrer");
});

snapshotTabButton.addEventListener("click", () => switchTab("snapshot"));
liveTabButton.addEventListener("click", () => switchTab("live"));
localTabButton.addEventListener("click", () => switchTab("local"));

clearHistoryButton.addEventListener("click", () => {
  setSavedCameraIds([]);
  renderSavedCameraIds();
});

clearLoginButton.addEventListener("click", () => {
  authUsernameInput.value = "";
  authPasswordInput.value = "";
  rememberLoginInput.checked = false;
  setRememberedUsername("");
  setRememberedPassword("");
  sessionAuthToken = "";
});

jobNoteCamera.addEventListener("change", () => {
  appendSelectedJobFiles(jobNoteCamera.files);
  jobNoteCamera.value = "";
  renderSelectedJobFiles();
});

jobNoteImages.addEventListener("change", () => {
  appendSelectedJobFiles(jobNoteImages.files);
  jobNoteImages.value = "";
  renderSelectedJobFiles();
});

saveJobNoteButton.addEventListener("click", async () => {
  if (!currentJob?.id) {
    setJobNoteStatus("Find a CRM job first before saving a note.", "error");
    return;
  }

  const note = jobNoteContent.value.trim();
  const files = [...selectedJobFiles];

  if (!note && files.length === 0) {
    setJobNoteStatus("Add some note text or at least one photo before saving.", "error");
    return;
  }

  saveJobNoteButton.disabled = true;
  setJobNoteStatus("Saving note to Zoho...", "");

  try {
    const preparedFiles = await Promise.all(
      files.map((entry, index) => prepareJobImageForUpload(entry.file, index))
    );

    const payload = {
      jobRecordId: currentJob.id,
      note,
      files: preparedFiles
    };

    const response = await fetch("/api/zoho-job-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const rawText = await response.text();
    let result = {};
    try {
      result = rawText ? JSON.parse(rawText) : {};
    } catch {
      result = { error: rawText || "Unexpected server response." };
    }
    if (!response.ok) {
      throw new Error(result.error || "Could not save the job note.");
    }

    resetJobNoteForm();
    setJobNoteStatus(
      `Saved ${result.createdNotes || 0} note${result.createdNotes === 1 ? "" : "s"} and ${result.uploadedFiles || 0} photo${result.uploadedFiles === 1 ? "" : "s"} to this job.`,
      "success"
    );
  } catch (error) {
    setJobNoteStatus(error.message || "Could not save the job note.", "error");
  } finally {
    saveJobNoteButton.disabled = false;
  }
});

saveSnapshotJobButton.addEventListener("click", async () => {
  if (!currentJob?.id || !currentSnapshotBlob || !currentCameraId) {
    setStatus("Load a job snapshot before saving it to CRM.", "error");
    return;
  }

  const now = new Date();
  const cameraLabel = currentCameraName || currentCameraId;
  const note = `Snapshot of camera FoV - ${cameraLabel} - ${getSnapshotTimestamp(now)}`;
  const filename = `snapshot fov - ${getSafeFilenamePart(cameraLabel)} - ${getSnapshotFilenameTimestamp(now)}.jpg`;

  saveSnapshotJobButton.disabled = true;
  setStatus("Saving snapshot to CRM job...", "");

  try {
    const response = await fetch("/api/zoho-job-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobRecordId: currentJob.id,
        note,
        skipAttachmentSummary: true,
        files: [
          {
            name: filename,
            type: currentSnapshotBlob.type || "image/jpeg",
            contentBase64: await fileToBase64(currentSnapshotBlob)
          }
        ]
      })
    });

    const rawText = await response.text();
    let result = {};
    try {
      result = rawText ? JSON.parse(rawText) : {};
    } catch {
      result = { error: rawText || "Unexpected server response." };
    }

    if (!response.ok) {
      throw new Error(result.error || "Could not save the snapshot to CRM.");
    }

    setStatus("Snapshot saved to the CRM job.", "success");
  } catch (error) {
    setStatus(error.message || "Could not save the snapshot to CRM.", "error");
  } finally {
    updateSaveSnapshotJobButton();
  }
});

openLocalCameraButton.addEventListener("click", () => {
  const url = buildLocalCameraUrl();
  updateLocalFeedUi();
  window.open(url, "_blank", "noopener,noreferrer");
});

resetLocalDefaultsButton.addEventListener("click", () => {
  localIpInput.value = "192.168.8.101";
  localPortInput.value = "80";
  cameraBrandSelect.value = "auto";
  updateLocalFeedUi();
});

localIpInput.addEventListener("input", updateLocalFeedUi);
localPortInput.addEventListener("input", updateLocalFeedUi);
cameraBrandSelect.addEventListener("change", updateLocalFeedUi);

authUsernameInput.value = getRememberedUsername();
authPasswordInput.value = getRememberedPassword();
rememberLoginInput.checked = Boolean(authUsernameInput.value || authPasswordInput.value);
const localFeedSettings = getLocalFeedSettings();
localIpInput.value = localFeedSettings.ip;
localPortInput.value = localFeedSettings.port;
cameraBrandSelect.value = localFeedSettings.brand;
updateLocalFeedUi();
renderSavedCameraIds();
renderSelectedJobFiles();
lookupInput.addEventListener("input", () => {
  const start = lookupInput.selectionStart;
  const end = lookupInput.selectionEnd;
  const lower = lookupInput.value.toLowerCase();
  if (lookupInput.value !== lower) {
    lookupInput.value = lower;
    if (start !== null && end !== null) {
      lookupInput.setSelectionRange(start, end);
    }
  }
  renderLookupSuggestions(lookupInput.value);
});
lookupInput.addEventListener("focus", () => renderLookupSuggestions(lookupInput.value));
lookupInput.addEventListener("blur", () => {
  window.setTimeout(hideLookupSuggestions, 120);
});

async function loadProjectCameras(projectId) {
  setStatus("Loading project cameras...", "");
  hideJobResult();

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(buildProjectCamerasUrl(projectId), { headers });
    const rawText = await response.text();
    let result = {};
    try {
      result = rawText ? JSON.parse(rawText) : {};
    } catch {
      result = { message: rawText };
    }

    if (!response.ok) {
      if (response.status === 403) {
        setProjectAccessRequiredMessage();
        return;
      }
      throw new Error(result.message || result.error || rawText || "Could not load that project.");
    }

    const cameras = Array.isArray(result.cameras)
      ? result.cameras.map((camera) => ({
          id: (camera.id || camera.exid || "").toLowerCase(),
          name: camera.name || "",
          projectName: camera.project?.name || ""
        })).filter((camera) => camera.id)
      : [];

    if (!cameras.length) {
      throw new Error("No cameras found for that project.");
    }

      currentCameraId = cameras[0].id;
      currentCameraName = cameras[0].name || "";
      setCurrentCameraCollection(cameras);
      updateCurrentCameraText(currentCameraId, currentCameraName);
      refreshButton.disabled = false;

    renderProjectResult(projectId, cameras, cameras[0].id);
    setLookupStatus(`Loaded ${cameras.length} camera${cameras.length === 1 ? "" : "s"} for project ${projectId}.`, "success");
    rememberLookupValue(projectId);
    switchTab("snapshot", { suppressLoad: true });
      await loadSnapshot(cameras[0].id, {
        preserveSummary: true,
        preserveLookupValue: projectId,
        preserveCameraName: true
      });
    lookupInput.value = projectId;
  } catch (error) {
    setLookupStatus(error.message || "Could not load that project.", "error");
  }
}

async function tryLoadSingleCamera(cameraId) {
  const headers = await getAuthHeaders();
  const response = await fetch(buildCameraDetailsUrl(cameraId), { headers });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  const result = await response.json();
  const camera = Array.isArray(result.cameras) ? result.cameras[0] : null;
  if (!camera) {
    return { ok: false, status: 404 };
  }

  applyCameraMetadata(camera);
  hideJobResult();
  setCurrentCameraCollection([]);
  setLookupStatus(`Loaded camera ${cameraId}.`, "success");
  rememberLookupValue(cameraId);
  await loadCurrentView(cameraId, { preserveCameraName: true });
  lookupInput.value = cameraId;
  return { ok: true };
}

lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  const value = lookupInput.value.trim().toLowerCase();
  lookupInput.value = value;

  if (!value) {
    setLookupStatus("Enter a camera ID, project ID, or 5-digit job number.", "");
    return;
  }

  if (/^\d{5}$/.test(value)) {
    const jobId = value;
    setLookupStatus("Finding job...", "");
    hideJobResult();

    try {
      const response = await fetch(`/api/zoho-job?jobId=${encodeURIComponent(jobId)}&t=${Date.now()}`, {
        cache: "no-store"
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Job lookup failed.");
      }

        renderJobResult(result, result.cameras[0]?.id || "");
        setLookupStatus(`Loaded ${result.cameras.length} camera${result.cameras.length === 1 ? "" : "s"} for job ${result.jobNumber}.`, "success");
        rememberLookupValue(jobId);

        if (result.cameras.length) {
          currentCameraId = result.cameras[0].id;
          currentCameraName = result.cameras[0].name || "";
          setCurrentCameraCollection(result.cameras);
          updateCurrentCameraText(currentCameraId, currentCameraName);
          refreshButton.disabled = false;
        switchTab("snapshot", { suppressLoad: true });
        await loadSnapshot(result.cameras[0].id, {
          preserveSummary: true,
          preserveLookupValue: jobId,
          preserveCameraName: true
        });
        lookupInput.value = jobId;
      }
    } catch (error) {
      hideJobResult();
      const message = error.message || "Could not load that job.";
      if (message.includes("Missing Zoho environment variables")) {
        setLookupStatus("Job lookup is not configured in Vercel yet. Add the Zoho environment variables, or use a camera or project ID instead.", "error");
        return;
      }
      setLookupStatus("Invalid job number.", "error");
    }
    return;
  }

  hideJobResult();

  const cameraResult = await tryLoadSingleCamera(value);
  if (cameraResult.ok) {
    return;
  }

  if (cameraResult.status === 403) {
    setLookupStatusHtml(
      'Camera found, but <span class="lookup-emphasis">your user does not have viewer access to this camera</span>. Sign in with a user who does.',
      "error"
    );
    return;
  }

  if (cameraResult.status === 401) {
    setLookupStatus("Login failed or session expired. Please sign in again.", "error");
    return;
  }

  if (cameraResult.status === 400 && authUsernameInput.value.trim()) {
    setLookupStatus("Camera lookup failed after sign-in. Please check your login details or camera access.", "error");
    return;
  }

  if (looksLikeProjectId(value)) {
    await loadProjectCameras(value);
    return;
  }

  setLookupStatus("No camera or project found for that ID.", "");
});
