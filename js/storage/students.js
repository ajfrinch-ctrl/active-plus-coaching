/* Data Access Layer: Students Roster */
import {
  loadRoster,
  saveRoster,
  syncAccountStatus,
  upsertLocalAccount,
  ROSTER_KEY
} from '../office-data.js';
import {
  loadStudent,
  saveStudent,
  generateStudentId
} from '../storage.js';

export {
  loadRoster,
  saveRoster,
  syncAccountStatus,
  upsertLocalAccount,
  ROSTER_KEY,
  loadStudent,
  saveStudent,
  generateStudentId
};
