import { eventBus } from './event-bus.js';
import { store } from './store.js';

export const timeline = {
    timer: null,
    lastTick: 0,

    start() {
        console.log('Timeline: start requested');
        if (store.playback.isPlaying) return;
        
        if (typeof store.playback.startTime !== 'number') {
            console.error('Timeline: Cannot start, startTime is invalid:', store.playback.startTime);
            return;
        }

        store.playback.isPlaying = true;
        this.lastTick = performance.now();
        this.tick();
        eventBus.emit('playback:start');
        console.log('Timeline: started at', store.playback.currentTime);
    },

    pause() {
        store.playback.isPlaying = false;
        if (this.timer) {
            cancelAnimationFrame(this.timer);
            this.timer = null;
        }
        eventBus.emit('playback:pause');
    },

    seek(time) {
        store.playback.currentTime = Math.max(0, Math.min(time, store.playback.endTime - store.playback.startTime));
        eventBus.emit('playback:seek', store.playback.currentTime);
        this.update();
    },

    tick() {
        if (!store.playback.isPlaying) return;

        const now = performance.now();
        const delta = now - this.lastTick;
        this.lastTick = now;

        // Ensure we have a valid startTime
        if (typeof store.playback.startTime !== 'number') {
            console.warn('Playback started but startTime is not set');
            this.pause();
            return;
        }

        store.playback.currentTime += (delta * store.playback.speed);

        if (store.playback.currentTime >= (store.playback.endTime - store.playback.startTime)) {
            store.playback.currentTime = store.playback.endTime - store.playback.startTime;
            this.pause();
        }

        this.update();
        this.timer = requestAnimationFrame(() => this.tick());
    },

    update() {
        eventBus.emit('playback:update', store.playback.currentTime);
    },

    setSpeed(speed) {
        store.playback.speed = speed;
        eventBus.emit('playback:speed', speed);
    }
};
