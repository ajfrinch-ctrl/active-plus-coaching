export class SyncFault extends Error {
  constructor(code) { super(code); this.code = code; }
}
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const secretField = /^(?:private_key|client_email|password|pin|pinHash|passwordHash|securityAnswer|token|refreshToken|credential|credentials)$/i;
export function validId(id) { return typeof id === 'string' && idPattern.test(id); }
export function principalKey(principal) {
  if (!validId(principal?.uid) || !validId(principal?.tenant)) throw new SyncFault('AUTH_REQUIRED');
  return `${principal.tenant}:${principal.uid}`;
}
export function validateOperation(item, policies) {
  if (!validId(item.id) || !validId(item.recordId) || !validId(item.deviceId)) throw new SyncFault('INVALID_ID');
  principalKey(item.principal);
  const policy = Object.hasOwn(policies, item.entity) && policies[item.entity];
  if (!policy || !['CREATE','UPDATE','DELETE'].includes(item.operation)) throw new SyncFault('ENTITY_NOT_ALLOWED');
  if (!Number.isSafeInteger(item.baseVersion) || item.baseVersion < 0) throw new SyncFault('INVALID_VERSION');
  if (!Number.isFinite(item.createdAt) || !Number.isFinite(item.updatedAt)) throw new SyncFault('INVALID_TIMESTAMP');
  if (item.operation === 'DELETE' && !policy.allowDelete) throw new SyncFault('DELETE_NOT_ALLOWED');
  const visit = (value, seen = new Set()) => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (!value || typeof value !== 'object' || seen.has(value)) throw new SyncFault('INVALID_PAYLOAD');
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) throw new SyncFault('INVALID_PAYLOAD');
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (secretField.test(key) || ['__proto__','constructor','prototype'].includes(key)) throw new SyncFault('SENSITIVE_PAYLOAD');
      visit(child, seen);
    }
    seen.delete(value);
  };
  visit(item.payload);
  if (JSON.stringify(item.payload).length > 128000) throw new SyncFault('PAYLOAD_TOO_LARGE');
  if (policy.validate && !policy.validate(item.payload, item.operation)) throw new SyncFault('INVALID_RECORD');
  return true;
}
export function retryable(error) {
  return ['NETWORK_ERROR','TIMEOUT','UNAVAILABLE','RATE_LIMITED'].includes(error?.code);
}
