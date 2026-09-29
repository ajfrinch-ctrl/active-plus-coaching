/* RTDB removes empty arrays/objects and forbids punctuation in nested keys.
   Preserve these JSON shapes in collection records; old plain values still read.
   Reserved transport marker names in actual user data are escaped to avoid
   confusing a real field with a generated marker. */
import { encodeUsernameKey, decodeUsernameRegistry } from './username-sync-codec.js';
const ARRAY = '__apc_empty_array_v1__';
const OBJECT = '__apc_empty_object_v1__';
const NULL = '__apc_null_v1__';
const MARKS = [ARRAY, OBJECT, NULL];
const keyOf = key => {
  const encoded = encodeUsernameKey(key);
  return MARKS.includes(encoded) ? '%5F' + encoded.slice(1) : encoded;
};
function encode(value) {
  if (value === undefined) return undefined;      // JSON has no undefined
  if (value === null) return { [NULL]: true };    // RTDB would delete the node
  if (Array.isArray(value)) return value.length ? value.map(encode) : { [ARRAY]: true };
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, child]) => child !== undefined);
    return entries.length ? Object.fromEntries(entries.map(([key, child]) => [keyOf(key), encode(child)])) : { [OBJECT]: true };
  }
  return value;
}
function decode(value) {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && value[ARRAY] === true) return [];
    if (Object.keys(value).length === 1 && value[OBJECT] === true) return {};
    if (Object.keys(value).length === 1 && value[NULL] === true) return null;
    return Object.fromEntries(Object.entries(decodeUsernameRegistry(value)).map(([key, child]) => [key, decode(child)]));
  }
  return value;
}
export function encodeRealtimeRecords(records) {
  return Object.fromEntries(Object.entries(records).map(([id, value]) => [keyOf(id), encode(value)]));
}
export function decodeRealtimeRecords(records) {
  return Object.fromEntries(Object.entries(decodeUsernameRegistry(records)).map(([id, value]) => [id, decode(value)]));
}
