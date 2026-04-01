/**
 * Database — IndexedDB setup and connection layer.
 * Creates all object stores defined in the design.
 */

const DB_NAME = 'TrainingOpsDB';
const DB_VERSION = 4;

let dbInstance = null;

const STORES = [
  { name: 'users',              keyPath: 'id', indexes: [{ name: 'username', keyPath: 'username', unique: true }, { name: 'role', keyPath: 'role' }] },
  { name: 'sessions',           keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId' }] },
  { name: 'registrations',      keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId' }, { name: 'status', keyPath: 'status' }, { name: 'classId', keyPath: 'classId' }] },
  { name: 'registrationEvents', keyPath: 'id', indexes: [{ name: 'registrationId', keyPath: 'registrationId' }, { name: 'timestamp', keyPath: 'timestamp' }] },
  { name: 'classes',            keyPath: 'id', indexes: [{ name: 'instructorId', keyPath: 'instructorId' }] },
  { name: 'questions',          keyPath: 'id', indexes: [{ name: 'type', keyPath: 'type' }, { name: 'difficulty', keyPath: 'difficulty' }] },
  { name: 'quizzes',            keyPath: 'id', indexes: [{ name: 'classId', keyPath: 'classId' }] },
  { name: 'quizResults',        keyPath: 'id', indexes: [{ name: 'quizId', keyPath: 'quizId' }, { name: 'userId', keyPath: 'userId' }] },
  { name: 'reviews',            keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId' }, { name: 'targetUserId', keyPath: 'targetUserId' }, { name: 'direction', keyPath: 'direction' }] },
  { name: 'reports',            keyPath: 'id', indexes: [{ name: 'targetId', keyPath: 'targetId' }, { name: 'status', keyPath: 'status' }] },
  { name: 'contracts',          keyPath: 'id', indexes: [{ name: 'templateId', keyPath: 'templateId' }, { name: 'status', keyPath: 'status' }] },
  { name: 'templates',          keyPath: 'id', indexes: [{ name: 'active', keyPath: 'active' }] },
  { name: 'auditLogs',          keyPath: 'id', indexes: [{ name: 'entityType', keyPath: 'entityType' }, { name: 'entityId', keyPath: 'entityId' }, { name: 'timestamp', keyPath: 'timestamp' }] },
  { name: 'notifications',      keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId' }, { name: 'read', keyPath: 'read' }] },
  { name: 'reputationScores',   keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId' }] },
  { name: 'browsingHistory',    keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId' }, { name: 'timestamp', keyPath: 'timestamp' }] },
  { name: 'questionThreads',    keyPath: 'id', indexes: [{ name: 'authorId', keyPath: 'authorId' }] },
  { name: 'answers',            keyPath: 'id', indexes: [{ name: 'threadId', keyPath: 'threadId' }, { name: 'authorId', keyPath: 'authorId' }] },
  { name: 'favorites',          keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId' }, { name: 'itemType', keyPath: 'itemType' }] },
  { name: 'wrongQuestions',     keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId' }, { name: 'questionId', keyPath: 'questionId' }] },
  { name: 'ratings',            keyPath: 'id', indexes: [{ name: 'fromUserId', keyPath: 'fromUserId' }, { name: 'toUserId', keyPath: 'toUserId' }] },
  { name: 'appeals',            keyPath: 'id', indexes: [{ name: 'ratingId', keyPath: 'ratingId' }, { name: 'status', keyPath: 'status' }] },
  { name: 'images',             keyPath: 'id', indexes: [{ name: 'entityId', keyPath: 'entityId' }, { name: 'entityType', keyPath: 'entityType' }] },
  { name: 'documents',          keyPath: 'id', indexes: [{ name: 'contractId', keyPath: 'contractId' }, { name: 'type', keyPath: 'type' }] },
  { name: 'analyticsSnapshots', keyPath: 'id', indexes: [{ name: 'snapshotDate', keyPath: 'snapshotDate' }, { name: 'type', keyPath: 'type' }] },
];

/**
 * Opens (or creates) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
export function openDatabase() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      for (const storeDef of STORES) {
        if (db.objectStoreNames.contains(storeDef.name)) continue;

        const store = db.createObjectStore(storeDef.name, {
          keyPath: storeDef.keyPath,
        });

        if (storeDef.indexes) {
          for (const idx of storeDef.indexes) {
            store.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique });
          }
        }
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(new Error(`IndexedDB open failed: ${event.target.error}`));
    };
  });
}

/**
 * Returns the current DB instance (must call openDatabase first).
 */
export function getDatabase() {
  return dbInstance;
}

/**
 * Closes the database connection.
 */
export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Deletes the entire database (used for full reset / import).
 */
export function deleteDatabase() {
  closeDatabase();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

export { DB_NAME, DB_VERSION, STORES };
