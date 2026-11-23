/** localStorage that never throws: blocked storage just forgets. */
export const remember = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`ruminate.${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(`ruminate.${key}`, value);
    } catch {
      /* ignore */
    }
  },
};
