import { eventBus } from "../core/event-bus.js";
import { store } from "../core/store.js";

export class RaceFeed {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.lastSignature = ""; // Menggantikan lastProcessedIdx untuk optimasi 60fps yang lebih akurat

    // Bind methods agar bisa dilepas dengan benar saat destroy() dijalankan
    this.handlePlaybackUpdate = this.handlePlaybackUpdate.bind(this);
    this.handleSeek = this.handleSeek.bind(this);

    this.init();
  }

  init() {
    eventBus.on("playback:update", this.handlePlaybackUpdate);
    eventBus.on("playback:seek", this.handleSeek);
  }

  handlePlaybackUpdate(timestamp) {
    this.update(timestamp);
  }

  handleSeek() {
    this.lastSignature = ""; // Reset penanda agar feed langsung dikalkulasi ulang saat user menggeser slider
  }

  update(timestamp) {
    // FIX: Validasi super aman agar tidak melempar RangeError akibat memproses tanggal invalid
    if (
      !this.container ||
      !store.playback ||
      typeof store.playback.startTime !== "number"
    )
      return;

    // Ambil data mentah secara aman dengan fallback array kosong jika data belum ter-load dari API
    const rawRaceControl =
      store.raceData && store.raceData.raceControl
        ? store.raceData.raceControl
        : [];
    if (rawRaceControl.length === 0) {
      this.render([]);
      return;
    }

    const absoluteTime = new Date(
      store.playback.startTime + timestamp
    ).toISOString();

    // Filter pesan yang sudah terjadi hingga detik pemutaran ini
    const currentMessages = rawRaceControl.filter(
      (m) => m.date <= absoluteTime
    );

    // Urutkan berdasarkan waktu terbaru (latest first)
    const sortedMessages = [...currentMessages].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    // Ambil maksimal 10 pesan teratas
    const latestTen = sortedMessages.slice(0, 10);

    // OPTIMASI: Buat signature unik dari kombinasi tanggal pesan
    const currentSignature = latestTen
      .map((m) => `${m.date}-${m.flag || ""}`)
      .join("|");

    // Jika tidak ada pesan baru yang masuk di frame ini, langsung batalkan render DOM (Hemat resource browser)
    if (currentSignature === this.lastSignature) return;
    this.lastSignature = currentSignature;

    this.render(latestTen);
  }

  render(messages) {
    if (!this.container) return;

    // Tangani kondisi jika belum ada pesan dari Race Control
    if (messages.length === 0) {
      this.container.innerHTML = `
                <div class="feed-entry empty">
                    <span class="feed-msg">No race control messages.</span>
                </div>
            `;
      return;
    }

    this.container.innerHTML = messages
      .map((m) => {
        let msgClass = "";
        // Pastikan m.flag ada sebelum di-lowercase agar tidak error
        if (m.flag) {
          msgClass = `flag-${m.flag.toLowerCase()}`;
        }

        let time = "--:--:--";
        try {
          time = new Date(m.date).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
        } catch (e) {
          console.error("RaceFeed: Date formatting error", e);
        }

        return `
                <div class="feed-entry">
                    <span class="feed-time">[${time}]</span>
                    <span class="feed-msg ${msgClass}">${m.message || ""}</span>
                </div>
            `;
      })
      .join("");
  }

  // Fungsi krusial untuk mencegah kebocoran memori (Memory Leak) saat ganti halaman/tab UI
  destroy() {
    eventBus.off("playback:update", this.handlePlaybackUpdate);
    eventBus.off("playback:seek", this.handleSeek);

    this.lastSignature = "";
    if (this.container) {
      this.container.innerHTML = "";
    }
  }
}
