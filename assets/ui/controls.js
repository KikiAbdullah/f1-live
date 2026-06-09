import { timeline } from "../core/timeline.js";
import { eventBus } from "../core/event-bus.js";
import { store } from "../core/store.js";

export class Controls {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.elements = {}; // Menyimpan referensi DOM untuk optimasi
    this.wasPlayingBeforeSeek = false; // Menyimpan status untuk fitur smooth seek
    this.render();
    this.bindEvents();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = `
            <div class="controls-bar">
                <button id="play-pause" disabled>Play</button>
                <input type="range" id="timeline-slider" min="0" value="0" step="100" disabled>
                <span id="time-display">00:00:00</span>
                <select id="speed-select" disabled>
                    <option value="1">1x</option>
                    <option value="2">2x</option>
                    <option value="5">5x</option>
                    <option value="10">10x</option>
                    <option value="20">20x</option>
                </select>
            </div>
        `;

    // Cache DOM elements agar tidak melakukan query selector berkali-kali saat tick 60fps
    this.elements = {
      playBtn: this.container.querySelector("#play-pause"),
      slider: this.container.querySelector("#timeline-slider"),
      timeDisplay: this.container.querySelector("#time-display"),
      speedSelect: this.container.querySelector("#speed-select"),
    };
  }

  bindEvents() {
    const { playBtn, slider, speedSelect } = this.elements;
    if (!playBtn) return; // Mencegah error jika render gagal

    playBtn.onclick = () => {
      if (store.playback.isPlaying) {
        timeline.pause();
      } else {
        timeline.start();
      }
    };

    // --- UX Enhancement: Smooth Dragging ---
    // Pause otomatis saat pengguna mulai menarik slider
    slider.addEventListener("mousedown", () => {
      this.wasPlayingBeforeSeek = store.playback.isPlaying;
      if (this.wasPlayingBeforeSeek) timeline.pause();
    });

    // Resume otomatis setelah pengguna melepas slider
    slider.addEventListener("mouseup", () => {
      if (this.wasPlayingBeforeSeek) timeline.start();
    });

    slider.oninput = (e) => {
      timeline.seek(parseInt(e.target.value));
    };

    speedSelect.onchange = (e) => {
      timeline.setSpeed(parseFloat(e.target.value));
    };

    // --- Event Bus Listeners ---
    eventBus.on("playback:start", () => (playBtn.textContent = "Pause"));
    eventBus.on("playback:pause", () => (playBtn.textContent = "Play"));

    eventBus.on("playback:update", (time) => {
      slider.value = time;
      this.updateTimeDisplay(time);
    });

    eventBus.on("session:ready", () => {
      const duration = store.playback.endTime - store.playback.startTime;

      // Validasi durasi aman
      if (isFinite(duration) && duration > 0) {
        slider.max = duration;
      } else {
        slider.max = 0;
      }

      // Aktifkan semua kontrol setelah data siap
      playBtn.disabled = false;
      slider.disabled = false;
      speedSelect.disabled = false;

      // Reset ke posisi awal
      slider.value = 0;
      this.updateTimeDisplay(0);
      playBtn.textContent = "Play";
    });
  }

  updateTimeDisplay(ms) {
    const seconds = Math.floor(ms / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    // Menggunakan elemen cache agar jauh lebih cepat
    this.elements.timeDisplay.textContent = `${h
      .toString()
      .padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }
}
