import { eventBus } from '../core/event-bus.js';
import { store } from '../core/store.js';

export class PitStopFeed {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.pitStops = [];
        this.init();
    }

    init() {
        eventBus.on('playback:update', (timestamp) => this.update(timestamp));
        eventBus.on('session:ready', () => {
            this.pitStops = store.raceData.pit.sort((a, b) => new Date(a.date) - new Date(b.date));
            this.render([]); // Clear feed on new session
        });
        eventBus.on('playback:seek', () => this.render([])); // Clear on seek
    }

    update(timestamp) {
        if (!this.container || !store.playback.startTime) return;

        const absoluteTime = new Date(store.playback.startTime + timestamp).toISOString();
        const currentPitStops = this.pitStops.filter(p => p.date <= absoluteTime);
        
        // Render only the latest pit stops that have occurred
        this.render(currentPitStops.slice(-5)); // Show last 5 pit stops
    }

    render(pitStops) {
        if (!this.container) return;

        if (pitStops.length === 0) {
            this.container.innerHTML = '<div class="feed-entry"><span class="feed-msg">No recent pit stops.</span></div>';
            return;
        }

        this.container.innerHTML = pitStops.map(p => {
            const driver = store.drivers.find(d => String(d.driver_number) === String(p.driver_number));
            const time = new Date(p.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            return `
                <div class="feed-entry">
                    <span class="feed-time">[${time}]</span>
                    <span class="feed-msg" style="color:#${driver?.team_colour || 'white'};">
                        ${driver?.name_acronym || p.driver_number} - Pit Stop (Lap ${p.lap_number || '?'})
                    </span>
                </div>
            `;
        }).join('');
    }
}
