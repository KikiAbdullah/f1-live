import { store } from "../core/store.js";
import { eventBus } from "../core/event-bus.js";
import { positionService } from "../services/position-service.js";

export class Leaderboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.listElement = null;
    this.eventsBound = false;
    this.lastUpdate = 0;
    this.cachedItems = null; 
    this.currentLeader = null;
    this.alertTimeout = null;

    this.handlePlaybackUpdate = this.handlePlaybackUpdate.bind(this);
    this.handleSessionReady = this.handleSessionReady.bind(this);
    this.handleDriverSelected = this.handleDriverSelected.bind(this);

    this.init();
  }

  init() {
    eventBus.on("playback:update", this.handlePlaybackUpdate);
    eventBus.on("session:ready", this.handleSessionReady);
    eventBus.on("driver:selected", (num) => {
        console.log("[Leaderboard] Event 'driver:selected' received for:", num);
        this.handleDriverSelected(num);
    });
  }

  handlePlaybackUpdate(timestamp) {
    this.update(timestamp);
    this.updateInlineTelemetry(timestamp);
  }

  handleSessionReady() {
    this.renderBase();
    const currentTime = store.playback ? store.playback.currentTime : 0;
    this.update(currentTime);
  }

  handleDriverSelected(driverNumber) {
    this.highlightDriver(driverNumber);
    if (!driverNumber) {
        // Hapus panel jika unselect
        this.listElement.querySelectorAll(".inline-telemetry").forEach(el => el.remove());
        this.recalculateRowPositions();
        
        // Unselect juga di track map melalui store
        if (store.ui) store.ui.selectedDriver = null;
        store.setState("selectedDriver", null);
        return;
    }
    this.renderInlineTelemetry(driverNumber);
  }

  renderBase() {
    if (!this.container) return;
    this.container.innerHTML = `<div class="leaderboard-list"></div>`;
    this.listElement = this.container.querySelector(".leaderboard-list");
    this.bindClickEvents();
  }

  bindClickEvents() {
    if (!this.listElement || this.eventsBound) return;
    this.eventsBound = true;

    this.listElement.addEventListener("click", (event) => {
      const item = event.target.closest(".leaderboard-row");
      if (!item) return;

      const driverNumber = String(item.dataset.driverNumber || "");
      if (!driverNumber) return;

      console.log("[Leaderboard] Clicked driver:", driverNumber);

      const currentSelected = store.ui?.selectedDriver || store.selectedDriver;
      let newSelected = driverNumber;

      // Jika yang diklik adalah yang sedang terpilih, maka unselect
      if (String(currentSelected) === String(driverNumber)) {
        console.log("[Leaderboard] Unselecting driver:", driverNumber);
        newSelected = null;
      }

      if (store.ui) store.ui.selectedDriver = newSelected;
      store.selectedDriver = newSelected;

      eventBus.emit("driver:selected", newSelected);
    });
  }

  renderInlineTelemetry(driverNumber) {
    if (!this.listElement) return;
    
    // Hapus panel lama
    this.listElement.querySelectorAll(".inline-telemetry").forEach(el => el.remove());

    const row = this.listElement.querySelector(`.leaderboard-row[data-driver-number="${driverNumber}"]`);
    if (!row) {
        console.error("[Leaderboard] Row not found for inline telemetry:", driverNumber);
        return;
    }

    const telemetryContainer = document.createElement("div");
    telemetryContainer.className = "inline-telemetry";
    
    // Ambil status pit dari position service untuk ditampilkan di detail
    const currentTime = store.playback ? store.playback.currentTime : 0;
    const positions = positionService.getLatestPositions(currentTime);
    const driverPos = positions.find(p => String(p.driver_number) === String(driverNumber));
    const pitStatusHtml = driverPos?.inPit ? `
        <div class="pit-detail-badge">
            <span class="pit-label">IN PIT</span>
            <span class="pit-timer">${parseFloat(driverPos.pitStopDuration || 0).toFixed(1)}s</span>
        </div>
    ` : "";

    telemetryContainer.innerHTML = `
        <div class="telemetry-dashboard inline-mode">
          ${pitStatusHtml}
          <div class="telemetry-top-info">
            <div id="inline-lap-time" class="telemetry-lap-time">--:--.---</div>
            <div class="tyre-indicator">
              <span id="inline-tyre-life" class="tyre-life">--</span>
              <span id="inline-tyre-compound" class="tyre-compound compound-s">S</span>
            </div>
          </div>
          <div class="main-gauge-container">
            <svg class="f1-gauge-svg" viewBox="0 0 200 200">
              <defs>
                <path id="inline-speed-text-path" d="M 35 155 A 82 82 0 1 1 165 155" />
              </defs>
              <path class="gauge-ring speedometer-bg" d="M 35 155 A 82 82 0 1 1 165 155" fill="none" stroke-width="14" />
              <path id="inline-speed-path" class="gauge-ring speedometer-fill" d="M 35 155 A 82 82 0 1 1 165 155" fill="none" stroke-width="14" stroke-dasharray="400" stroke-dashoffset="400" />
              <path class="gauge-ring throttle-bg" d="M 55 140 A 60 60 0 0 1 100 40" fill="none" stroke-width="14" />
              <path id="inline-throttle-path" class="gauge-ring throttle-fill" d="M 55 140 A 60 60 0 0 1 100 40" fill="none" stroke-width="14" stroke-dasharray="200" stroke-dashoffset="200" />
              <path class="gauge-ring brake-bg" d="M 145 140 A 60 60 0 0 0 100 40" fill="none" stroke-width="14" />
              <path id="inline-brake-path" class="gauge-ring brake-fill" d="M 145 140 A 60 60 0 0 0 100 40" fill="none" stroke-width="14" stroke-dasharray="200" stroke-dashoffset="200" />
              <g class="gauge-markers">
                <text class="marker-text"><textPath xlink:href="#inline-speed-text-path" startOffset="0%">0</textPath></text>
                <text class="marker-text"><textPath xlink:href="#inline-speed-text-path" startOffset="50%">180</textPath></text>
                <text class="marker-text"><textPath xlink:href="#inline-speed-text-path" startOffset="100%">360</textPath></text>
              </g>
            </svg>
            <div class="gauge-center-content">
              <div class="speed-display">
                <span id="inline-speed" class="speed-value">0</span>
                <span class="speed-unit">KM/H</span>
              </div>
              <div class="rpm-display">
                <span id="inline-rpm" class="rpm-value">0</span>
              </div>
            </div>
            <div class="gauge-bottom-content">
              <div id="inline-drs" class="drs-status">DRS</div>
              <div class="gear-display">
                <span class="gear-label">GEAR</span>
                <span id="inline-gear" class="gear-value">N</span>
              </div>
            </div>
          </div>
        </div>
    `;

    row.after(telemetryContainer);
    this.recalculateRowPositions();
    
    this.updateInlineTelemetry(currentTime);
  }

  recalculateRowPositions() {
    if (!this.listElement) return;
    const children = Array.from(this.listElement.children);
    let currentY = 0;
    children.forEach((child) => {
        if (child.classList.contains("leaderboard-row")) {
            child.style.transform = `translateY(${currentY}px)`;
            currentY += 32;
        } else if (child.classList.contains("inline-telemetry")) {
            child.style.transform = `translateY(${currentY}px)`;
            currentY += 240;
        }
    });
    this.listElement.style.height = `${currentY}px`;
  }

  async updateInlineTelemetry(timestamp) {
    const selectedDriver = store.ui?.selectedDriver || store.selectedDriver;
    if (!selectedDriver) return;

    const speedEl = document.getElementById("inline-speed");
    if (!speedEl) return;

    const { telemetryService } = await import("../services/telemetry-service.js");
    const data = telemetryService.getDriverTelemetry(selectedDriver, timestamp);
    if (!data) return;

    const elements = {
        gear: document.getElementById("inline-gear"),
        rpm: document.getElementById("inline-rpm"),
        lapTime: document.getElementById("inline-lap-time"),
        tyreLife: document.getElementById("inline-tyre-life"),
        tyreComp: document.getElementById("inline-tyre-compound"),
        drs: document.getElementById("inline-drs"),
        speedPath: document.getElementById("inline-speed-path"),
        throttlePath: document.getElementById("inline-throttle-path"),
        brakePath: document.getElementById("inline-brake-path")
    };

    if (elements.speedPath) {
        const speed = Math.round(data.speed || 0);
        speedEl.textContent = speed;
        elements.speedPath.style.strokeDashoffset = 400 - (Math.min(speed, 360) / 360) * 400;
    }

    // Update Live Pit Timer di panel detail jika sedang PIT
    const pitTimerEl = this.listElement.querySelector(".inline-telemetry .pit-timer");
    if (pitTimerEl) {
        const positions = positionService.getLatestPositions(timestamp);
        const driverPos = positions.find(p => String(p.driver_number) === String(selectedDriver));
        if (driverPos && driverPos.inPit) {
            pitTimerEl.textContent = `${parseFloat(driverPos.pitStopDuration || 0).toFixed(1)}s`;
        }
    }

    if (elements.rpm) elements.rpm.textContent = Math.round(data.rpm || 0);
    if (elements.gear) {
        const gearVal = Math.round(data.n_gear || 0);
        elements.gear.textContent = gearVal === 0 ? "N" : gearVal;
    }
    if (elements.lapTime) elements.lapTime.textContent = data.lastLapTime || "--:--.---";
    if (elements.tyreLife) elements.tyreLife.textContent = data.tyre_age_laps || "--";
    
    if (elements.tyreComp) {
        const compound = data.tyre_compound ? data.tyre_compound.charAt(0).toUpperCase() : "S";
        elements.tyreComp.textContent = compound;
        elements.tyreComp.className = `tyre-compound compound-${compound.toLowerCase()}`;
    }
    
    if (elements.drs) {
        elements.drs.classList.toggle("active", [10, 12, 14].includes(data.drs || 0));
    }
    
    if (elements.throttlePath) {
        elements.throttlePath.style.strokeDashoffset = 200 - (Math.min(data.throttle || 0, 100) / 100) * 200;
    }
    if (elements.brakePath) {
        const isBraking = (data.brake || 0) > 0;
        elements.brakePath.style.strokeDashoffset = 200 - (isBraking ? 100 : 0);
        elements.brakePath.classList.toggle("active", isBraking);
    }
  }

  update(timestamp = 0) {
    if (!this.listElement) return;
    let positions = [];
    try {
      if (positionService.getLatestPositions) {
        positions = positionService.getLatestPositions(timestamp) || [];
      }
    } catch (error) {
      return;
    }
    this.render(positions);
  }

  highlightDriver(driverNumber) {
    if (!this.listElement) return;
    this.listElement.querySelectorAll(".leaderboard-row").forEach((item) => {
      const isSelected = String(item.dataset.driverNumber) === String(driverNumber);
      item.classList.toggle("selected", isSelected);
    });
  }

  showLeaderAlert(driver) {
    const alertEl = document.getElementById("leader-alert");
    const nameEl = document.getElementById("la-driver-name");
    const accentEl = alertEl?.querySelector(".la-accent");
    
    if (!alertEl || !nameEl) return;
    if (this.alertTimeout) clearTimeout(this.alertTimeout);
    
    nameEl.textContent = driver.broadcast_name || driver.name_acronym || "DRIVER";
    
    // Set color to team color
    if (driver.team_colour) {
        const teamColor = `#${driver.team_colour}`;
        nameEl.style.color = teamColor;
        if (accentEl) accentEl.style.backgroundColor = teamColor;
    } else {
        nameEl.style.color = "var(--accent-blue)"; // Default fallback
        if (accentEl) accentEl.style.backgroundColor = "var(--f1-red)";
    }
    
    alertEl.classList.remove("hidden");
    this.alertTimeout = setTimeout(() => {
      alertEl.classList.add("hidden");
    }, 5000);
  }

  render(positions = []) {
    if (!this.listElement || !Array.isArray(positions)) return;

    if (positions.length > 0) {
      const newLeader = String(positions[0].driver_number);
      if (this.currentLeader !== null && this.currentLeader !== newLeader) {
        this.showLeaderAlert(positions[0]);
      }
      this.currentLeader = newLeader;
    }

    const selectedDriver = String(store.ui?.selectedDriver ?? store.selectedDriver ?? "");

    if (positions.length === 0) {
      this.listElement.innerHTML = `<div class="leaderboard-empty">No position data available</div>`;
      this.cachedItems = null;
      return;
    }

    if (!this.cachedItems || this.cachedItems.length !== positions.length) {
      this.listElement.innerHTML = positions
        .map((p, index) => {
          const driverNumber = p.driver_number || "";
          const pos = p.position || index + 1;
          const interval = index === 0 ? "Interval" : (p.interval || "+0.000s");
          const compound = p.tyre_compound ? p.tyre_compound.charAt(0).toUpperCase() : "S";
          const pitText = p.inPit ? (p.pitStopDuration ? `PIT ${parseFloat(p.pitStopDuration).toFixed(1)}s` : "PIT") : "";

          return `
                    <div class="leaderboard-row ${String(driverNumber) === selectedDriver ? "selected" : ""} ${p.inPit ? "in-pit" : ""} ${p.status === "Retired" ? "out" : ""}"
                         data-driver-number="${driverNumber}"
                         data-pos="${pos}">
                        <div class="lb-pos">${pos}</div>
                        <div class="lb-team-color" style="background-color: #${p.team_colour || '777777'}"></div>
                        <div class="lb-name">${p.name_acronym || "???"}</div>
                        <div class="lb-gap">${p.inPit ? `<span class="lb-pit-indicator">${pitText}</span>` : interval}</div>
                        <div class="lb-tyre tyre-${compound}">${compound}</div>
                    </div>
                `;
        })
        .join("");

      this.cachedItems = Array.from(this.listElement.querySelectorAll(".leaderboard-row")).map((el) => ({
        el,
        posEl: el.querySelector(".lb-pos"),
        nameEl: el.querySelector(".lb-name"),
        gapEl: el.querySelector(".lb-gap"),
        tyreEl: el.querySelector(".lb-tyre"),
        colorEl: el.querySelector(".lb-team-color"),
      }));

      if (selectedDriver) {
          this.renderInlineTelemetry(selectedDriver);
      } else {
          this.recalculateRowPositions();
      }
      return;
    }

    let currentY = 0;
    positions.forEach((p, index) => {
      const cache = this.cachedItems[index];
      if (!cache) return;

      const driverNumber = String(p.driver_number || "");
      const isLeader = index === 0;
      const intervalText = isLeader ? "Interval" : String(p.interval || "+0.000s");
      const pos = p.position || index + 1;
      const compound = p.tyre_compound ? p.tyre_compound.charAt(0).toUpperCase() : "S";
      const isSelected = String(driverNumber) === selectedDriver;
      const pitText = p.inPit ? (p.pitStopDuration ? `PIT ${parseFloat(p.pitStopDuration).toFixed(1)}s` : "PIT") : "";

      cache.el.style.transform = `translateY(${currentY}px)`;
      currentY += 32;

      if (isSelected) {
          const telCont = this.listElement.querySelector(".inline-telemetry");
          if (telCont) {
              telCont.style.transform = `translateY(${currentY}px)`;
              currentY += 240;
          }
      }
      
      cache.el.classList.toggle("in-pit", !!p.inPit);
      cache.el.classList.toggle("selected", isSelected);
      cache.el.classList.toggle("out", p.status === "Retired");
      cache.el.dataset.pos = pos;

      if (cache.posEl.textContent !== String(pos)) cache.posEl.textContent = pos;
      
      const displayGap = p.inPit ? `<span class="lb-pit-indicator">${pitText}</span>` : intervalText;
      if (cache.gapEl.innerHTML !== displayGap) cache.gapEl.innerHTML = displayGap;

      if (cache.tyreEl && cache.tyreEl.textContent !== compound) {
          cache.tyreEl.textContent = compound;
          cache.tyreEl.className = `lb-tyre tyre-${compound}`;
      }

      if (cache.el.dataset.driverNumber !== driverNumber) {
        cache.el.dataset.driverNumber = driverNumber;
        const nameText = p.name_acronym || "???";
        if (cache.nameEl.textContent !== nameText) cache.nameEl.textContent = nameText;
        if (cache.colorEl) cache.colorEl.style.backgroundColor = `#${p.team_colour || '777777'}`;
      }
    });
    this.listElement.style.height = `${currentY}px`;
  }

  destroy() {
    eventBus.off("playback:update", this.handlePlaybackUpdate);
    eventBus.off("session:ready", this.handleSessionReady);
    eventBus.off("driver:selected", this.handleDriverSelected);
    if (this.alertTimeout) clearTimeout(this.alertTimeout);
    if (this.container) this.container.innerHTML = "";
  }
}
