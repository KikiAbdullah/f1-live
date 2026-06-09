import { F1Api } from "../core/api.js";
import { eventBus } from "../core/event-bus.js";
import { store } from "../core/store.js";

export class SessionSelector {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentYear = 2024; // Default tahun data stabil
    this.sessions = [];
    this.elements = {}; // Menyimpan referensi DOM untuk optimasi

    // Bind methods agar aman saat dilepas pada destroy()
    this.handleSessionLoad = this.handleSessionLoad.bind(this);

    this.init();
  }

  async init() {
    this.renderBase();

    // Membaca session_key yang aktif saat ini dari URL (jika ada) untuk mengunci posisi select
    const urlParams = new URLSearchParams(window.location.search);
    const activeSessionKey = urlParams.get("session_key");

    await this.fetchAndRenderYears();
    this.bindEvents();

    // Jika ada sesi aktif dari URL, coba pilih secara otomatis di dropdown
    if (activeSessionKey) {
      this.elements.sessionSelect.value = activeSessionKey;
      this.elements.loadButton.disabled = false;
    }
  }

  renderBase() {
    if (!this.container) return;
    this.container.innerHTML = `
            <div class="session-selector">
                <div class="selector-controls">
                    <select id="year-select"></select>
                    <select id="session-select" disabled></select>
                </div>
                <button id="load-session-btn" disabled>Load Session</button>
            </div>
            <div id="session-list" class="session-list"></div>
        `;

    // Cache DOM Elements agar tidak query terus-menerus
    this.elements = {
      yearSelect: this.container.querySelector("#year-select"),
      sessionSelect: this.container.querySelector("#session-select"),
      loadButton: this.container.querySelector("#load-session-btn"),
    };
  }

  async fetchAndRenderYears() {
    const { yearSelect } = this.elements;
    if (!yearSelect) return;

    const currentYear = new Date().getFullYear();
    const startYear = 2018; // Data OpenF1 dimulai sekitar tahun 2018

    yearSelect.innerHTML = ""; // Bersihkan kontainer awal
    for (let year = currentYear; year >= startYear; year--) {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
    }

    // Sesuaikan pilihan default tahun yang aktif
    yearSelect.value = this.currentYear;
    await this.fetchAndRenderSessions(this.currentYear);
  }

  async fetchAndRenderSessions(year) {
    const { sessionSelect, loadButton } = this.elements;
    if (!sessionSelect) return;

    sessionSelect.disabled = true;
    loadButton.disabled = true;
    this.sessions = [];

    eventBus.emit("loading:start", `Fetching sessions for ${year}...`);
    try {
      // Mengambil seluruh jenis sesi dari OpenF1 API
      const allSessions = await F1Api.fetchSessions(year, "%");

      // FIX: Mengubah filter agar mendukung format teks OpenF1 seperti "Practice 1", "Sprint Shootout"
      this.sessions = allSessions
        .filter((s) => {
          if (!s.session_name) return false;
          const name = s.session_name.toLowerCase();
          return (
            name.includes("race") ||
            name.includes("qualifying") ||
            name.includes("sprint") ||
            name.includes("practice")
          );
        })
        .sort(
          (a, b) =>
            new Date(b.date_start).getTime() - new Date(a.date_start).getTime()
        ); // Sesi terbaru di atas

      sessionSelect.innerHTML = '<option value="">Select a Session</option>';

      this.sessions.forEach((s) => {
        const option = document.createElement("option");
        option.value = s.session_key;

        let localDate = "Unknown Date";
        if (s.date_start) {
          try {
            localDate = new Date(s.date_start).toLocaleDateString();
          } catch (e) {}
        }

        option.textContent = `${s.session_name} - ${
          s.meeting_name || "GP"
        } (${localDate})`;
        sessionSelect.appendChild(option);
      });

      sessionSelect.disabled = false;
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
      eventBus.emit("loading:error", "Failed to load sessions. Try again.");
    } finally {
      eventBus.emit("loading:success");
    }
  }

  bindEvents() {
    const { yearSelect, sessionSelect, loadButton } = this.elements;

    yearSelect.onchange = async (e) => {
      this.currentYear = parseInt(e.target.value, 10);
      await this.fetchAndRenderSessions(this.currentYear);
    };

    sessionSelect.onchange = (e) => {
      const rawValue = e.target.value;
      if (rawValue) {
        const selectedSessionKey = parseInt(rawValue, 10);
        loadButton.disabled = false;
        const selectedSession = this.sessions.find(
          (s) => s.session_key === selectedSessionKey
        );
        store.session = selectedSession || null;
      } else {
        loadButton.disabled = true;
        store.session = null;
      }
    };

    loadButton.onclick = () => {
      const value = sessionSelect.value;
      if (value) {
        eventBus.emit("session:load", parseInt(value, 10));
      }
    };

    eventBus.on("session:load", this.handleSessionLoad);
  }

  handleSessionLoad(sessionKey) {
    // Clear current replay state di memori sebelum pindah sirkuit/sesi
    if (store.playback) {
      store.playback.currentTime = 0;
      store.playback.isPlaying = false;
      store.playback.startTime = null;
      store.playback.endTime = null;
    }
    store.drivers = [];
    if (store.raceData) {
      Object.keys(store.raceData).forEach((key) => (store.raceData[key] = []));
    }

    // FIX LOGIKA UTAMA: Kirim session_key melalui URL Query Parameter sebelum memicu reload halaman
    // Dengan cara ini, Engine utama Anda saat bangun pasca-reload tahu harus memuat data sesi F1 yang mana.
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("session_key", sessionKey);
    window.location.href = newUrl.toString(); // Ini otomatis me-refresh halaman dengan membawa parameter baru
  }

  // Pembersihan komponen untuk menghindari memory leaks
  destroy() {
    eventBus.off("session:load", this.handleSessionLoad);

    if (this.elements.yearSelect) this.elements.yearSelect.onchange = null;
    if (this.elements.sessionSelect)
      this.elements.sessionSelect.onchange = null;
    if (this.elements.loadButton) this.elements.loadButton.onclick = null;

    this.sessions = [];
    this.elements = {};
    if (this.container) {
      this.container.innerHTML = "";
    }
  }
}
