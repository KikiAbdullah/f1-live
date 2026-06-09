import { eventBus } from "../core/event-bus.js";
import { replayEngine } from "../core/replay-engine.js";
import { store } from "../core/store.js";

export class WeatherDisplay {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.elements = {};

    this.handlePlaybackUpdate = this.handlePlaybackUpdate.bind(this);
    this.handleSessionReady = this.handleSessionReady.bind(this);

    this.init();
  }

  init() {
    if (!this.container) return;
    eventBus.on("playback:update", this.handlePlaybackUpdate);
    eventBus.on("session:ready", this.handleSessionReady);
    this.renderBase();
  }

  handlePlaybackUpdate(timestamp) {
    this.update(timestamp);
  }

  handleSessionReady() {
    this.renderBase();
    this.update(store.playback?.currentTime || 0);
  }

  renderBase() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="weather-info">
        <div class="weather-item">
          <span class="weather-label">Air</span>
          <span id="weather-air-temp" class="weather-value">--°C</span>
        </div>
        <div class="weather-item">
          <span class="weather-label">Track</span>
          <span id="weather-track-temp" class="weather-value">--°C</span>
        </div>
        <div class="weather-item">
          <span class="weather-label">Wind</span>
          <span id="weather-wind-speed" class="weather-value">-- km/h</span>
        </div>
        <div class="weather-item">
          <span class="weather-label">Dir</span>
          <span id="weather-wind-direction" class="weather-value">--</span>
        </div>
        <div class="weather-item">
          <span class="weather-label">Humidity</span>
          <span id="weather-humidity" class="weather-value">--%</span>
        </div>
        <div class="weather-item">
          <span class="weather-label">Pressure</span>
          <span id="weather-pressure" class="weather-value">-- hPa</span>
        </div>
      </div>
    `;

    this.elements = {
      airTemp: document.getElementById("weather-air-temp"),
      trackTemp: document.getElementById("weather-track-temp"),
      windSpeed: document.getElementById("weather-wind-speed"),
      windDirection: document.getElementById("weather-wind-direction"),
      humidity: document.getElementById("weather-humidity"),
      pressure: document.getElementById("weather-pressure"),
    };
  }

  update(timestamp) {
    if (!this.elements.airTemp) return;
    const weatherData = replayEngine.getCurrentData("weather", timestamp);
    if (!weatherData) {
      this.clearDisplay();
      return;
    }

    this.elements.airTemp.textContent = `${this.valueOrDash(weatherData.air_temp)}°C`;
    this.elements.trackTemp.textContent = `${this.valueOrDash(weatherData.track_temp)}°C`;
    this.elements.windSpeed.textContent = `${this.valueOrDash(weatherData.wind_speed)} km/h`;
    this.elements.windDirection.textContent =
      weatherData.wind_direction !== undefined ? `${weatherData.wind_direction}°` : "--";
    this.elements.humidity.textContent = `${this.valueOrDash(weatherData.humidity)}%`;
    this.elements.pressure.textContent = `${this.valueOrDash(weatherData.pressure)} hPa`;
  }

  valueOrDash(value) {
    return value !== undefined && value !== null ? value : "--";
  }

  clearDisplay() {
    this.elements.airTemp.textContent = "--°C";
    this.elements.trackTemp.textContent = "--°C";
    this.elements.windSpeed.textContent = "-- km/h";
    this.elements.windDirection.textContent = "--";
    this.elements.humidity.textContent = "--%";
    this.elements.pressure.textContent = "-- hPa";
  }

  destroy() {
    eventBus.off("playback:update", this.handlePlaybackUpdate);
    eventBus.off("session:ready", this.handleSessionReady);
    this.elements = {};
    if (this.container) this.container.innerHTML = "";
  }
}
