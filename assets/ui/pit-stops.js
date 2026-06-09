import { eventBus } from "../core/event-bus.js";
import { store } from "../core/store.js";

export class PitStopFeed {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.pitStops = [];
    this.lastSignature = ""; // Untuk mendeteksi perubahan data sebelum render DOM

    // Bind methods agar bisa dilepas saat destroy()
    this.handlePlaybackUpdate = this.handlePlaybackUpdate.bind(this);
    this.handleSessionReady = this.handleSessionReady.bind(this);
    this.handleSeek = this.handleSeek.bind(this);

    this.init();
  }

  init() {
    eventBus.on("playback:update", this.handlePlaybackUpdate);
    eventBus.on("session:ready", this.handleSessionReady);
    eventBus.on("playback:seek", this.handleSeek);
  }

  handlePlaybackUpdate(timestamp) {
    this.update(timestamp);
  }

  handleSessionReady() {
    // FIX: Proteksi jika store.raceData.pit bernilai undefined/null agar tidak crash
    const rawPitData =
      store.raceData && store.raceData.pit ? store.raceData.pit : [];

    // Melakukan clone array agar tidak merusak data asli di store
    this.pitStops = [...rawPitData].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    this.lastSignature = ""; // Reset signature pelacak
    this.render([]); // Kosongkan feed untuk sesi baru
  }

  handleSeek() {
    this.lastSignature = ""; // Paksa hitung ulang signature saat user melompat waktu
    this.render([]);
  }

  update(timestamp) {
    if (
      !this.container ||
      !store.playback ||
      typeof store.playback.startTime !== "number"
    )
      return;

    const absoluteTime = new Date(
      store.playback.startTime + timestamp
    ).toISOString();

    // Filter semua pit stop yang sudah terjadi hingga detik ini
    const currentPitStops = this.pitStops.filter((p) => p.date <= absoluteTime);

    // Ambil maksimal 5 pit stop terbaru
    const latestFive = currentPitStops.slice(-5);

    // OPTIMASI: Buat signature unik berdasarkan kombinasi driver, lap, dan waktu pit
    const currentSignature = latestFive
      .map((p) => `${p.driver_number}-${p.lap_number}-${p.date}`)
      .join("|");

    // Jika data tidak berubah dari frame sebelumnya, lewati proses manipulasi DOM (Hemat CPU!)
    if (currentSignature === this.lastSignature) return;
    this.lastSignature = currentSignature;

    this.render(latestFive);
  }

  render(pitStops) {
    if (!this.container) return;

    if (pitStops.length === 0) {
      this.container.innerHTML = `
                <div class="feed-entry empty">
                    <span class="feed-msg">No recent pit stops.</span>
                </div>
            `;
      return;
    }

    // Render data terbalik (pit stop paling baru muncul di paling atas feed)
    this.container.innerHTML = [...pitStops]
      .reverse()
      .map((p) => {
        const driver = store.drivers
          ? store.drivers.find(
              (d) => String(d.driver_number) === String(p.driver_number)
            )
          : null;

        let time = "--:--:--";
        try {
          time = new Date(p.date).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
        } catch (e) {
          console.error("Format date error di pit stop:", e);
        }

        const teamColour = driver?.team_colour || "777777";
        const driverName =
          driver?.broadcast_name ||
          driver?.name_acronym ||
          `Car ${p.driver_number}`;
        const durationText = p.pit_duration
          ? ` (${parseFloat(p.pit_duration).toFixed(2)}s)`
          : "";

        return `
                <div class="feed-entry" style="border-left: 3px solid #${teamColour}">
                    <span class="feed-time">[${time}]</span>
                    <span class="feed-msg">
                        <strong>${driverName}</strong> masuk ke Pit Lane 
                        <span class="feed-lap">(Lap ${
                          p.lap_number || "?"
                        })</span>${durationText}
                    </span>
                </div>
            `;
      })
      .join("");
  }

  // Pembersihan Memory Leak saat komponen tidak lagi digunakan
  destroy() {
    eventBus.off("playback:update", this.handlePlaybackUpdate);
    eventBus.off("session:ready", this.handleSessionReady);
    eventBus.off("playback:seek", this.handleSeek);

    this.pitStops = [];
    this.lastSignature = "";
    if (this.container) {
      this.container.innerHTML = "";
    }
  }
}
