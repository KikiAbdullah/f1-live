import { eventBus } from '../core/event-bus.js';
import { store } from '../core/store.js';

export class RaceFeed {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.lastProcessedIdx = -1;
        this.init();
    }

    init() {
        eventBus.on('playback:update', (timestamp) => this.update(timestamp));
        eventBus.on('playback:seek', () => this.lastProcessedIdx = -1);
    }

    update(timestamp) {
        if (!this.container) return;
        
        const absoluteTime = new Date(store.playback.startTime + timestamp).toISOString();
        const messages = store.raceData.raceControl
            .filter(m => m.date <= absoluteTime)
            .sort((a, b) => new Date(b.date) - new Date(a.date)); // Latest first

        this.render(messages.slice(0, 10)); // Show last 10 messages
    }

    render(messages) {
        this.container.innerHTML = messages.map(m => {
            let msgClass = '';
            if (m.flag) msgClass = `flag-${m.flag.toLowerCase()}`;
            
            const time = new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            return `
                <div class="feed-entry">
                    <span class="feed-time">[${time}]</span>
                    <span class="feed-msg ${msgClass}">${m.message}</span>
                </div>
            `;
        }).join('');
    }
}
