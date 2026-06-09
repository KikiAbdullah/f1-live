export const store = {
  session: null,
  drivers: [],
  driverData: {},
  raceData: {
    laps: [],
    weather: [],
    raceControl: [],
  },
  playback: {
    currentTime: 0,
    startTime: null,
    endTime: null,
    speed: 1,
    isPlaying: false,
  },
  ui: {
    selectedDriver: null,
    activeTab: "leaderboard",
  },
  sessionCache: {},

  // Tambahan: Method reset sangat krusial agar tidak ada data bocor saat user mengganti sesi balapan
  reset() {
    this.session = null;
    this.drivers = [];
    this.driverData = {};
    this.raceData = { laps: [], weather: [], raceControl: [] };
    this.playback = {
      currentTime: 0,
      startTime: null,
      endTime: null,
      speed: 1,
      isPlaying: false,
    };
    this.ui.selectedDriver = null;
  },

  setState(key, value) {
    this[key] = value;
  },

  setRaceData(key, data, driverNumber = null) {
    if (driverNumber !== null) {
      if (!this.driverData[driverNumber]) {
        this.driverData[driverNumber] = {};
      }
      this.driverData[driverNumber][key] = data;
    } else {
      this.raceData[key] = data;
    }
  },
};
