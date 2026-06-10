import { F1Api } from "./api.js";
import { store } from "./store.js";
import { eventBus } from "./event-bus.js";
import { timeline } from "./timeline.js";

export const replayEngine = {
  resolveSessionWindow(sessionData, laps, raceControl, weather) {
    const parse = (value) => {
      const parsed = value ? new Date(value).getTime() : NaN;
      return Number.isFinite(parsed) ? parsed : null;
    };

    const rawStart = parse(sessionData?.date_start);
    const rawEnd = parse(sessionData?.date_end);
    const dataTimes = [];

    const collect = (rows, keys = ["date", "date_start", "date_end"]) => {
      (rows || []).forEach((row) => {
        for (const key of keys) {
          const timestamp = parse(row?.[key]);
          if (timestamp !== null) dataTimes.push(timestamp);
        }
      });
    };

    collect(laps, ["date_start", "date_end"]);
    collect(raceControl, ["date"]);
    collect(weather, ["date"]);

    const minData = dataTimes.length > 0 ? Math.min(...dataTimes) : null;
    const maxData = dataTimes.length > 0 ? Math.max(...dataTimes) : null;

    const isReasonableWindow = (start, end) =>
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start &&
      end - start <= 12 * 60 * 60 * 1000;

    let startTime = null;
    let endTime = null;

    if (isReasonableWindow(rawStart, rawEnd)) {
      startTime = rawStart;
      endTime = rawEnd;
    }

    if (minData !== null && maxData !== null) {
      if (!isReasonableWindow(startTime, endTime)) {
        startTime = minData;
        endTime = maxData;
      } else {
        startTime = Math.min(startTime, minData);
        endTime = Math.max(endTime, maxData);
      }
    }

    if (!isReasonableWindow(startTime, endTime)) {
      return { startTime: null, endTime: null, duration: 0 };
    }

    return {
      startTime,
      endTime,
      duration: Math.max(0, endTime - startTime),
    };
  },

  async loadSession(sessionKey) {
    eventBus.emit("loading:start", "Fetching session data...");
    store.reset();

    try {
      // 0. Fetch Session details to get circuit_key
      const sessionData = await F1Api.fetchSession(sessionKey);
      if (sessionData && sessionData.length > 0) {
        store.session = sessionData[0];
      }

      // 1. Ambil data awal esensial
      const drivers = await F1Api.fetchDrivers(sessionKey);
      store.drivers = drivers;

      const laps = await F1Api.fetchLaps(sessionKey);
      store.raceData.laps = laps;

      console.log("Initial laps loaded:", laps.length);

      // 2. OPTIMASI GLOBAL: Tarik data global (termasuk Stints & Pit) sekaligus secara paralel
      // Karena stints dan pit mengembalikan data seluruh driver, panggil di luar loop driver!
      const globalItems = [
        { key: "weather", fn: () => F1Api.fetchWeather(sessionKey) },
        { key: "raceControl", fn: () => F1Api.fetchRaceControl(sessionKey) },
        { key: "stints", fn: () => F1Api.fetchStints(sessionKey) },
        { key: "pit", fn: () => F1Api.fetchPit(sessionKey) },
      ];

      eventBus.emit(
        "loading:start",
        "Fetching global session data (Weather, Race Control, Stints, Pits)..."
      );
      const globalResults = await Promise.all(
        globalItems.map((item) => item.fn())
      );

      // Petakan hasil global ke store
      globalItems.forEach((item, index) => {
        store.raceData[item.key] = globalResults[index];
      });

      // --- PERBAIKAN: Normalisasi timestamp data global SEBELUM didistribusikan ---
      ["laps", "weather", "raceControl", "stints", "pit"].forEach((key) => {
        if (store.raceData[key]) {
          store.raceData[key] = store.raceData[key]
            .map((entry) => ({
              ...entry,
              timestamp:
                entry.date || entry.date_start
                  ? new Date(entry.date || entry.date_start).getTime()
                  : null,
            }))
            .filter((e) => e.timestamp !== null);
        }
      });

      // Fetch Circuit Info jika tersedia
      if (store.session && store.session.circuit_key) {
        try {
          const year = new Date(store.session.date_start).getFullYear();
          store.raceData.circuitInfo = await F1Api.fetchCircuitInfo(
            store.session.circuit_key,
            year
          );
        } catch (e) {
          console.warn("Failed to fetch circuit info:", e);
        }
      }

      // 3. Siapkan struktur data driver di store
      store.driverData = {};
      store.drivers.forEach((driver) => {
        store.driverData[driver.driver_number] = {
          positions: [],
          locations: [],
          telemetry: [],
          stints: [],
          pit: [],
        };
      });

      // Distribusikan data global Stints dan Pit yang tadi di-download ke masing-masing pembalap
      store.raceData.stints.forEach((stint) => {
        if (store.driverData[stint.driver_number])
          store.driverData[stint.driver_number].stints.push(stint);
      });
      store.raceData.pit.forEach((p) => {
        if (store.driverData[p.driver_number])
          store.driverData[p.driver_number].pit.push(p);
      });

      // 4. OPTIMASI DRIVER DATA: Sekarang hanya men-download data spesifik per individu (Positions, Locations, Telemetry)
      const driverDataTypes = [
        { name: "Positions", fn: F1Api.fetchPositions, storeKey: "positions" },
        { name: "Locations", fn: F1Api.fetchLocations, storeKey: "locations" },
        { name: "Telemetry", fn: F1Api.fetchCarData, storeKey: "telemetry" },
      ];

      const totalDrivers = drivers.length;
      const totalTasks = totalDrivers * driverDataTypes.length;
      let completedTasks = 0;

      // Jalankan request data kritikal pembalap secara paralel
      const allDriverTasks = drivers.map(async (driver) => {
        const driverFetches = driverDataTypes.map(async (type) => {
          try {
            let data = await type.fn(sessionKey, driver.driver_number);

            // Langsung inject timestamp di sini agar tidak looping dua kali nanti
            data = data
              .map((entry) => ({
                ...entry,
                timestamp: entry.date ? new Date(entry.date).getTime() : null,
              }))
              .filter((e) => e.timestamp !== null);

            store.setRaceData(type.storeKey, data, driver.driver_number);
            completedTasks++;

            const progress = Math.round((completedTasks / totalTasks) * 100);
            eventBus.emit(
              "loading:start",
              `[${progress}%] Downloading ${type.name}: ${driver.name_acronym}`
            );
          } catch (e) {
            console.error(
              `Failed to fetch ${type.name} for ${driver.driver_number}:`,
              e
            );
          }
        });
        return Promise.all(driverFetches);
      });

      await Promise.all(allDriverTasks);

      eventBus.emit("loading:start", `[100%] Finalizing & Sorting data...`);

      // 6. Sorting data secara efisien
      const sortFn = (a, b) => a.timestamp - b.timestamp;

      for (const driverNumber in store.driverData) {
        for (const key of [
          "positions",
          "locations",
          "telemetry",
          "stints",
          "pit",
        ]) {
          store.driverData[driverNumber][key].sort(sortFn);
        }
      }
      store.raceData.laps.sort(sortFn);
      store.raceData.weather.sort(sortFn);
      store.raceData.raceControl.sort(sortFn);
      store.raceData.stints.sort(sortFn);
      store.raceData.pit.sort(sortFn);

      // 7. Bangun window waktu sesi yang ketat agar tidak melebar jadi 24 jam
      const sessionWindow = this.resolveSessionWindow(
        store.session,
        store.raceData.laps,
        store.raceData.raceControl,
        store.raceData.weather
      );

      if (sessionWindow.startTime && sessionWindow.endTime) {
        store.playback.startTime = sessionWindow.startTime;
        store.playback.endTime = sessionWindow.endTime;
        store.playback.duration = sessionWindow.duration;
      }

      if (
        !store.playback.startTime ||
        !store.playback.endTime ||
        isNaN(store.playback.startTime) ||
        isNaN(store.playback.endTime)
      ) {
        console.log("Detecting time range from raw data (safe mode)...");

        let minTime = Infinity;
        let maxTime = -Infinity;

        for (const driverNum in store.driverData) {
          const pos = store.driverData[driverNum].positions;
          const loc = store.driverData[driverNum].locations;

          if (pos.length > 0) {
            if (pos[0].timestamp < minTime) minTime = pos[0].timestamp;
            if (pos[pos.length - 1].timestamp > maxTime)
              maxTime = pos[pos.length - 1].timestamp;
          }
          if (loc.length > 0) {
            if (loc[0].timestamp < minTime) minTime = loc[0].timestamp;
            if (loc[loc.length - 1].timestamp > maxTime)
              maxTime = loc[loc.length - 1].timestamp;
          }
        }

        if (minTime !== Infinity && maxTime !== -Infinity) {
          store.playback.startTime = minTime;
          store.playback.endTime = maxTime;
          store.playback.duration = maxTime - minTime;
        }
      }

      if (isNaN(store.playback.startTime) || isNaN(store.playback.endTime)) {
        console.error(
          "Failed to determine session time range even with raw data"
        );
      } else {
        store.playback.currentTime = 0;
        console.log(
          "Session range confirmed:",
          new Date(store.playback.startTime).toISOString(),
          "to",
          new Date(store.playback.endTime).toISOString()
        );
      }

      // Tampilkan ringkasan data PIT dari database saat pertama kali load
      if (store.raceData.pit && store.raceData.pit.length > 0) {
        console.log("%c[DATABASE] Semua Data Pit Stop Ditemukan:", "color: #f1c40f; font-weight: bold; font-size: 14px;");
        
        const formatTimeline = (totalSeconds) => {
          const h = Math.floor(totalSeconds / 3600);
          const m = Math.floor((totalSeconds % 3600) / 60);
          const s = Math.floor(totalSeconds % 60);
          return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        };

        const pitSummary = store.raceData.pit.map(p => {
          const virtualPosSec = (p.timestamp - store.playback.startTime) / 1000;
          return {
            "Driver #": p.driver_number,
            "Lap": p.lap_number,
            "Timeline Pos (H:M:S)": formatTimeline(virtualPosSec),
            "Duration (s)": p.pit_duration,
            "Clock Time": p.date
          };
        });
        console.table(pitSummary);
      }

      eventBus.emit("loading:success");
      eventBus.emit("session:ready");
    } catch (error) {
      console.error("Failed to load session:", error);
      eventBus.emit("loading:error", error.message);
    }
  },

  findLatestEntry(data, targetTimeMillis) {
    if (!data || data.length === 0) return null;
    let low = 0;
    let high = data.length - 1;
    let result = null;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const entryTime = data[mid].timestamp;

      if (entryTime <= targetTimeMillis) {
        result = data[mid];
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return result;
  },

  getDriverData(type, driverNumber, timestamp) {
    if (typeof store.playback.startTime !== "number") return null;
    const absoluteTimeMillis = store.playback.startTime + timestamp;
    if (!isFinite(absoluteTimeMillis)) return null;

    const driverSpecificData = store.driverData[driverNumber]?.[type];
    if (!driverSpecificData || driverSpecificData.length === 0) return null;

    return this.findLatestEntry(driverSpecificData, absoluteTimeMillis);
  },

  getCurrentData(type, timestamp) {
    if (typeof store.playback.startTime !== "number") return null;
    const data = store.raceData[type];
    if (!data || data.length === 0) return null;

    const absoluteTimeMillis = store.playback.startTime + timestamp;
    if (!isFinite(absoluteTimeMillis)) return null;

    return this.findLatestEntry(data, absoluteTimeMillis);
  },
};
