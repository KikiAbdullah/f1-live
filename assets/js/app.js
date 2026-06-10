import { replayEngine } from "../core/replay-engine.js";
import { Leaderboard } from "../ui/leaderboard.js";
import { TrackMap } from "../ui/trackmap.js";
import { Controls } from "../ui/controls.js";
import { RaceFeed } from "../ui/race-feed.js";
import { PitStopFeed } from "../ui/pit-stops.js";
import { WeatherDisplay } from "../ui/weather.js";
import { SessionSelector } from "../ui/session-selector.js";
import { telemetryService } from "../services/telemetry-service.js";
import { eventBus } from "../core/event-bus.js";
import { store } from "../core/store.js";

const byId = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

const ui = {
  loadingOverlay: byId("loading-overlay"),
  loadingStatus: byId("loading-status"),
  sessionLoader: byId("session-loader-overlay"),
  infoPanel: byId("driver-info-panel"),
  driverName: byId("telemetry-driver-name"),
  teamName: byId("telemetry-team-name"),
  avatar: byId("telemetry-driver-avatar"),
  trackName: byId("track-name"),
  sessionDate: byId("session-date"),
  sessionPhase: byId("session-phase"),
  currentLap: byId("current-lap"),
  totalLaps: byId("total-laps"),
  speed: byId("telemetry-speed"),
  rpm: byId("telemetry-rpm"),
  gear: byId("telemetry-gear"),
  drs: byId("telemetry-drs"),
  lapTime: byId("telemetry-lap-time"),
  speedPath: byId("gauge-speed-path"),
  throttlePath: byId("gauge-throttle-path"),
  brakePath: byId("gauge-brake-path"),
};

window.F1Live = { store, eventBus, telemetryService };

const components = {
  leaderboard: new Leaderboard("leaderboard"),
  trackMap: new TrackMap("track-map"),
  controls: new Controls({
    playButtonId: "play-pause",
    sliderId: "timeline-slider",
    timeDisplayId: "time-display",
    speedSelectId: "speed-select",
  }),
  raceFeed: new RaceFeed("race-feed"),
  sessionSelector: new SessionSelector("session-selector"),
  pitStopFeed: new PitStopFeed("pit-stops-feed"),
  weatherDisplay: new WeatherDisplay("weather-display"),
};

function setLoading(message, visible = true) {
  ui.loadingOverlay?.classList.toggle("hidden", !visible);
  if (message && ui.loadingStatus) ui.loadingStatus.textContent = message;
}

function updateHeaderInfo() {
  if (store.session) {
    const year = store.session.date_start
      ? new Date(store.session.date_start).getFullYear()
      : "----";
    ui.trackName.textContent = store.session.meeting_name || "F1 Replay";
    ui.sessionDate.textContent = `${year} • ${store.session.session_name || "Session"}`;
    ui.sessionPhase.textContent = (store.session.session_name || "Replay").toUpperCase();
  }

  const laps = store.raceData?.laps || [];
  const maxLap = laps.reduce(
    (highest, lap) => Math.max(highest, Number(lap.lap_number) || 0),
    0
  );
  ui.totalLaps.textContent = maxLap > 0 ? maxLap : "--";
}

function updateCurrentLap(timestamp) {
  const selectedDriver = store.ui?.selectedDriver;
  const laps = store.raceData?.laps || [];
  if (!selectedDriver || laps.length === 0 || typeof store.playback.startTime !== "number") {
    return;
  }

  const absoluteTime = store.playback.startTime + timestamp;
  let currentLap = 1;
  for (let index = laps.length - 1; index >= 0; index--) {
    const lap = laps[index];
    if (String(lap.driver_number) !== String(selectedDriver) || !lap.date_start) continue;
    if (new Date(lap.date_start).getTime() <= absoluteTime) {
      currentLap = lap.lap_number || currentLap;
      break;
    }
  }
  ui.currentLap.textContent = currentLap;
}

function selectDriver(driverNumber) {
  const normalizedDriverNumber = String(driverNumber);
  store.ui.selectedDriver = normalizedDriverNumber;
  store.setState("selectedDriver", normalizedDriverNumber);

  const driver = store.drivers.find(
    (item) => String(item.driver_number) === normalizedDriverNumber
  );
  if (!driver) return;

  // Pastikan infoPanel ditampilkan
  if (ui.infoPanel) {
    ui.infoPanel.classList.add("visible");
  }

  ui.driverName.textContent = driver.broadcast_name || driver.full_name || driver.name_acronym;
  ui.teamName.textContent = driver.team_name || "Independent";
  ui.avatar.src =
    driver.headshot_url ||
    `https://placehold.co/96x96/15151e/ffffff?text=${encodeURIComponent(
      driver.name_acronym || "F1"
    )}`;
  ui.avatar.alt = driver.full_name || driver.name_acronym || "Driver";
}

