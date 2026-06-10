import { store } from "../core/store.js";
import { replayEngine } from "../core/replay-engine.js";
import { eventBus } from "../core/event-bus.js";

// Objek memori lokal untuk melacak posisi indeks terakhir pencarian data (Kursor)
const _cursorCache = {
  positions: {},
  pit: {},
};

export const positionService = {
  init() {
    // Otomatis bersihkan cache kursor jika pengguna melakukan manual seek atau ganti sesi
    eventBus.on("playback:seek", () => this.resetCursors());
    eventBus.on("session:ready", () => this.resetCursors());
  },

  resetCursors() {
    _cursorCache.positions = {};
    _cursorCache.pit = {};
  },

  /**
   * ENGINE OPTIMASI UTAMA: Mengambil data posisi dengan algoritma pencarian kursor linear
   */
  getCachedDriverData(type, driverNumber, timestamp) {
    if (typeof store.playback.startTime !== "number") return null;
    const absoluteTimeMillis = store.playback.startTime + timestamp;

    // Ambil data spesifik driver dari store
    const data = store.driverData[driverNumber]?.[type];
    if (!data || data.length === 0) return null;

    const key = String(driverNumber);
    if (_cursorCache[type][key] === undefined) {
      _cursorCache[type][key] = 0;
    }

    let idx = _cursorCache[type][key];
    if (idx >= data.length) idx = data.length - 1;

    // KONDISI A: Jalur waktu berjalan maju secara kronologis (Kasus Utama - O(1))
    if (absoluteTimeMillis >= data[idx].timestamp) {
      while (
        idx < data.length - 1 &&
        data[idx + 1].timestamp <= absoluteTimeMillis
      ) {
        idx++;
      }
    }
    // KONDISI B: Pengguna melakukan manual seek mundur (Fallback - O(log N))
    else {
      const fallbackEntry = replayEngine.findLatestEntry(
        data,
        absoluteTimeMillis
      );
      if (!fallbackEntry) return null;
      idx = data.indexOf(fallbackEntry);
    }

    _cursorCache[type][key] = idx;
    return data[idx];
  },

  /**
   * Mengambil daftar posisi terkini seluruh pembalap (Leaderboard) beserta gap & status pit
   */
  getLatestPositions(timestamp) {
    const drivers = store.drivers;
    if (!drivers || drivers.length === 0) return [];

    const positions = [];
    const absoluteTimeMillis = (store.playback.startTime || 0) + timestamp;

    // FIX LOGIKA STRUKTUR DATA: Ambil data global laps dari store.raceData.laps
    const allLaps = store.raceData?.laps || [];

    for (let i = 0; i < drivers.length; i++) {
      const driver = drivers[i];
      const driverNum = driver.driver_number;

      // Ambil data posisi & pit stop menggunakan Cached Service (O(1))
      const pos = this.getCachedDriverData("positions", driverNum, timestamp);
      const pitStop = this.getCachedDriverData("pit", driverNum, timestamp);

      if (!pos) continue;

      // FIX STRUKTUR PENCARIAN DATA LAP: Cari entri lap terakhir milik pembalap ini berdasarkan timestamp
      // Karena data allLaps berskala global, kita filter manual berdasarkan driver dan batas waktu
      let currentLap = null;
      for (let j = allLaps.length - 1; j >= 0; j--) {
        const lap = allLaps[j];
        if (lap.driver_number === driverNum) {
          const lapStart = lap.date_start
            ? new Date(lap.date_start).getTime()
            : 0;
          if (lapStart <= absoluteTimeMillis) {
            currentLap = lap;
            break;
          }
        }
      }

      // FIX LOGIKA STATUS PIT: Memastikan pembalap dianggap di dalam pit
      // hanya jika ia berada di lap yang sama dengan event pit stop terakhir, dan event pit tersebut belum terlalu usang
      let inPit = false;
      if (pitStop && currentLap) {
        const pitTime = pitStop.timestamp;
        const lapStart = currentLap.date_start
          ? new Date(currentLap.date_start).getTime()
          : 0;
        // Jika waktu mobil masuk pit terjadi setelah lap ini dimulai
        inPit =
          pitTime >= lapStart && pitStop.lap_number === currentLap.lap_number;
      }

      positions.push({
        ...driver,
        position: pos.position,
        date: pos.date,
        lastLapTime: currentLap?.lap_duration || null,
        currentLapNumber: currentLap?.lap_number || 0,
        lapStartTime: currentLap?.date_start ? new Date(currentLap.date_start).getTime() : 0,
        absoluteTimestamp: pos.timestamp ? new Date(pos.timestamp).getTime() : 0,
        inPit: inPit,
      });
    }

    // Urutkan pembalap berdasarkan urutan posisi klasemen P1, P2, P3...
    positions.sort((a, b) => a.position - b.position);

    // HITUNG GAP / INTERVAL ANTAR PEMBALAP secara aman
    if (positions.length > 0) {
      const leader = positions[0];
      leader.gap = "Interval";
      leader.interval = "Interval";

      // PRE-CALCULATE TRACK DISTANCE FOR ALL DRIVERS
      // Menggunakan data telemetry X,Y untuk memproyeksikan posisi relatif di sirkuit
      const trackPoints = store.driverData[leader.driver_number]?.locations || [];
      
      const getProgressOnTrack = (driverNum, timestamp) => {
          const loc = store.driverData[driverNum]?.locations;
          if (!loc) return 0;
          // Cari index lokasi saat ini
          const absTime = (store.playback.startTime || 0) + timestamp;
          let idx = 0;
          for(let i=0; i < loc.length; i++) {
              if (loc[i].timestamp <= absTime) idx = i;
              else break;
          }
          return idx / loc.length; // Progress kasar (0.0 - 1.0)
      };

      for (let i = 1; i < positions.length; i++) {
        const p = positions[i];
        const prev = positions[i - 1];

        // LOGIKA GAP BROADCST F1 (REALTIME INTERPOLATION)
        const lapDeficit = leader.currentLapNumber - p.currentLapNumber;

        if (lapDeficit > 0) {
          p.gap = `+${lapDeficit} ${lapDeficit === 1 ? "Lap" : "Laps"}`;
          p.interval = `+${lapDeficit} ${lapDeficit === 1 ? "Lap" : "Laps"}`;
        } else {
          // Hitung gap dinamis berdasarkan selisih waktu mutlak saat ini
          // Di F1 asli, gap dihitung berdasarkan 'last common point' 
          // Di sini kita gunakan interpolasi waktu antar kendaraan untuk efek "running clock"
          
          const calculateRunningGap = (target, reference) => {
              const diff = (target.absoluteTimestamp - reference.absoluteTimestamp) / 1000;
              // Tambahkan jitter mikro (0.01 - 0.05) untuk mensimulasikan live sensor update
              const jitter = (Math.random() * 0.04); 
              return Math.max(0.001, Math.abs(diff) + (store.playback.isPlaying ? jitter : 0));
          };

          const gapTime = calculateRunningGap(p, leader);
          p.gap = `+${gapTime.toFixed(3)}s`;

          const intervalTime = calculateRunningGap(p, prev);
          p.interval = `+${intervalTime.toFixed(3)}s`;
        }
      }
    }

    return positions;
  },

  /**
   * Helper untuk memformat waktu (contoh: 83.456 menjadi "1:23.456")
   */
  formatLapTime(seconds) {
    if (!seconds || isNaN(seconds)) return "--:--.---";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const formattedSeconds = remainingSeconds.toFixed(3);
    return `${minutes}:${formattedSeconds.padStart(6, "0")}`;
  },
};

// Daftarkan event listener segera saat modul dimuat pertama kali
positionService.init();
