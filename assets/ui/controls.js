import { timeline } from "../core/timeline.js";
import { eventBus } from "../core/event-bus.js";
import { store } from "../core/store.js";

export class Controls {
  constructor(options = {}) {
    this.elements = {
      playBtn: document.getElementById(options.playButtonId || "play-pause"),
      slider: document.getElementById(options.sliderId || "timeline-slider"),
      timeDisplay: document.getElementById(options.timeDisplayId || "time-display"),
      speedSelect: document.getElementById(options.speedSelectId || "speed-select"),
    };
    this.wasPlayingBeforeSeek = false;
    this.bindEvents();
  }

  bindEvents() {
    const { playBtn, slider, speedSelect } = this.elements;
    if (!playBtn || !slider || !speedSelect) return;

    playBtn.onclick = () => {
      if (store.playback.isPlaying) {
        timeline.pause();
      } else {
        timeline.start();
      }
    };

    const beginSeek = () => {
      this.wasPlayingBeforeSeek = store.playback.isPlaying;
      if (this.wasPlayingBeforeSeek) timeline.pause();
    };

    const endSeek = () => {
      if (this.wasPlayingBeforeSeek) timeline.start();
      this.wasPlayingBeforeSeek = false;
    };

    slider.addEventListener("pointerdown", beginSeek);
    slider.addEventListener("pointerup", endSeek);
    slider.addEventListener("change", endSeek);

    slider.oninput = (event) => {
      timeline.seek(Number.parseInt(event.target.value, 10) || 0);
    };

    speedSelect.onchange = (event) => {
      timeline.setSpeed(Number.parseFloat(event.target.value) || 1);
    };

    eventBus.on("playback:start", () => {
      playBtn.textContent = "⏸";
      playBtn.setAttribute("aria-label", "Jeda replay");
    });

    eventBus.on("playback:pause", () => {
      playBtn.textContent = "▶";
      playBtn.setAttribute("aria-label", "Putar replay");
    });

    eventBus.on("playback:update", (time) => {
      slider.value = time;
      this.updateTimeDisplay(time);
    });

    eventBus.on("session:ready", () => {
      const duration = store.playback.endTime - store.playback.startTime;
      slider.max = Number.isFinite(duration) && duration > 0 ? duration : 0;
      slider.value = 0;
      playBtn.disabled = false;
      slider.disabled = false;
      speedSelect.disabled = false;
      playBtn.textContent = "▶";
      this.updateTimeDisplay(0);
    });
  }

  updateTimeDisplay(ms) {
    if (!this.elements.timeDisplay) return;
    const seconds = Math.floor(ms / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    this.elements.timeDisplay.textContent = `${h
      .toString()
      .padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }
}
