class EventBus {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  // Tambahan: Method 'once' sangat berguna (misalnya untuk menunggu 'loading:success' hanya sekali per klik)
  once(event, callback) {
    const wrapper = (data) => {
      callback(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(
      (cb) => cb !== callback
    );
  }

  emit(event, data) {
    if (!this.listeners[event]) return;

    // Perbaikan: Mencegah satu UI yang error menghentikan seluruh update UI lainnya
    this.listeners[event].forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(
          `EventBus: Error executing listener for event '${event}'`,
          error
        );
      }
    });
  }
}

export const eventBus = new EventBus();
