import { timeline } from '../core/timeline.js';
import { eventBus } from '../core/event-bus.js';
import { store } from '../core/store.js';

export class Controls {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.render();
        this.bindEvents();
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="controls-bar">
                <button id="play-pause">Play</button>
                <input type="range" id="timeline-slider" min="0" value="0" step="100">
                <span id="time-display">00:00:00</span>
                <select id="speed-select">
                    <option value="1">1x</option>
                    <option value="2">2x</option>
                    <option value="5">5x</option>
                    <option value="10">10x</option>
                    <option value="20">20x</option>
                </select>
            </div>
        `;
    }

    bindEvents() {
        const playBtn = this.container.querySelector('#play-pause');
        const slider = this.container.querySelector('#timeline-slider');
        const speedSelect = this.container.querySelector('#speed-select');

        playBtn.onclick = () => {
            console.log('Play button clicked, isPlaying:', store.playback.isPlaying);
            if (store.playback.isPlaying) {
                timeline.pause();
            } else {
                timeline.start();
            }
        };

        slider.oninput = (e) => {
            timeline.seek(parseInt(e.target.value));
        };

        speedSelect.onchange = (e) => {
            timeline.setSpeed(parseFloat(e.target.value));
        };

        eventBus.on('playback:start', () => playBtn.textContent = 'Pause');
        eventBus.on('playback:pause', () => playBtn.textContent = 'Play');
        eventBus.on('playback:update', (time) => {
            slider.value = time;
            this.updateTimeDisplay(time);
        });
        
        eventBus.on('session:ready', () => {
            const duration = store.playback.endTime - store.playback.startTime;
            slider.max = duration;
        });
    }

    updateTimeDisplay(ms) {
        const seconds = Math.floor(ms / 1000);
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        this.container.querySelector('#time-display').textContent = 
            `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
}
