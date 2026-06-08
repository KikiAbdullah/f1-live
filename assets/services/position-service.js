import { store } from '../core/store.js';
import { replayEngine } from '../core/replay-engine.js';

export const positionService = {
    getLatestPositions(timestamp) {
        const drivers = store.drivers;
        const positions = [];
        let leaderTime = null;

        for (const driver of drivers) {
            const pos = replayEngine.getDriverData('positions', driver.driver_number, timestamp);
            // We need the lap data for duration/lap number at the current timestamp
            const lapData = replayEngine.getDriverData('laps', driver.driver_number, timestamp); 
            // Find the most recent pit stop for this driver
            const pitStop = replayEngine.getDriverData('pit', driver.driver_number, timestamp);

            if (pos) {
                const driverPos = {
                    ...driver,
                    position: pos.position,
                    date: pos.date,
                    lastLapTime: lapData?.lap_duration || null,
                    currentLapNumber: lapData?.lap_number || 0,
                    totalLapTime: lapData?.duration_s || 0, // Total time in seconds
                    inPit: !!pitStop && pitStop.lap_number === lapData?.lap_number // Simple check if pit occurred on current lap
                };
                positions.push(driverPos);

                if (pos.position === 1) {
                    leaderTime = driverPos.totalLapTime;
                }
            }
        }

        positions.sort((a, b) => a.position - b.position);

        // Calculate gaps
        if (leaderTime !== null) {
            for (let i = 0; i < positions.length; i++) {
                const p = positions[i];
                if (p.position !== 1) {
                    const gap = p.totalLapTime - leaderTime;
                    p.gap = `+${gap.toFixed(3)}`; // Format as +X.XXXs
                } else {
                    p.gap = ''; // Leader has no gap
                }
            }
        }

        return positions;
    },

    // Helper to format time (e.g., 1:23.456)
    formatLapTime(seconds) {
        if (!seconds) return '';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        const formattedSeconds = remainingSeconds.toFixed(3);
        return `${minutes}:${formattedSeconds.padStart(6, '0')}`;
    }
};
