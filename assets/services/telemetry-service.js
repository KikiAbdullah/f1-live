import { store } from '../core/store.js';
import { replayEngine } from '../core/replay-engine.js';

export const telemetryService = {
    getDriverTelemetry(driverNumber, timestamp) {
        return replayEngine.getDriverData('telemetry', driverNumber, timestamp);
    },

    getDriverLocation(driverNumber, timestamp) {
        return replayEngine.getDriverData('locations', driverNumber, timestamp);
    },

    getAllLocations(timestamp) {
        const locations = {};
        for (const driver of store.drivers) {
            const loc = this.getDriverLocation(driver.driver_number, timestamp);
            if (loc) {
                locations[driver.driver_number] = loc;
            }
        }
        return locations;
    }
};
