import { levels } from "./levels";
import { compileSpritePack, MAX_SPRITE_FILE } from "./spritePack";
import {
  GameDisplay,
  readDisplayMode,
  readScalingMode,
  type ScalingMode,
  type DisplayMode,
} from "./display";
import { invoke } from "@tauri-apps/api/core";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile, stat } from "@tauri-apps/plugin-fs";

export type PlayerState = {
  loaded: boolean;
  recent: boolean;
  playing: boolean;
  busy: boolean;
  muted: boolean;
  spritePack: boolean;
  startingLives: number;
  selectedLevel: number;
  displayMode: DisplayMode;
  scalingMode: ScalingMode;
  shadersSupported: boolean;
  message: string;
  error: boolean;
};
export const initialState: PlayerState = {
  loaded: false,
  recent: false,
  playing: false,
  busy: false,
  muted: false,
  spritePack: false,
  startingLives: 0,
  selectedLevel: 0,
  displayMode: "original",
  scalingMode: "integer",
  shadersSupported: true,
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
  private display: GameDisplay;
  constructor(
    private canvas: HTMLCanvasElement,
    private changed: (state: PlayerState) => void,
  ) {
    this.display = new GameDisplay(canvas);
    this.update({ shadersSupported: this.display.supported });
    const displayMode = this.display.supported ? readDisplayMode() : "original";
    this.display.setMode(displayMode);
    this.update({ displayMode, scalingMode: readScalingMode() });
    try {
      const lives = Number(localStorage.getItem("starting-lives"));
      if (Number.isInteger(lives) && lives >= 0 && lives <= 9)
        this.update({ startingLives: lives });
    } catch {}
    void invoke<boolean>("sprite_pack_active")
      .then((spritePack) => this.update({ spritePack }))
      .catch(() => {});
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
  async chooseSpritePack() {
    if (this.state.busy) return;
    await this.pause();
    this.update({ busy: true, message: "", error: false });
    try {
      const path = await open({
        multiple: false,
        directory: false,
        title: "Choose a 2× sprite pack",
        filters: [
          { name: "Tintin sprite pack", extensions: ["tintinsprites"] },
        ],
      });
      if (!path) return;
      if ((await stat(path)).size > MAX_SPRITE_FILE)
        throw new Error("Sprite pack is too large.");
      const binary = await compileSpritePack(await readFile(path));
      await invoke("load_sprite_pack", binary);
      this.update({ spritePack: true });
      this.message("2× sprites loaded. Unmatched graphics use the originals.");
    } catch (error) {
      this.message(String(error), true);
    } finally {
      this.update({ busy: false });
    }
  }
  async clearSpritePack() {
    if (this.state.busy) return;
    this.update({ busy: true });
    try {
      await invoke("clear_sprite_pack");
      this.update({ spritePack: false });
      this.message("Original sprites restored.");
    } catch (error) {
      this.message(String(error), true);
    } finally {
      this.update({ busy: false });
    }
  }
  async setStartingLives(lives: number) {
    try {
      await invoke("set_starting_lives", { lives, applyCurrent: true });
      this.update({ startingLives: lives });
      try {
        localStorage.setItem("starting-lives", String(lives));
      } catch {}
      this.message(
        lives === 0
          ? "Game default applies to the next new game."
          : `Lives set to ${lives}.`,
      );
    } catch (error) {
      this.message(String(error), true);
    }
  }
  setScalingMode(scalingMode: ScalingMode) {
    this.display.setScaling(scalingMode);
    this.update({ scalingMode });
    try {
      localStorage.setItem("display-scaling", scalingMode);
    } catch {}
  }
  setDisplayMode(displayMode: DisplayMode) {
    this.display.setMode(displayMode);
    this.update({ displayMode });
    try {
      localStorage.setItem("display-mode", displayMode);
    } catch {}
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
      const originalLength = 8 + 160 * 144 * 4 + samples * 4;
      const hd = packet.byteLength === originalLength + 320 * 288 * 4;
      if (samples > 4096 || (!hd && packet.byteLength !== originalLength))
        throw new Error("Invalid game frame.");
      this.display.render(
        new Uint8Array(
          packet,
          hd ? originalLength : 8,
          hd ? 320 * 288 * 4 : 160 * 144 * 4,
        ),
        hd ? 320 : 160,
        hd ? 288 : 144,
      );
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
  selectLevel(selectedLevel: number) {
    if (!this.state.busy && levels.some((level) => level.id === selectedLevel))
      this.update({ selectedLevel });
  }
  async startLevel() {
    if (this.state.busy) return;
    if (!this.state.recent) {
      await this.choose(this.state.selectedLevel);
      return;
    }
    await this.pause();
    this.update({ busy: true, message: "Starting level…", error: false });
    try {
      await this.ensureAudio();
      await invoke("set_starting_lives", {
        lives: this.state.startingLives,
        applyCurrent: false,
      });
      await invoke("start_level", { scene: this.state.selectedLevel });
      this.display.clear();
      this.update({ loaded: true, busy: false, message: "", error: false });
      await this.resume();
    } catch (error) {
      this.update({ busy: false, message: String(error), error: true });
    }
  }
  async mainMenu() {
    if (this.state.busy) return;
    await this.pause();
    this.update({ busy: true });
    try {
      await invoke("save_game", { automatic: true });
      this.update({ loaded: false, recent: true, message: "", error: false });
    } catch (error) {
      this.message(String(error), true);
    } finally {
      this.update({ busy: false });
    }
  }
  async choose(level?: number) {
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
      await invoke("set_starting_lives", {
        lives: this.state.startingLives,
        applyCurrent: false,
      });
      const warning = await invoke<string>("load_rom", bytes);
      this.update({ recent: true });
      try {
        localStorage.setItem("last-rom-location", selected);
      } catch {}
      if (level !== undefined) {
        this.update({ message: "Starting level…" });
        await invoke("start_level", { scene: level });
      }
      this.display.clear();
      this.update({
        loaded: true,
        recent: true,
        busy: false,
        message: level === undefined ? warning : "",
        error: level === undefined && !!warning,
      });
      if (level !== undefined || !warning) await this.resume();
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
      await invoke("set_starting_lives", {
        lives: this.state.startingLives,
        applyCurrent: false,
      });
      const warning = await invoke<string>("load_recent");
      this.display.clear();
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
      const warning = await invoke<string>("restore_game");
      this.clearAudio();
      this.update({ busy: false, message: warning, error: false });
      if (wasPlaying) await this.resume();
    } catch (error) {
      this.update({ busy: false, message: String(error), error: true });
    }
  }
  async transferSave(importing: boolean) {
    if (!this.state.loaded || this.state.busy) return;
    await this.pause();
    this.update({ busy: true, message: "", error: false });
    try {
      const filters = [{ name: "Tintin save", extensions: ["tintinsave"] }];
      if (importing) {
        const path = await open({ multiple: false, directory: false, filters });
        if (!path) return;
        if ((await stat(path)).size > 1024 * 1024)
          throw new Error("This save file is too large.");
        await invoke("import_save", await readFile(path));
        this.message("Save imported. Choose Continue to play.");
      } else {
        const path = await saveDialog({
          defaultPath: "tintin.tintinsave",
          filters,
        });
        if (!path) return;
        const result = await invoke<ArrayBuffer | number[]>("export_save");
        await writeFile(path, new Uint8Array(result));
        this.message("Save exported.");
      }
    } catch (error) {
      this.message(String(error), true);
    } finally {
      this.update({ busy: false });
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
    this.display.dispose();
    await this.audio?.close();
    await invoke("unload_rom");
  }
}
