/**
 * Tiny shared utility for the "which microphone should Basics use?" setting.
 * The selected deviceId persists in localStorage; callers that capture audio
 * (voice-button, demo-recorder, ...) pass `preferredMicAudioConstraints()`
 * into `getUserMedia({ audio: ... })` so the user's pick is honored.
 *
 * When nothing is set we return `true`, which falls through to the OS's
 * default input device - matching old behavior.
 */

const STORAGE_KEY = "basics:mic-device-id";

export function getPreferredMicDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setPreferredMicDeviceId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(STORAGE_KEY, id);
  else window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Returns a constraints value suitable for `getUserMedia({ audio })`.
 * Uses `ideal` (not `exact`) so a stale saved id - e.g. the user unplugged
 * the device - doesn't fail the entire getUserMedia call; the browser
 * falls back to the system default.
 */
export function preferredMicAudioConstraints(): MediaTrackConstraints | true {
  const id = getPreferredMicDeviceId();
  if (!id) return true;
  return { deviceId: { ideal: id } };
}
