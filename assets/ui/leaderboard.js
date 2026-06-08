import { store } from '../core/store.js';
import { eventBus } from '../core/event-bus.js';
import { positionService } from '../services/position-service.js';

export class Leaderboard {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.listElement = null; // Initialize listElement here
        this.init();
    }

    init() {
        eventBus.on('playback:update', (timestamp) => this.update(timestamp));
        eventBus.on('session:ready', () => {
            this.renderBase();
            this.update(store.playback.currentTime); // Use store.playback.currentTime for initial update
        });
        eventBus.on('driver:selected', (driverNumber) => this.highlightDriver(driverNumber));
    }

    renderBase() {
        if (!this.container) return;
        this.container.innerHTML = '<div class="leaderboard-list"></div>';
        this.listElement = this.container.querySelector('.leaderboard-list');
        this.bindClickEvents();
    }

    bindClickEvents() {
        if (!this.listElement) return;
        this.listElement.addEventListener('click', (event) => {
            const item = event.target.closest('.leaderboard-item');
            if (item) {
                const driverNumber = item.dataset.driverNumber;
                store.setState('selectedDriver', driverNumber);
                eventBus.emit('driver:selected', driverNumber);
            }
        });
    }

    highlightDriver(driverNumber) {
        if (!this.listElement) return;
        this.listElement.querySelectorAll('.leaderboard-item').forEach(item => {
            item.classList.remove('selected');
            if (item.dataset.driverNumber === String(driverNumber)) {
                item.classList.add('selected');
            }
        });
    }

    render(positions) {
        if (!positions || positions.length === 0 || !this.listElement) return;
        
        this.listElement.innerHTML = positions.map(p => `
            <div class="leaderboard-item ${String(p.driver_number) === String(store.ui.selectedDriver) ? 'selected' : ''} ${p.inPit ? 'in-pit' : ''}" 
                 style="border-left: 4px solid #${p.team_colour}"
                 data-driver-number="${p.driver_number}">
                <span class="pos" style="color: #${p.team_colour};">${p.position}</span>
                <span class="name">${p.broadcast_name}</span>
                <span class="team">${p.team_name}</span>
                <span class="gap">${p.gap}</span>
                <span class="lap-time">${positionService.formatLapTime(p.lastLapTime)}</span>
            </div>
        `).join('');
    }
}
