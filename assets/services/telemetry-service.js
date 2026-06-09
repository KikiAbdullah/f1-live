import { store } from "../core/store.js";
import { replayEngine } from "../core/replay-engine.js";
import { eventBus } from "../core/event-bus.js";

// Objek memori lokal untuk melacak posisi indeks terakhir pencarian data (Kursor)
const _cursorCache = {
  locations: {},
  telemetry: {},
};

export const telemetryService = {
  // Flag konfigurasi global untuk kehalusan visual
  INTERPOLATE_ENABLED: true,

  init() {
    // Otomatis bersihkan cache kursor jika pengguna melompati lini waktu (Seek) atau ganti sesi
    eventBus.on("playback:seek", () => this.resetCursors());
    eventBus.on("session:ready", () => this.resetCursors());
  },

  resetCursors() {
    _cursorCache.locations = {};
    _cursorCache.telemetry = {};
  },

  /**
   * Mengambil data telemetri pembalap (Speed, RPM, Gear, Throttle, dll)
   */
  getDriverTelemetry(
    driverNumber,
    timestamp,
    interpolate = this.INTERPOLATE_ENABLED
  ) {
    return this.getCachedDriverData(
      "telemetry",
      driverNumber,
      timestamp,
      interpolate
    );
  },

  /**
   * Mengambil data koordinat posisi pembalap (x, y) di sirkuit
   */
  getDriverLocation(
    driverNumber,
    timestamp,
    interpolate = this.INTERPOLATE_ENABLED
  ) {
    return this.getCachedDriverData(
      "locations",
      driverNumber,
      timestamp,
      interpolate
    );
  },

  /**
   * Mengambil seluruh koordinat posisi aktif pembalap untuk visualisasi TrackMap
   */
  getAllLocations(timestamp, interpolate = this.INTERPOLATE_ENABLED) {
    const locations = {};
    if (!store.drivers || store.drivers.length === 0) return locations;

    for (let i = 0; i < store.drivers.length; i++) {
      const driverNum = store.drivers[i].driver_number;
      const loc = this.getDriverLocation(driverNum, timestamp, interpolate);
      if (loc) {
        locations[driverNum] = loc;
      }
    }
    return locations;
  },

  /**
   * ENGINE OPTIMASI UTAMA: Menggantikan Binary Search berulang dengan algoritma pencarian kursor linear
   * ditambah dengan kalkulasi Interpolasi Linear (LERP) untuk rendering 60 FPS yang mulus.
   */
  getCachedDriverData(type, driverNumber, timestamp, interpolate) {
    if (typeof store.playback.startTime !== "number") return null;

    const absoluteTimeMillis = store.playback.startTime + timestamp;
    if (!isFinite(absoluteTimeMillis)) return null;

    const data = store.driverData[driverNumber]?.[type];
    if (!data || data.length === 0) return null;

    const key = String(driverNumber);

    // Ambil posisi kursor indeks terakhir, jika belum ada setel ke 0
    if (_cursorCache[type][key] === undefined) {
      _cursorCache[type][key] = 0;
    }

    let idx = _cursorCache[type][key];

    // Proteksi batas maksimal indeks array
    if (idx >= data.length) idx = data.length - 1;

    const currentTimestamp = data[idx].timestamp;

    // KONDISI A: Playback berjalan maju secara normal (Kasus paling sering terjadi - O(1))
    if (absoluteTimeMillis >= currentTimestamp) {
      // Geser kursor maju secara linear selama timestamp data berikutnya masih di bawah waktu target
      while (
        idx < data.length - 1 &&
        data[idx + 1].timestamp <= absoluteTimeMillis
      ) {
        idx++;
      }
    }
    // KONDISI B: Garis waktu melompat mundur atau melompat maju terlalu jauh (Manual Seek)
    else {
      // Lakukan fallback aman ke Binary Search bawaan replayEngine untuk re-orientasi kursor
      const fallbackEntry = replayEngine.findLatestEntry(
        data,
        absoluteTimeMillis
      );
      if (!fallbackEntry) return null;
      idx = data.indexOf(fallbackEntry);
    }

    // Simpan posisi kursor terbaru ke dalam cache memori
    _cursorCache[type][key] = idx;

    if (idx === -1) return null;

    const currentEntry = data[idx];

    // Jika fitur interpolasi dimatikan atau data berada di ujung akhir array, kembalikan data mentah
    if (!interpolate || idx === data.length - 1) {
      return currentEntry;
    }

    // PROSES LINEAR INTERPOLATION (LERP): Mengisi kekosongan data antar frame
    const nextEntry = data[idx + 1];
    const totalDuration = nextEntry.timestamp - currentEntry.timestamp;

    if (totalDuration <= 0) return currentEntry;

    // Hitung persentase posisi/progres waktu (bernilai antara 0.0 hingga 1.0)
    const factor =
      (absoluteTimeMillis - currentEntry.timestamp) / totalDuration;

    // Kloning objek entri saat ini untuk mempertahankan properti non-angka (seperti driver_number)
    const interpolatedEntry = { ...currentEntry };

    // Interpolasikan seluruh metrik bernilai angka secara dinamis (x, y, speed, rpm, dll)
    for (const prop in currentEntry) {
      if (
        prop !== "timestamp" &&
        typeof currentEntry[prop] === "number" &&
        typeof nextEntry[prop] === "number"
      ) {
        interpolatedEntry[prop] =
          currentEntry[prop] + (nextEntry[prop] - currentEntry[prop]) * factor;
      }
    }

    return interpolatedEntry;
  },
};

// Daftarkan event listener segera saat modul dimuat pertama kali
telemetryService.init();
