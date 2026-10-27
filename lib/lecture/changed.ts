/** Two same-size grayscale thumbnails (32×18) differ: mean absolute pixel difference, 0 to 1, over `threshold`. Browser-safe. */
export function imageChanged(a: Uint8Array, b: Uint8Array, threshold = 0.08): boolean {
  if (a.length !== b.length) throw new Error(`thumbnail sizes differ: ${a.length} vs ${b.length}`);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length / 255 > threshold;
}

/** One per lecture. True for the first thumbnail and for any that differs from the last one that returned true, so slow writing still adds up. */
export function changeTracker(threshold = 0.08): (thumb: Uint8Array) => boolean {
  let ref: Uint8Array | undefined;
  return (thumb) => {
    if (ref && !imageChanged(ref, thumb, threshold)) return false;
    ref = thumb;
    return true;
  };
}