function updateTelemetry(timestamp) {
  if (!store.ui?.selectedDriver) return;

  const telemetry = telemetryService.getDriverTelemetry(
    store.ui.selectedDriver,
    timestamp
  );
  if (!telemetry) return;

  const speed = Math.round(telemetry.speed || 0);
  const rpm = Math.round(telemetry.rpm || 0);
  const throttle = clamp(Number(telemetry.throttle) || 0, 0, 100);
  const brake = clamp(Number(telemetry.brake) || 0, 0, 100);
  const isDrsActive = Number(telemetry.drs) >= 10;
  const gearValue = Math.round(Number(telemetry.n_gear) || 0);
  const gear = gearValue === 0 ? "N" : gearValue === -1 ? "R" : gearValue;

  // Update text values
  ui.speed.textContent = speed;
  ui.rpm.textContent = rpm.toLocaleString("id-ID");
  ui.gear.textContent = gear;
  
  // Update DRS
  ui.drs.classList.toggle("active", isDrsActive);

  // SVG Gauge Updates
  // Speedometer (outer): dasharray 400
  if (ui.speedPath) {
    const maxSpeed = 360;
    const speedDash = 400;
    const speedOffset = speedDash - (clamp(speed, 0, maxSpeed) / maxSpeed) * speedDash;
    ui.speedPath.style.strokeDashoffset = speedOffset;
  }

  // Throttle (inner left): dasharray 200
  if (ui.throttlePath) {
    const throttleDash = 200;
    const throttleOffset = throttleDash - (throttle / 100) * throttleDash;
    ui.throttlePath.style.strokeDashoffset = throttleOffset;
  }
  
  // Brake (inner right): dasharray 200
  if (ui.brakePath) {
    const brakeDash = 200;
    const brakeOffset = brakeDash - (brake / 100) * brakeDash;
    ui.brakePath.style.strokeDashoffset = brakeOffset;
    ui.brakePath.classList.toggle("active", brake > 1);
  }

  // Lap time display if available in store
  const currentLapData = store.raceData?.laps?.find(l => 
    String(l.driver_number) === String(store.ui.selectedDriver) && 
    l.lap_number === Number(ui.currentLap.textContent)
  );
  if (currentLapData && ui.lapTime) {
    ui.lapTime.textContent = currentLapData.lap_duration ? 
      currentLapData.lap_duration.toFixed(3) : "--:--.---";
  }
}

function bindChrome() {
  byId("toggle-session-loader")?.addEventListener("click", () => {
    ui.sessionLoader?.classList.toggle("visible");
  });

  byId("close-info-panel")?.addEventListener("click", () => {
    ui.infoPanel?.classList.remove("visible");
  });

  document.querySelectorAll(".nav-pill").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-pill").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });

  document.querySelectorAll(".tab-item").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-item").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      document.body.dataset.activePanel = button.dataset.panel || "telemetry";
    });
  });

  byId("center-map")?.addEventListener("click", () => components.trackMap.resetView?.());
  byId("zoom-in")?.addEventListener("click", () => components.trackMap.setZoom?.(1.18));
  byId("zoom-out")?.addEventListener("click", () => components.trackMap.setZoom?.(0.84));
}

function bindEvents() {
  eventBus.on("loading:start", (message) => setLoading(message, true));
  eventBus.on("loading:success", () => {
    setLoading("", false);
    ui.sessionLoader?.classList.remove("visible");
  });
  eventBus.on("loading:error", (message) => {
    setLoading(`Gagal memuat data: ${message || "periksa koneksi dan coba lagi."}`, true);
    ui.loadingOverlay?.classList.add("error");
  });
  eventBus.on("session:ready", updateHeaderInfo);
  eventBus.on("driver:selected", selectDriver);
  eventBus.on("playback:update", (timestamp) => {
    updateTelemetry(timestamp);
    updateCurrentLap(timestamp);
  });
}

async function boot() {
  bindChrome();
  bindEvents();

  const urlParams = new URLSearchParams(window.location.search);
  const activeSessionKey = Number.parseInt(urlParams.get("session_key"), 10);
  const sessionToLoad = Number.isFinite(activeSessionKey) ? activeSessionKey : 11234;

  try {
    await replayEngine.loadSession(sessionToLoad);
  } catch (error) {
    eventBus.emit("loading:error", error.message);
  }
}

boot();
