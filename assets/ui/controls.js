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
      this.renderMarkers(duration);
    });
  }

  renderMarkers(duration) {
    const sliderContainer = this.elements.slider.parentElement;
    
    // Hapus marker lama
    sliderContainer.querySelectorAll('.timeline-marker').forEach(m => m.remove());

    const events = store.raceData?.raceControl || [];

    // Gunakan map untuk menghindari duplikasi
    const processedEvents = new Map();

    events.forEach(event => {
      const category = (event.category || "").toLowerCase();
      const message = (event.message || "").toLowerCase();
      
      let type = null;
      let label = "";

      // Logic matching yang lebih robust sesuai data OpenF1
      if (category.includes("flag") && message.includes("red")) {
        type = "red-flag";
        label = "RED FLAG";
      } else if (message.includes("safety car deployed") || category.includes("safetycar")) {
        if (message.includes("virtual")) {
          type = "vsc";
          label = "VSC";
        } else {
          type = "sc";
          label = "SAFETY CAR";
        }
      } else if (message.includes("race start") || message.includes("session start")) {
        type = "start";
        label = "RACE START";
      } else if (message.includes("chequered flag") || message.includes("session end")) {
        type = "finish";
        label = "FINISH";
      }

      if (!type) return;
      
      const eventDate = event.date || event.date_start;
      if (!eventDate) return;

      const eventTime = new Date(eventDate).getTime() - store.playback.startTime;
      if (eventTime < 0 || eventTime > duration) return;

      const markerId = `${type}-${Math.round(eventTime / 5000)}`; // Group by 5 seconds
      if (processedEvents.has(markerId)) return;
      processedEvents.set(markerId, true);

      const marker = document.createElement('div');
      marker.className = `timeline-marker marker-${type}`;
      marker.style.left = `${(eventTime / duration) * 100}%`;
      marker.title = `${label}: ${event.message || ''}`;
      
      marker.onclick = (e) => {
        e.stopPropagation();
        timeline.seek(eventTime);
      };
      sliderContainer.appendChild(marker);
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
