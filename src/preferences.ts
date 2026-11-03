export function readPreference(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`ollang.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}
export function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(`ollang.${key}`, value);
  } catch {
    /* Playback still works when storage is unavailable. */
  }
}
