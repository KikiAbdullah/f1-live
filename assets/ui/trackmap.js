import { store } from '../core/store.js';
import { eventBus } from '../core/event-bus.js';
import { telemetryService } from '../services/telemetry-service.js';

export class TrackMap {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        this.init();
    }

    init() {
        eventBus.on('playback:update', (timestamp) => this.update(timestamp));
        eventBus.on('session:ready', () => {
            this.calculateBounds();
            this.preRenderTrack();
            this.update(0);
        });
        eventBus.on('driver:selected', (driverNumber) => {
            store.setState('selectedDriver', driverNumber); // Update store
            this.update(store.playback.currentTime); // Re-render to highlight
        });
    }

    calculateBounds() {
        const locations = store.raceData.locations;
        if (!locations || locations.length === 0) return;

        this.bounds = locations.reduce((acc, loc) => ({
            minX: Math.min(acc.minX, loc.x),
            maxX: Math.max(acc.maxX, loc.x),
            minY: Math.min(acc.minY, loc.y),
            maxY: Math.max(acc.maxY, loc.y)
        }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

        this.resize();
    }

    preRenderTrack() {
        this.trackCanvas = document.createElement('canvas');
        this.trackCanvas.width = this.canvas.width;
        this.trackCanvas.height = this.canvas.height;
        const tCtx = this.trackCanvas.getContext('2d');

        if (!locations || locations.length === 0 || this.bounds.minX === Infinity) return;

        // Calculate aspect ratio of data and canvas
        const dataAspectRatio = (this.bounds.maxX - this.bounds.minX) / (this.bounds.maxY - this.bounds.minY);
        const canvasAspectRatio = this.canvas.width / this.canvas.height;

        let renderWidth, renderHeight;
        let offsetX = 0;
        let offsetY = 0;

        if (dataAspectRatio > canvasAspectRatio) {
            // Data is wider than canvas, fit to width
            renderWidth = this.canvas.width;
            renderHeight = renderWidth / dataAspectRatio;
            offsetY = (this.canvas.height - renderHeight) / 2;
        } else {
            // Data is taller than canvas, fit to height
            renderHeight = this.canvas.height;
            renderWidth = renderHeight * dataAspectRatio;
            offsetX = (this.canvas.width - renderWidth) / 2;
        }

        const scaleX = renderWidth / (this.bounds.maxX - this.bounds.minX);
        const scaleY = renderHeight / (this.bounds.maxY - this.bounds.minY);

        const transformX = (x) => offsetX + (x - this.bounds.minX) * scaleX;
        const transformY = (y) => offsetY + (this.bounds.maxY - y) * scaleY; // Invert Y-axis

        const sampleDriver = store.drivers[0]?.driver_number;
        const trackPoints = locations.filter(l => l.driver_number == sampleDriver);

        tCtx.beginPath();
        tCtx.strokeStyle = '#38383f';
        tCtx.lineWidth = 10;
        tCtx.lineCap = 'round';
        tCtx.lineJoin = 'round';

        if (trackPoints.length > 0) {
            tCtx.moveTo(transformX(trackPoints[0].x), transformY(trackPoints[0].y));
            for (let i = 1; i < trackPoints.length; i++) {
                tCtx.lineTo(transformX(trackPoints[i].x), transformY(trackPoints[i].y));
            }
        }
        tCtx.stroke();

        // Optional: Draw a start/finish line if known
        // For now, let's assume the first point of the sample driver is roughly the start line
        if (trackPoints.length > 0) {
            const startPoint = trackPoints[0];
            tCtx.beginPath();
            tCtx.strokeStyle = 'white';
            tCtx.lineWidth = 3;
            tCtx.moveTo(transformX(startPoint.x) - 10, transformY(startPoint.y) - 10);
            tCtx.lineTo(transformX(startPoint.x) + 10, transformY(startPoint.y) + 10);
            tCtx.stroke();
            tCtx.beginPath();
            tCtx.moveTo(transformX(startPoint.x) + 10, transformY(startPoint.y) - 10);
            tCtx.lineTo(transformX(startPoint.x) - 10, transformY(startPoint.y) + 10);
            tCtx.stroke();
        }
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
    }

    update(timestamp) {
        const currentLocations = telemetryService.getAllLocations(timestamp);
        this.draw(currentLocations);
    }

    draw(currentLocations) {
        if (!this.ctx || !this.bounds || this.bounds.minX === Infinity) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Calculate aspect ratio of data and canvas
        const dataAspectRatio = (this.bounds.maxX - this.bounds.minX) / (this.bounds.maxY - this.bounds.minY);
        const canvasAspectRatio = this.canvas.width / this.canvas.height;

        let renderWidth, renderHeight;
        let offsetX = 0;
        let offsetY = 0;

        if (dataAspectRatio > canvasAspectRatio) {
            // Data is wider than canvas, fit to width
            renderWidth = this.canvas.width;
            renderHeight = renderWidth / dataAspectRatio;
            offsetY = (this.canvas.height - renderHeight) / 2;
        } else {
            // Data is taller than canvas, fit to height
            renderHeight = this.canvas.height;
            renderWidth = renderHeight * dataAspectRatio;
            offsetX = (this.canvas.width - renderWidth) / 2;
        }

        const scaleX = renderWidth / (this.bounds.maxX - this.bounds.minX);
        const scaleY = renderHeight / (this.bounds.maxY - this.bounds.minY);

        const transformX = (x) => offsetX + (x - this.bounds.minX) * scaleX;
        const transformY = (y) => offsetY + (this.bounds.maxY - y) * scaleY; // Invert Y-axis

        // Draw pre-rendered track
        if (this.trackCanvas) {
            this.ctx.drawImage(this.trackCanvas, 0, 0, this.canvas.width, this.canvas.height); // Draw scaled to fit
        }

        for (const [driverNumber, loc] of Object.entries(currentLocations)) {
            const driver = store.drivers.find(d => String(d.driver_number) === String(driverNumber));
            const x = transformX(loc.x);
            const y = transformY(loc.y);

            this.ctx.beginPath();
            this.ctx.arc(x, y, 5, 0, Math.PI * 2);
            this.ctx.fillStyle = driver ? `#${driver.team_colour}` : 'white';
            
            if (String(driverNumber) === String(store.ui.selectedDriver)) {
                this.ctx.strokeStyle = 'cyan'; // Highlight color
                this.ctx.lineWidth = 3;
                this.ctx.arc(x, y, 7, 0, Math.PI * 2); // Larger circle for highlight
            } else {
                this.ctx.strokeStyle = 'white';
                this.ctx.lineWidth = 1;
                this.ctx.arc(x, y, 5, 0, Math.PI * 2);
            }
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.fillStyle = 'white';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(driver ? driver.name_acronym : driverNumber, x + 8, y + 4);
        }
    }
}
