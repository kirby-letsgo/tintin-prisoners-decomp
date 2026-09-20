export type ScalingMode = "integer" | "fit";

export function readScalingMode(): ScalingMode {
  try {
    return localStorage.getItem("display-scaling") === "fit"
      ? "fit"
      : "integer";
  } catch {
    return "integer";
  }
}

/** All dimensions are physical pixels, including when rendering 2× artwork. */
export function frameViewport(
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
  mode: ScalingMode,
) {
  const fit = Math.min(width / sourceWidth, height / sourceHeight);
  // Tiny windows must shrink to keep the entire frame visible.
  const scale = mode === "integer" && fit >= 1 ? Math.floor(fit) : fit;
  const w = Math.max(1, Math.floor(sourceWidth * scale));
  const h = Math.max(1, Math.floor(sourceHeight * scale));
  return {
    x: Math.floor((width - w) / 2),
    y: Math.floor((height - h) / 2),
    width: w,
    height: h,
  };
}
