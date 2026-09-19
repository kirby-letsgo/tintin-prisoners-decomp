/** Frontend-only display effects. The native frame and save data stay untouched. */
export const displayModes = {
  original: "Original pixels",
  smooth: "Smooth",
  lcd: "LCD grid",
  crt: "CRT scanlines",
} as const;
export type DisplayMode = keyof typeof displayModes;
export function readDisplayMode(): DisplayMode {
  try {
    const saved = localStorage.getItem("display-mode");
    if (saved && Object.hasOwn(displayModes, saved)) return saved as DisplayMode;
  } catch {}
  return "original";
}

const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = vec2((position.x + 1.0) * 0.5, (1.0 - position.y) * 0.5);
  gl_Position = vec4(position, 0.0, 1.0);
}`;
const fragmentSource = `
precision mediump float;
uniform sampler2D frame;
uniform int effect;
varying vec2 uv;
void main() {
  vec3 color = texture2D(frame, uv).rgb;
  vec2 pixel = fract(uv * vec2(160.0, 144.0));
  if (effect == 2) {
    float grid = 0.82 + 0.18 * step(0.16, pixel.x) * step(0.16, pixel.y);
    color = mix(color, vec3(0.12, 0.15, 0.10), 0.06) * grid;
  } else if (effect == 3) {
    float scanline = 0.78 + 0.22 * sin(pixel.y * 3.14159265);
    vec2 edge = uv * (1.0 - uv);
    float vignette = 0.8 + 0.2 * pow(16.0 * edge.x * edge.y, 0.25);
    color *= scanline * vignette;
  }
  gl_FragColor = vec4(color, 1.0);
}`;

export class GameDisplay {
  private gl: WebGLRenderingContext | null;
  private context2d: CanvasRenderingContext2D | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private mode: DisplayMode = "original";
  private lastFrame = new Uint8Array(160 * 144 * 4);
  private observer: ResizeObserver;
  private disposed = false;
  constructor(private canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false });
    if (this.gl) this.initialize();
    else this.context2d = canvas.getContext("2d", { alpha: false });
    canvas.addEventListener("webglcontextlost", this.lost);
    canvas.addEventListener("webglcontextrestored", this.restored);
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(canvas);
  }
  get supported() { return !!this.gl; }
  private lost = (event: Event) => { event.preventDefault(); };
  private restored = () => { if (!this.disposed) { this.initialize(); this.draw(); } };
  private initialize() {
    const gl = this.gl!;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Display shader failed: ${error}`);
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error("Display shader could not link.");
    gl.useProgram(this.program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 160, 144, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.lastFrame);
    gl.uniform1i(gl.getUniformLocation(this.program, "frame"), 0);
  }
  setMode(mode: DisplayMode) { this.mode = mode; this.draw(); }
  render(bytes: Uint8Array) { this.lastFrame.set(bytes); this.draw(); }
  private draw() {
    if (this.disposed) return;
    const gl = this.gl;
    if (!gl) {
      this.canvas.width = 160;
      this.canvas.height = 144;
      this.context2d?.putImageData(new ImageData(new Uint8ClampedArray(this.lastFrame), 160, 144), 0, 0);
      return;
    }
    if (gl.isContextLost()) return;
    // Fit an exact 10:9 surface. Keep effects aligned with game pixels, not letterboxes.
    const rect = this.canvas.getBoundingClientRect();
    const scale = Math.max(1, Math.min(8, Math.ceil(Math.min(rect.width / 160, rect.height / 144) * devicePixelRatio)));
    const width = 160 * scale, height = 144 * scale;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const filter = this.mode === "smooth" ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 160, 144, gl.RGBA, gl.UNSIGNED_BYTE, this.lastFrame);
    gl.uniform1i(gl.getUniformLocation(this.program!, "effect"), ["original", "smooth", "lcd", "crt"].indexOf(this.mode));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.lost);
    this.canvas.removeEventListener("webglcontextrestored", this.restored);
    this.gl?.deleteTexture(this.texture);
    this.gl?.deleteBuffer(this.buffer);
    this.gl?.deleteProgram(this.program);
  }
}
