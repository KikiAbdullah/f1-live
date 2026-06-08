import { eventBus } from '../core/event-bus.js';
import { store } from '../core/store.js';
import { telemetryService } from '../services/telemetry-service.js';

// Load Chart.js library dynamically
const loadChartJs = () => {
    return new Promise((resolve) => {
        if (typeof Chart !== 'undefined') {
            resolve(Chart);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = () => resolve(Chart);
        document.head.appendChild(script);
    });
};

export class TelemetryChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.chart = null;
        this.currentDriver = null;
        this.init();
    }

    async init() {
        await loadChartJs();
        eventBus.on('driver:selected', (driverNumber) => this.handleDriverSelection(driverNumber));
        eventBus.on('playback:update', (timestamp) => this.update(timestamp));
    }

    handleDriverSelection(driverNumber) {
        this.currentDriver = driverNumber;
        this.renderChart();
        this.update(store.playback.currentTime); // Update chart with current time
    }

    renderChart() {
        if (!this.ctx || !this.currentDriver) return;

        if (this.chart) {
            this.chart.destroy();
        }

        const driver = store.drivers.find(d => String(d.driver_number) === String(this.currentDriver));
        const teamColor = driver ? `#${driver.team_colour}` : '#ffffff';

        this.chart = new Chart(this.ctx, {
            type: 'line',
            data: {
                labels: [], // Time labels will be added dynamically
                datasets: [
                    {
                        label: 'Speed (km/h)',
                        data: [],
                        borderColor: teamColor,
                        backgroundColor: 'rgba(0,0,0,0)',
                        tension: 0.1,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Throttle (%)',
                        data: [],
                        borderColor: 'yellow',
                        backgroundColor: 'rgba(0,0,0,0)',
                        tension: 0.1,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Brake',
                        data: [],
                        borderColor: 'red',
                        backgroundColor: 'rgba(0,0,0,0)',
                        tension: 0.1,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'RPM',
                        data: [],
                        borderColor: 'lightblue',
                        backgroundColor: 'rgba(0,0,0,0)',
                        tension: 0.1,
                        hidden: true,
                        yAxisID: 'y2'
                    },
                    {
                        label: 'Gear',
                        data: [],
                        borderColor: 'lightgreen',
                        backgroundColor: 'rgba(0,0,0,0)',
                        tension: 0.1,
                        hidden: true,
                        yAxisID: 'y3'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 0 // Disable animation for real-time updates
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Time (seconds)',
                            color: 'white'
                        },
                        ticks: {
                            color: 'white'
                        },
                        grid: {
                            color: 'rgba(255,255,255,0.1)'
                        }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Speed (km/h)',
                            color: teamColor
                        },
                        ticks: {
                            color: teamColor
                        },
                        grid: {
                            color: 'rgba(255,255,255,0.1)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Throttle/Brake (%)',
                            color: 'yellow'
                        },
                        ticks: {
                            color: 'yellow'
                        },
                        grid: {
                            drawOnChartArea: false // Only draw the grid for the main Y axis
                        }
                    },
                    y2: {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'RPM',
                            color: 'lightblue'
                        },
                        ticks: {
                            color: 'lightblue'
                        },
                        grid: {
                            drawOnChartArea: false
                        },
                        display: false // Hidden by default
                    },
                     y3: {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Gear',
                            color: 'lightgreen'
                        },
                        ticks: {
                            color: 'lightgreen',
                            stepSize: 1
                        },
                        grid: {
                            drawOnChartArea: false
                        },
                        display: false // Hidden by default
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            color: 'white'
                        }
                    }
                }
            }
        });
    }

    update(timestamp) {
        if (!this.chart || !this.currentDriver) return;

        const telemetry = telemetryService.getDriverTelemetry(this.currentDriver, timestamp);
        if (!telemetry) return;

        // Convert current timestamp to seconds relative to start
        const timeInSeconds = timestamp / 1000;

        // Add new data point (keep chart responsive by limiting points)
        const maxDataPoints = 150; // Show about 2.5 minutes of data at 1x speed

        // Add data
        this.chart.data.labels.push(timeInSeconds.toFixed(1));
        this.chart.data.datasets[0].data.push(telemetry.speed);
        this.chart.data.datasets[1].data.push(telemetry.throttle);
        this.chart.data.datasets[2].data.push(telemetry.brake * 100); // Convert brake from 0-1 to 0-100%
        this.chart.data.datasets[3].data.push(telemetry.rpm);
        this.chart.data.datasets[4].data.push(telemetry.n_gear);

        // Remove old data points if exceeding max
        if (this.chart.data.labels.length > maxDataPoints) {
            this.chart.data.labels.shift();
            this.chart.data.datasets.forEach(dataset => dataset.data.shift());
        }

        this.chart.update();
    }
}
