import { eventBus } from "./event-bus.js";
import { store } from "./store.js";

export const timeline = {
  timer: null,
  lastTick: 0,

  start() {
    console.log("Timeline: start requested");
    if (store.playback.isPlaying) return;

    // Validasi tidak hanya untuk startTime, tapi juga endTime
    if (
      typeof store.playback.startTime !== "number" ||
      typeof store.playback.endTime !== "number"
    ) {
      console.error("Timeline: Cannot start, startTime or endTime is invalid.");
      return;
    }

    // Mencegah penumpukan requestAnimationFrame jika start dipanggil ganda
    if (this.timer) {
      cancelAnimationFrame(this.timer);
    }

    store.playback.isPlaying = true;
    this.lastTick = performance.now();
    this.tick();
    eventBus.emit("playback:start");
    console.log("Timeline: started at", store.playback.currentTime);
  },

  pause() {
    store.playback.isPlaying = false;
    if (this.timer) {
      cancelAnimationFrame(this.timer);
      this.timer = null;
    }
    eventBus.emit("playback:pause");
  },

  seek(time) {
    if (
      typeof store.playback.startTime !== "number" ||
      typeof store.playback.endTime !== "number"
    )
      return;

    const maxTime = Math.max(
      0,
      store.playback.endTime - store.playback.startTime
    );

    // Memastikan nilai tidak NaN dan tetap berada di dalam batas waktu sesi
    store.playback.currentTime = Math.max(0, Math.min(time, maxTime));

    eventBus.emit("playback:seek", store.playback.currentTime);
    this.update();
  },

  tick() {
    if (!store.playback.isPlaying) return;

    const now = performance.now();
    const delta = now - this.lastTick;
    this.lastTick = now;

    if (
      typeof store.playback.startTime !== "number" ||
      typeof store.playback.endTime !== "number"
    ) {
      console.warn("Playback started but session times are not set properly");
      this.pause();
      return;
    }

    store.playback.currentTime += delta * store.playback.speed;

    const maxTime = store.playback.endTime - store.playback.startTime;

    if (store.playback.currentTime >= maxTime) {
      store.playback.currentTime = maxTime;
      this.update(); // Pancarkan event UI terakhir untuk mengupdate posisi mentok
      this.pause();
      return; // FIX: Pastikan tidak menjadwalkan frame baru setelah di-pause
    }

    this.update();
    this.timer = requestAnimationFrame(() => this.tick());
  },

  update() {
    eventBus.emit("playback:update", store.playback.currentTime);
  },

  setSpeed(speed) {
    store.playback.speed = speed;
    eventBus.emit("playback:speed", speed);
  },
};
