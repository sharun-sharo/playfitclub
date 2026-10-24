/** One completed run may call the workout save path a single time. */
export function createOnce() {
  let used = false;
  return (save: () => void) => {
    if (used) return false;
    used = true;
    save();
    return true;
  };
}
