export const WATCH_TRIGGER_REQUEST = 0x01;

export function isWatchTrigger(payload: Uint8Array): boolean {
  return payload.length === 1 && payload[0] === WATCH_TRIGGER_REQUEST;
}