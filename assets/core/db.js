const DB_NAME = 'F1LiveDB';
const DB_VERSION = 1;

export const db = {
    _db: null,

    async open() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this._db = request.result;
                resolve(this._db);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('api_cache')) {
                    db.createObjectStore('api_cache');
                }
            };
        });
    },

    async get(key) {
        const database = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['api_cache'], 'readonly');
            const store = transaction.objectStore('api_cache');
            const request = store.get(key);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    },

    async set(key, value) {
        const database = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(['api_cache'], 'readwrite');
            const store = transaction.objectStore('api_cache');
            const request = store.put(value, key);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }
};
