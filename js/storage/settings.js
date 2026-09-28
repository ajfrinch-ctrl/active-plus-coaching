/* Data Access Layer: Settings and App Configuration */
import {
  loadAppConfig,
  saveAppConfig,
  isSecurityCheckDisabled,
  setSecurityCheckDisabled,
  isTrustedDevice,
  setTrustedDevice
} from '../storage.js';
import {
  DEFAULT_APP_SETTINGS,
  STORAGE_KEYS
} from '../config.js';

export {
  loadAppConfig,
  saveAppConfig,
  isSecurityCheckDisabled,
  setSecurityCheckDisabled,
  isTrustedDevice,
  setTrustedDevice,
  DEFAULT_APP_SETTINGS,
  STORAGE_KEYS
};
