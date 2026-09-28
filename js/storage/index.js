/* Central Data Layer (DAL) index for Active Plus.
   Provides unified, decoupled data access wrappers for future online/sync migration.
   Currently backed 100% by local storage / offline repositories. */

export * as migration from './migration.js';
export * as users from './users.js';
export * as students from './students.js';
export * as payments from './payments.js';
export * as notices from './notices.js';
export * as settings from './settings.js';
