import { F1Api } from "./api.js";
import { store } from "./store.js";
import { eventBus } from "./event-bus.js";
import { timeline } from "./timeline.js";

export const replayEngine = {
  async loadSession(sessionKey) {
    eventBus.emit("loading:start", "Fetching session data...");

    try {
      const drivers = await F1Api.fetchDrivers(sessionKey);
      store.drivers = drivers;

      const laps = await F1Api.fetchLaps(sessionKey);
      store.raceData.laps = laps;

      console.log("Initial laps loaded:", laps.length);

      if (laps.length > 0) {
        const startTimes = laps
          .map((l) => (l.date_start ? new Date(l.date_start).getTime() : null))
          .filter((t) => t !== null && !isNaN(t));
        const endTimes = laps
          .map((l) => (l.date_end ? new Date(l.date_end).getTime() : null))
          .filter((t) => t !== null && !isNaN(t));

        if (startTimes.length > 0)
          store.playback.startTime = Math.min(...startTimes);
        if (endTimes.length > 0) store.playback.endTime = Math.max(...endTimes);
      }

      const globalItems = [
        { key: "weather", fn: () => F1Api.fetchWeather(sessionKey) },
        { key: "raceControl", fn: () => F1Api.fetchRaceControl(sessionKey) },
      ];

      for (const item of globalItems) {
        eventBus.emit("loading:start", `Fetching ${item.key}...`);
        store.raceData[item.key] = await item.fn();
      }

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

      const driverDataTypes = [
        { name: "Positions", fn: F1Api.fetchPositions, storeKey: "positions" },
        { name: "Locations", fn: F1Api.fetchLocations, storeKey: "locations" },
        { name: "Telemetry", fn: F1Api.fetchCarData, storeKey: "telemetry" },
        { name: "Stints", fn: F1Api.fetchStints, storeKey: "stints" },
        { name: "Pit", fn: F1Api.fetchPit, storeKey: "pit" },
      ];

      const totalDrivers = drivers.length;
      const totalTasks = totalDrivers * driverDataTypes.length;
      let completedTasks = 0;

      for (const driver of drivers) {
        const driverFetches = driverDataTypes.map(async (type) => {
          let data = await type.fn(sessionKey, driver.driver_number);
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
          return data;
        });
        await Promise.all(driverFetches);
      }

      eventBus.emit("loading:start", `[100%] Finalizing data...`);

      ["laps", "weather", "raceControl"].forEach((key) => {
        store.raceData[key] = store.raceData[key]
          .map((entry) => ({
            ...entry,
            timestamp:
              entry.date || entry.date_start
                ? new Date(entry.date || entry.date_start).getTime()
                : null,
          }))
          .filter((e) => e.timestamp !== null);
      });

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

      if (
        !store.playback.startTime ||
        !store.playback.endTime ||
        isNaN(store.playback.startTime) ||
        isNaN(store.playback.endTime)
      ) {
        console.log("Detecting time range from raw data (safe mode)...");

        let minTime = Infinity;
        let maxTime = -Infinity;

        const processArray = (arr) => {
          if (!arr) return; // FIX: Mencegah error jika array undefined
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].date) {
              const t = new Date(arr[i].date).getTime();
              if (!isNaN(t)) {
                if (t < minTime) minTime = t;
                if (t > maxTime) maxTime = t;
              }
            }
          }
        };

        // FIX: Looping ke dalam driverData karena positions dan locations sekarang terikat ke driver
        for (const driverNum in store.driverData) {
          processArray(store.driverData[driverNum].positions);
          processArray(store.driverData[driverNum].locations);
        }

        if (minTime !== Infinity && maxTime !== -Infinity) {
          store.playback.startTime = minTime;
          store.playback.endTime = maxTime;
        }
      }

      if (isNaN(store.playback.startTime) || isNaN(store.playback.endTime)) {
        console.error(
          "Failed to determine session time range even with raw data"
        );
      } else {
        store.playback.currentTime = 0;

        try {
          if (
            isFinite(store.playback.startTime) &&
            isFinite(store.playback.endTime)
          ) {
            console.log(
              "Session range confirmed:",
              new Date(store.playback.startTime).toISOString(),
              "to",
              new Date(store.playback.endTime).toISOString(),
              "Duration:",
              (store.playback.endTime - store.playback.startTime) / 1000,
              "seconds"
            );
          }
        } catch (e) {
          console.error("Error formatting session range for log:", e);
        }
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
