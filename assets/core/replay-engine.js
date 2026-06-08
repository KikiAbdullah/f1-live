import { F1Api } from './api.js';
import { store } from './store.js';
import { eventBus } from './event-bus.js';
import { timeline } from './timeline.js';

export const replayEngine = {
    async loadSession(sessionKey) {
        eventBus.emit('loading:start', 'Fetching session data...');
        
        try {
            // 1. Load basic info and Laps first to define session scope
            const drivers = await F1Api.fetchDrivers(sessionKey);
            store.drivers = drivers;
            
            const laps = await F1Api.fetchLaps(sessionKey);
            store.raceData.laps = laps;

            console.log('Initial laps loaded:', laps.length);

            if (laps.length > 0) {
                const startTimes = laps.map(l => l.date_start ? new Date(l.date_start).getTime() : null).filter(t => t !== null && !isNaN(t));
                const endTimes = laps.map(l => l.date_end ? new Date(l.date_end).getTime() : null).filter(t => t !== null && !isNaN(t));
                
                if (startTimes.length > 0) {
                    store.playback.startTime = Math.min(...startTimes);
                    console.log('Determined startTime from laps:', new Date(store.playback.startTime).toISOString());
                }
                if (endTimes.length > 0) {
                    store.playback.endTime = Math.max(...endTimes);
                    console.log('Determined endTime from laps:', new Date(store.playback.endTime).toISOString());
                }
            }

            // 2. Load non-driver specific data
            const globalItems = [
                { key: 'weather', fn: () => F1Api.fetchWeather(sessionKey) },
                { key: 'raceControl', fn: () => F1Api.fetchRaceControl(sessionKey) }
            ];

            for (const item of globalItems) {
                eventBus.emit('loading:start', `Fetching ${item.key}...`);
                store.raceData[item.key] = await item.fn();
            }

            // 3. Load driver-specific data (Position, Location, CarData, Stints, Pit)
            const driverDataTypes = ['positions', 'locations', 'telemetry', 'stints', 'pit'];
            
            for (const type of driverDataTypes) {
                store.raceData[type] = [];
            }

            const totalDrivers = drivers.length;
            let driversProcessed = 0;

            const dataTypes = [
                { name: 'Positions', fn: F1Api.fetchPositions, storeKey: 'positions' },
                { name: 'Locations', fn: F1Api.fetchLocations, storeKey: 'locations' },
                { name: 'Telemetry', fn: F1Api.fetchCarData, storeKey: 'telemetry' },
                { name: 'Stints', fn: F1Api.fetchStints, storeKey: 'stints' },
                { name: 'Pit', fn: F1Api.fetchPit, storeKey: 'pit' }
            ];

            for (const driver of drivers) {
                driversProcessed++;
                
                for (let i = 0; i < dataTypes.length; i++) {
                    const type = dataTypes[i];
                    const overallProgress = Math.round(((driversProcessed - 1) / totalDrivers * 100) + ((i / dataTypes.length) * (100 / totalDrivers)));
                    
                    eventBus.emit('loading:start', `[${overallProgress}%] Downloading ${type.name}: ${driver.name_acronym}`);
                    
                    const data = await type.fn(sessionKey, driver.driver_number);
                    store.raceData[type.storeKey].push(...data);
                }
            }
            
            eventBus.emit('loading:start', `[100%] Finalizing data...`);

            // Sort data by date after merging all drivers
            const sortFn = (a, b) => {
                if (!a.date || !b.date) return 0;
                const timeA = new Date(a.date).getTime();
                const timeB = new Date(b.date).getTime();
                if (isNaN(timeA) || isNaN(timeB)) return 0;
                return timeA - timeB;
            };

            store.raceData.positions.sort(sortFn);
            store.raceData.locations.sort(sortFn);
            store.raceData.telemetry.sort(sortFn);
            
            // Set session duration based on sorted data if laps didn't provide it clearly
            if (!store.playback.startTime || !store.playback.endTime || isNaN(store.playback.startTime) || isNaN(store.playback.endTime)) {
                console.log('Detecting time range from raw data (safe mode)...');
                
                let minTime = Infinity;
                let maxTime = -Infinity;

                const processArray = (arr) => {
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

                processArray(store.raceData.positions);
                processArray(store.raceData.locations);
                
                if (minTime !== Infinity && maxTime !== -Infinity) {
                    store.playback.startTime = minTime;
                    store.playback.endTime = maxTime;
                }
            }

            if (isNaN(store.playback.startTime) || isNaN(store.playback.endTime)) {
                console.error('Failed to determine session time range even with raw data');
            } else {
                store.playback.currentTime = 0; // Ensure it starts at 0
                
                try {
                    const startVal = store.playback.startTime;
                    const endVal = store.playback.endTime;
                    
                    if (isFinite(startVal) && isFinite(endVal)) {
                        const startISO = new Date(startVal).toISOString();
                        const endISO = new Date(endVal).toISOString();
                        console.log('Session range confirmed:', 
                            startISO, 
                            'to', 
                            endISO,
                            'Duration:', (endVal - startVal) / 1000, 'seconds'
                        );
                    } else {
                        console.error('Session range values are not finite:', startVal, endVal);
                    }
                } catch (e) {
                    console.error('Error formatting session range for log:', e);
                    // Fallback log without toISOString
                    console.log('Session range confirmed (raw):', store.playback.startTime, 'to', store.playback.endTime);
                }
            }

            console.log(`Data Loaded:
                Drivers: ${drivers.length}
                Laps: ${store.raceData.laps.length}
                Positions: ${store.raceData.positions.length}
                Locations: ${store.raceData.locations.length}
                Telemetry: ${store.raceData.telemetry.length}
            `);

            eventBus.emit('loading:success');
            eventBus.emit('session:ready');
        } catch (error) {
            console.error('Failed to load session:', error);
            eventBus.emit('loading:error', error.message);
        }
    },

    // Binary search for finding the latest entry <= absoluteTime
    findLatestEntry(data, absoluteTime) {
        if (!data || data.length === 0) return null;
        
        let low = 0;
        let high = data.length - 1;
        let result = null;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (data[mid].date <= absoluteTime) {
                result = data[mid];
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return result;
    },

    // Binary search optimized for driver-specific data
    findLatestDriverEntry(data, driverNumber, absoluteTime) {
        if (!data || data.length === 0) return null;
        
        let low = 0;
        let high = data.length - 1;
        let result = null;
        const dNum = String(driverNumber); // Ensure driver_number is string for consistent comparison

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const entry = data[mid];

            if (entry.date <= absoluteTime) {
                if (String(entry.driver_number) === dNum) {
                    result = entry; // Found a candidate for this driver within the time
                }
                low = mid + 1; // Look in the right half for a potentially later entry
            } else {
                high = mid - 1; // Look in the left half
            }
        }
        return result;
    },

    getCurrentData(type, timestamp) {
        if (typeof store.playback.startTime !== 'number') return null;
        const data = store.raceData[type];
        if (!data || data.length === 0) return null;

        const timeValue = store.playback.startTime + timestamp;
        if (!isFinite(timeValue)) return null;

        try {
            const dateObj = new Date(timeValue);
            if (isNaN(dateObj.getTime())) return null;
            const absoluteTime = dateObj.toISOString();
            
            return this.findLatestEntry(data, absoluteTime);
        } catch (e) {
            return null;
        }
    },

    getDriverData(type, driverNumber, timestamp) {
        if (typeof store.playback.startTime !== 'number') return null;
        const data = store.raceData[type];
        if (!data || data.length === 0) return null;

        const timeValue = store.playback.startTime + timestamp;
        if (!isFinite(timeValue)) return null;

        try {
            const dateObj = new Date(timeValue);
            if (isNaN(dateObj.getTime())) return null;
            const absoluteTime = dateObj.toISOString();
            
            return this.findLatestDriverEntry(data, driverNumber, absoluteTime);
        } catch (e) {
            return null;
        }
    }
};
