import { store } from "../core/store.js";
import { eventBus } from "../core/event-bus.js";
import { positionService } from "../services/position-service.js";

export class Leaderboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.listElement = null;
    this.eventsBound = false;
    this.lastUpdate = 0;
    this.cachedItems = null; // Menyimpan referensi DOM baris pembalap

    this.handlePlaybackUpdate = this.handlePlaybackUpdate.bind(this);
    this.handleSessionReady = this.handleSessionReady.bind(this);
    this.handleDriverSelected = this.handleDriverSelected.bind(this);

    this.init();
  }

  init() {
    eventBus.on("playback:update", this.handlePlaybackUpdate);
    eventBus.on("session:ready", this.handleSessionReady);
    eventBus.on("driver:selected", this.handleDriverSelected);
  }

  handlePlaybackUpdate(timestamp) {
    this.update(timestamp);
  }

  handleSessionReady() {
    this.renderBase();
    const currentTime = store.playback ? store.playback.currentTime : 0;
    this.update(currentTime);
  }

  handleDriverSelected(driverNumber) {
    this.highlightDriver(driverNumber);
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

      if (store.ui) store.ui.selectedDriver = driverNumber;
      store.selectedDriver = driverNumber;

      eventBus.emit("driver:selected", driverNumber);
    });
  }

  update(timestamp = 0) {
    if (!this.listElement) return;

    // Throttle updates agar tidak membebani browser (max 2x per detik)
    const now = Date.now();
    if (this.lastUpdate && now - this.lastUpdate < 500) return;
    this.lastUpdate = now;

    let positions = [];
    try {
      // Evaluasi nama method dengan aman
      if (positionService.getLatestPositions) {
        positions = positionService.getLatestPositions(timestamp) || [];
      } else if (positionService.getLeaderboard) {
        positions = positionService.getLeaderboard(timestamp) || [];
      } else if (positionService.getPositions) {
        positions = positionService.getPositions(timestamp) || [];
      }
    } catch (error) {
      console.error("[Leaderboard] update error:", error);
      return;
    }

    this.render(positions);
  }

  highlightDriver(driverNumber) {
    if (!this.listElement) return;

    this.listElement.querySelectorAll(".leaderboard-row").forEach((item) => {
      const isSelected = item.dataset.driverNumber === String(driverNumber);
      item.classList.toggle("selected", isSelected);
    });
  }

  render(positions = []) {
    if (!this.listElement || !Array.isArray(positions)) return;

    const selectedDriver = String(store.ui?.selectedDriver ?? store.selectedDriver ?? "");

    if (positions.length === 0) {
      this.listElement.innerHTML = `<div class="leaderboard-empty">No position data available</div>`;
      this.cachedItems = null; // Reset cache
      return;
    }

    if (!this.cachedItems || this.cachedItems.length !== positions.length) {
      this.listElement.innerHTML = positions
        .map((p) => {
          const driverNumber = p.driver_number || "";
          const teamColour = p.team_colour || "777777";
          const gap = p.gap || "--";

          return `
                    <div class="leaderboard-row ${
                      String(driverNumber) === selectedDriver
                        ? "selected"
                        : ""
                    } ${p.inPit ? "in-pit" : ""}"
                         data-driver-number="${driverNumber}">
                        <div class="lb-pos">${p.position || "-"}</div>
                        <div class="lb-team-stripe" style="background-color: #${teamColour}"></div>
                        <div class="lb-name">${p.name_acronym || p.broadcast_name || "???"}</div>
                        <div class="lb-gap">${gap}</div>
                        <div class="lb-status-dot" style="background-color: ${p.inPit ? "var(--f1-red)" : "transparent"}"></div>
                    </div>
                `;
        })
        .join("");

      // Simpan referensi node untuk update cepat di frame berikutnya
      this.cachedItems = Array.from(
        this.listElement.querySelectorAll(".leaderboard-row")
      ).map((el) => ({
        el,
        posEl: el.querySelector(".lb-pos"),
        nameEl: el.querySelector(".lb-name"),
        gapEl: el.querySelector(".lb-gap"),
        dotEl: el.querySelector(".lb-status-dot"),
      }));
      return;
    }

    // OPTIMASI: Fast update (DOM Diffing) - Hanya update text/class, jangan buat ulang HTML
    positions.forEach((p, index) => {
      const cache = this.cachedItems[index];
      if (!cache) return;

      const driverNumber = String(p.driver_number || "");
      const isLeader = index === 0;
      const gapText = isLeader ? "INTERVAL" : String(p.gap || "--");
      const inPit = !!p.inPit;
      const isSelected = String(driverNumber) === selectedDriver;

      if (inPit !== cache.el.classList.contains("in-pit")) {
        cache.el.classList.toggle("in-pit", inPit);
        if (cache.dotEl) {
            cache.dotEl.style.backgroundColor = inPit ? "var(--f1-red)" : "transparent";
        }
      }
      if (isSelected !== cache.el.classList.contains("selected")) {
        cache.el.classList.toggle("selected", isSelected);
      }

      // Update data dinamis hanya jika ada perubahan teks
      const posText = String(p.position || "-");

      if (cache.posEl.textContent !== posText)
        cache.posEl.textContent = posText;
      if (cache.gapEl.textContent !== gapText)
        cache.gapEl.textContent = gapText;

      // Memastikan dataset tidak tertinggal jika urutan array berubah
      if (cache.el.dataset.driverNumber !== driverNumber) {
        cache.el.dataset.driverNumber = driverNumber;
        const nameText = p.name_acronym || p.broadcast_name || "???";
        if (cache.nameEl.textContent !== nameText) cache.nameEl.textContent = nameText;
        
        const teamColour = p.team_colour || "777777";
        const stripe = cache.el.querySelector(".lb-team-stripe");
        if (stripe) stripe.style.backgroundColor = `#${teamColour}`;
      }
    });
  }

  destroy() {
    eventBus.off("playback:update", this.handlePlaybackUpdate);
    eventBus.off("session:ready", this.handleSessionReady);
    eventBus.off("driver:selected", this.handleDriverSelected);

    this.eventsBound = false;
    this.cachedItems = null;

    if (this.container) {
      this.container.innerHTML = "";
    }
  }
}
