import { F1Api } from '../core/api.js';
import { eventBus } from '../core/event-bus.js';
import { store } from '../core/store.js';

export class SessionSelector {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentYear = new Date().getFullYear(); // Default to current year
        this.sessions = [];
        this.init();
    }

    async init() {
        this.renderBase();
        await this.fetchAndRenderYears();
        this.bindEvents();
    }

    renderBase() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="session-selector">
                <div class="selector-controls">
                    <select id="year-select"></select>
                    <select id="session-select" disabled></select>
                </div>
                <button id="load-session-btn" disabled>Load Session</button>
            </div>
            <div id="session-list" class="session-list"></div>
        `;
    }

    async fetchAndRenderYears() {
        const yearSelect = this.container.querySelector('#year-select');
        const currentYear = new Date().getFullYear();
        const startYear = 2018; // OpenF1 data starts around 2018

        for (let year = currentYear; year >= startYear; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        }
        yearSelect.value = this.currentYear; // Select current year by default
        await this.fetchAndRenderSessions(this.currentYear);
    }

    async fetchAndRenderSessions(year) {
        this.container.querySelector('#session-select').disabled = true;
        this.container.querySelector('#load-session-btn').disabled = true;
        this.sessions = [];

        eventBus.emit('loading:start', `Fetching sessions for ${year}...`);
        try {
            const allSessions = await F1Api.fetchSessions(year, '%'); // Fetch all session types
            
            // Filter to show only 'Race', 'Qualifying', 'Sprint', 'Practice'
            this.sessions = allSessions.filter(s => 
                ['Race', 'Qualifying', 'Sprint', 'Practice'].includes(s.session_name)
            ).sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime()); // Latest first

            const sessionSelect = this.container.querySelector('#session-select');
            sessionSelect.innerHTML = '<option value="">Select a Session</option>'; // Clear previous options

            this.sessions.forEach(s => {
                const option = document.createElement('option');
                option.value = s.session_key;
                option.textContent = `${s.session_name} - ${s.meeting_name} (${new Date(s.date_start).toLocaleDateString()})`;
                sessionSelect.appendChild(option);
            });
            sessionSelect.disabled = false;
        } catch (error) {
            console.error('Failed to fetch sessions:', error);
            eventBus.emit('loading:error', 'Failed to load sessions. Try again.');
        } finally {
            eventBus.emit('loading:success');
        }
    }

    bindEvents() {
        const yearSelect = this.container.querySelector('#year-select');
        const sessionSelect = this.container.querySelector('#session-select');
        const loadButton = this.container.querySelector('#load-session-btn');

        yearSelect.onchange = async (e) => {
            this.currentYear = parseInt(e.target.value);
            await this.fetchAndRenderSessions(this.currentYear);
        };

        sessionSelect.onchange = (e) => {
            const selectedSessionKey = parseInt(e.target.value);
            if (selectedSessionKey) {
                loadButton.disabled = false;
                const selectedSession = this.sessions.find(s => s.session_key === selectedSessionKey);
                store.session = selectedSession; // Store selected session info
            } else {
                loadButton.disabled = true;
                store.session = null;
            }
        };

        loadButton.onclick = () => {
            if (store.session) {
                eventBus.emit('session:load', store.session.session_key);
            }
        };

        eventBus.on('session:load', (sessionKey) => {
            // Clear current replay state
            store.playback.currentTime = 0;
            store.playback.isPlaying = false;
            store.playback.startTime = null;
            store.playback.endTime = null;
            store.drivers = [];
            Object.keys(store.raceData).forEach(key => store.raceData[key] = []);

            // Clear IndexedDB cache for new session data
            // indexedDB.deleteDatabase('F1LiveDB'); // May not be desired to clear everything, just the relevant keys

            // Re-load the session
            location.reload(); // Simplest way to restart with fresh data after selecting new session
        });
    }
}
