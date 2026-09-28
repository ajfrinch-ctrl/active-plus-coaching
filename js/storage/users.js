/* Data Access Layer: Users and Staff Identity */
import {
  readStaffAccount,
  hasStaffSession,
  loadStaffAccount,
  authenticateStaff,
  createInitialAdmin,
  staffAccountRecordExists
} from '../staff-auth.js';
import {
  ensureDirectory,
  publicStaff,
  createStaff,
  updateStaff,
  setStaffStatus,
  resetStaffPassword,
  deleteStaff,
  authenticateDirectoryStaff
} from '../staff-directory.js';
import {
  loadAccount,
  saveAccount,
  hasSession,
  clearSession,
  reserveUsername,
  usernameTaken
} from '../storage.js';

export {
  readStaffAccount,
  hasStaffSession,
  loadStaffAccount,
  authenticateStaff,
  createInitialAdmin,
  staffAccountRecordExists,
  ensureDirectory,
  publicStaff,
  createStaff,
  updateStaff,
  setStaffStatus,
  resetStaffPassword,
  deleteStaff,
  authenticateDirectoryStaff,
  loadAccount,
  saveAccount,
  hasSession,
  clearSession,
  reserveUsername,
  usernameTaken
};
