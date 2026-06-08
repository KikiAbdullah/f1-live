export const store = {
    session: null,
    drivers: [],
    raceData: {
        positions: [],
        locations: [],
        telemetry: [],
        laps: [],
        weather: [],
        raceControl: [],
        stints: [],
        pit: [],
        teamRadio: [],
        overtake: []
    },
    playback: {
        currentTime: 0,
        startTime: null,
        endTime: null,
        speed: 1,
        isPlaying: false
    },
    ui: {
        selectedDriver: null,
        activeTab: 'leaderboard'
    },

    setState(key, value) {
        this[key] = value;
        // In a real reactive store, we'd trigger updates here
    },

    setRaceData(data) {
        this.raceData = { ...this.raceData, ...data };
    }
};
