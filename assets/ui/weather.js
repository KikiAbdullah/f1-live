import { eventBus } from '../core/event-bus.js';
import { store } from '../core/store.js';
import { replayEngine } from '../core/replay-engine.js';

export class WeatherDisplay {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.init();
    }

    init() {
        eventBus.on('playback:update', (timestamp) => this.update(timestamp));
        eventBus.on('session:ready', () => this.renderBase());
    }

    renderBase() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="weather-info">
                <div class="weather-item">
                    <span class="weather-label">Air Temp:</span>
                    <span id="air-temp" class="weather-value">--°C</span>
                </div>
                <div class="weather-item">
                    <span class="weather-label">Track Temp:</span>
                    <span id="track-temp" class="weather-value">--°C</span>
                </div>
                <div class="weather-item">
                    <span class="weather-label">Wind Speed:</span>
                    <span id="wind-speed" class="weather-value">-- km/h</span>
                </div>
                <div class="weather-item">
                    <span class="weather-label">Wind Dir:</span>
                    <span id="wind-direction" class="weather-value">--</span>
                </div>
                <div class="weather-item">
                    <span class="weather-label">Humidity:</span>
                    <span id="humidity" class="weather-value">--%</span>
                </div>
                <div class="weather-item">
                    <span class="weather-label">Pressure:</span>
                    <span id="pressure" class="weather-value">-- hPa</span>
                </div>
            </div>
        `;
    }

    update(timestamp) {
        const weatherData = replayEngine.getCurrentData('weather', timestamp);
        if (weatherData) {
            document.getElementById('air-temp').textContent = `${weatherData.air_temp || '--'}°C`;
            document.getElementById('track-temp').textContent = `${weatherData.track_temp || '--'}°C`;
            document.getElementById('wind-speed').textContent = `${weatherData.wind_speed || '--'} km/h`;
            document.getElementById('wind-direction').textContent = `${weatherData.wind_direction || '--'}`;
            document.getElementById('humidity').textContent = `${weatherData.humidity || '--'}%`;
            document.getElementById('pressure').textContent = `${weatherData.pressure || '--'} hPa`;
        } else {
            // Clear or set to default if no data
            document.getElementById('air-temp').textContent = `--°C`;
            document.getElementById('track-temp').textContent = `--°C`;
            document.getElementById('wind-speed').textContent = `-- km/h`;
            document.getElementById('wind-direction').textContent = `--`;
            document.getElementById('humidity').textContent = `--%`;
            document.getElementById('pressure').textContent = `-- hPa`;
        }
    }
}
