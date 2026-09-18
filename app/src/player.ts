import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile, stat } from "@tauri-apps/plugin-fs";

export type PlayerState = {
  loaded: boolean;
  recent: boolean;
  playing: boolean;
  busy: boolean;
  muted: boolean;
  message: string;
  error: boolean;
};
export const initialState: PlayerState = {
  loaded: false,
  recent: false,
  playing: false,
  busy: false,
  muted: false,
  message: "",
  error: false,
};
export const keyMap: Record<string, number> = {
  ArrowRight: 1,
  ArrowLeft: 2,
  ArrowUp: 4,
  ArrowDown: 8,
  KeyZ: 16,
  KeyX: 32,
  Backspace: 64,
  Enter: 128,
};
const FRAME_MS = (70224 / 4194304) * 1000;

/** Owns one in-flight native tick. React owns all visible state and controls. */
export class Player {
  state = { ...initialState };
  private held = new Map<string, number>();
  private generation = 0;
  private inFlight: Promise<void> | null = null;
  private audio: AudioContext | null = null;
  private gain: GainNode | null = null;
  private audioTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private deadline = 0;
  private image: ImageData;
  private ctx: CanvasRenderingContext2D;
  constructor(
    private canvas: HTMLCanvasElement,
    private changed: (state: PlayerState) => void,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;
    this.image = this.ctx.createImageData(160, 144);
    void invoke<boolean>("recent_available")
      .then((recent) => this.update({ recent }))
      .catch(() => {});
  }
  private update(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  private message(message: string, error = false) {
    this.update({ message, error });
  }
  press(source: string, value: number) {
    if (this.state.playing) this.held.set(source, value);
  }
  release(source: string) {
    this.held.delete(source);
  }
  clearInput() {
    this.held.clear();
  }
  private clearAudio() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {}
    }
    this.sources.clear();
    this.audioTime = 0;
  }
  private async ensureAudio() {
    try {
      if (!this.audio) {
        this.audio = new AudioContext({ sampleRate: 44100 });
        this.gain = this.audio.createGain();
        this.gain.gain.value = this.state.muted ? 0 : 0.65;
        this.gain.connect(this.audio.destination);
      }
      await this.audio.resume();
    } catch {
      this.message("Audio is unavailable. You can still play.");
    }
  }
  private queueAudio(packet: ArrayBuffer, count: number) {
    if (
      !this.audio ||
      this.audio.state !== "running" ||
      !this.gain ||
      !count ||
      this.state.muted
    )
      return;
    const view = new DataView(packet),
      buffer = this.audio.createBuffer(2, count, 44100);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < count; i++)
        data[i] =
          view.getInt16(8 + 160 * 144 * 4 + i * 4 + channel * 2, true) / 32768;
    }
    if (
      this.audioTime < this.audio.currentTime ||
      this.audioTime > this.audio.currentTime + 0.25
    )
      this.audioTime = this.audio.currentTime + 0.045;
    const source = this.audio.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
    source.start(this.audioTime);
    this.audioTime += buffer.duration;
  }
  private async frame(token: number) {
    if (!this.state.playing || token !== this.generation) return;
    try {
      let buttons = 0;
      for (const value of this.held.values()) buttons |= value;
      const result = await invoke<ArrayBuffer | number[]>("tick", { buttons });
      if (!this.state.playing || token !== this.generation) return;
      const packet =
        result instanceof ArrayBuffer ? result : new Uint8Array(result).buffer;
      if (packet.byteLength < 8 + 160 * 144 * 4)
        throw new Error("Incomplete game frame.");
      const samples = new DataView(packet).getUint32(0, true);
      if (
        samples > 4096 ||
        packet.byteLength !== 8 + 160 * 144 * 4 + samples * 4
      )
        throw new Error("Invalid game frame.");
      this.image.data.set(new Uint8Array(packet, 8, 160 * 144 * 4));
      this.ctx.putImageData(this.image, 0, 0);
      this.queueAudio(packet, samples);
    } catch (error) {
      this.generation++;
      this.clearInput();
      this.clearAudio();
      this.update({ playing: false, message: String(error), error: true });
    }
  }
  private schedule(token: number) {
    if (!this.state.playing || this.generation !== token) return;
    this.inFlight = this.frame(token);
    void this.inFlight.finally(() => {
      this.inFlight = null;
      if (!this.state.playing || this.generation !== token) return;
      this.deadline += FRAME_MS;
      if (this.deadline < performance.now() - FRAME_MS * 3)
        this.deadline = performance.now();
      setTimeout(
        () => this.schedule(token),
        Math.max(0, this.deadline - performance.now()),
      );
    });
  }
  async pause() {
    this.generation++;
    this.clearInput();
    this.clearAudio();
    this.update({ playing: false });
    if (this.inFlight) await this.inFlight;
  }
  async resume() {
    if (!this.state.loaded || this.state.busy || this.state.playing) return;
    await this.ensureAudio();
    this.deadline = performance.now();
    this.generation++;
    this.update({ playing: true });
    this.canvas.focus();
    this.schedule(this.generation);
  }
  async togglePause() {
    if (!this.state.busy)
      await (this.state.playing ? this.pause() : this.resume());
  }
  async choose() {
    if (this.state.busy) return;
    const wasPlaying = this.state.playing;
    await this.pause();
    this.update({ busy: true, message: "", error: false });
    await this.ensureAudio();
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Choose your Tintin ROM",
        defaultPath: this.lastLocation()?.startsWith("/")
          ? this.lastLocation()!
          : undefined,
        filters: [{ name: "Game Boy ROM", extensions: ["gbc", "gb"] }],
      });
      if (!selected) {
        this.update({ busy: false });
        if (wasPlaying) await this.resume();
        return;
      }
      const info = await stat(selected);
      if (info.size !== 1048576)
        throw new Error(
          "Choose the 1 MiB Europe edition of Tintin: Prisoners of the Sun.",
        );
      const bytes = await readFile(selected);
      const warning = await invoke<string>("load_rom", bytes);
      try {
        localStorage.setItem("last-rom-location", selected);
      } catch {}
      this.update({
        loaded: true,
        recent: true,
        busy: false,
        message: warning,
        error: !!warning,
      });
      if (!warning) await this.resume();
    } catch (error) {
      this.update({ busy: false, message: String(error), error: true });
      if (wasPlaying) await this.resume();
    }
  }
  lastLocation() {
    try {
      return localStorage.getItem("last-rom-location");
    } catch {
      return null;
    }
  }
  async openRecent() {
    if (this.state.busy) return;
    await this.pause();
    this.update({ busy: true, message: "", error: false });
    await this.ensureAudio();
    try {
      const warning = await invoke<string>("load_recent");
      this.update({
        loaded: true,
        busy: false,
        message: warning,
        error: !!warning,
      });
      if (!warning) await this.resume();
    } catch (error) {
      this.update({ busy: false, message: String(error), error: true });
    }
  }
  async save(automatic = false) {
    if (!this.state.loaded || this.state.busy) return;
    try {
      await invoke("save_game", { automatic });
      if (!automatic) {
        this.message("State saved.");
        setTimeout(() => {
          if (this.state.message === "State saved.") this.message("");
        }, 2000);
      }
    } catch (error) {
      this.reportError(String(error));
    }
  }
  async restore() {
    if (!this.state.loaded || this.state.busy) return;
    const wasPlaying = this.state.playing;
    await this.pause();
    this.update({ busy: true });
    try {
      await invoke("restore_game");
      this.clearAudio();
      this.update({ busy: false, message: "", error: false });
      if (wasPlaying) await this.resume();
    } catch (error) {
      this.update({ busy: false, message: String(error), error: true });
    }
  }
  reportError(message: string) {
    void this.pause();
    this.message(message, true);
  }
  async toggleSound() {
    this.update({ muted: !this.state.muted });
    this.clearAudio();
    await this.ensureAudio();
    if (this.gain) this.gain.gain.value = this.state.muted ? 0 : 0.65;
  }
  async dispose() {
    await this.pause();
    await this.audio?.close();
    await invoke("unload_rom");
  }
}
