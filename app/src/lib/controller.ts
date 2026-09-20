/** Standard Gamepad API layout: physical positions, independent of button labels. */
export type Pad = Pick<Gamepad, "index" | "id" | "connected" | "mapping" | "buttons" | "axes">;
export function readPad(pad: Pad) {
  const down = (i: number) => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value ?? 0) > 0.5;
  const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
  let buttons = 0;
  if (down(15) || x > 0.35) buttons |= 1;
  if (down(14) || x < -0.35) buttons |= 2;
  if (down(12) || y < -0.35) buttons |= 4;
  if (down(13) || y > 0.35) buttons |= 8;
  // Opposing inputs cancel rather than depending on polling order.
  if ((buttons & 3) === 3) buttons &= ~3;
  if ((buttons & 12) === 12) buttons &= ~12;
  if (down(0)) buttons |= 16;
  if (down(1)) buttons |= 32;
  if (down(8)) buttons |= 64;
  if (down(9)) buttons |= 128;
  return { buttons, menu: down(4), confirm: down(0), back: down(1) };
}

export class ControllerTracker {
  private key: string | null = null;
  private previous = { menu: false, confirm: false, back: false };
  sample(pads: readonly (Pad | null)[]) {
    const valid = pads.filter((p): p is Pad => !!p?.connected && p.mapping === "standard");
    const pad = valid.find(p => `${p.index}:${p.id}` === this.key) ?? valid[0];
    const key = pad ? `${pad.index}:${pad.id}` : null;
    const changed = key !== this.key;
    const disconnected = this.key !== null && changed;
    const current = pad ? readPad(pad) : { buttons: 0, menu: false, confirm: false, back: false };
    const result = { connected: !!pad, disconnected, buttons: current.buttons,
      menu: !changed && current.menu && !this.previous.menu,
      confirm: !changed && current.confirm && !this.previous.confirm,
      back: !changed && current.back && !this.previous.back };
    this.key = key;
    this.previous = current;
    return result;
  }
}

type ControllerPlayer = {
  state: { playing: boolean; loaded: boolean; busy: boolean };
  press(source: string, value: number): void;
  release(source: string): void;
  setControllerConnected(connected: boolean): void;
  togglePause(): Promise<void>;
  resume(): Promise<void>;
};

function menuTargets() {
  return Array.from(document.querySelectorAll<HTMLElement>("main button:not(:disabled), main select:not(:disabled), main summary"))
    .filter(el => !el.closest("[inert]") && el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== "hidden" &&
      (!el.closest("details:not([open])") || el.tagName === "SUMMARY"));
}
function navigate(direction: number) {
  const targets = menuTargets();
  if (!targets.length) return;
  const active = document.activeElement;
  if (active instanceof HTMLSelectElement && (direction === 1 || direction === 2)) {
    active.selectedIndex = Math.max(0, Math.min(active.options.length - 1,
      active.selectedIndex + (direction === 1 ? 1 : -1)));
    active.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const index = targets.indexOf(active as HTMLElement);
  const step = direction === 4 || direction === 2 ? -1 : 1;
  const next = index < 0 ? targets[0] : targets[(index + step + targets.length) % targets.length];
  next.focus();
  next.scrollIntoView({ block: "nearest" });
}

export function connectController(game: ControllerPlayer) {
  const tracker = new ControllerTracker();
  let request = 0, direction = 0, repeatAt = 0, suppressed = 0;
  let focused = document.hasFocus();
  const blur = () => { focused = false; game.release("controller"); if (game.state.playing) void game.togglePause(); };
  const focus = () => { focused = true; };
  window.addEventListener("blur", blur);
  window.addEventListener("focus", focus);
  function poll(now: number) {
    let pads: readonly (Gamepad | null)[] = [];
    try { pads = navigator.getGamepads?.() ?? []; } catch { /* Some WebViews disable the API. */ }
    const input = tracker.sample(pads);
    if (input.disconnected) game.setControllerConnected(false);
    game.setControllerConnected(input.connected);
    game.release("controller");
    if (document.hidden || !focused || game.state.busy || input.disconnected) {
      direction = 0;
    } else if (input.menu && game.state.loaded) {
      void game.togglePause();
      direction = 0;
    } else if (game.state.playing) {
      suppressed &= input.buttons;
      game.press("controller", input.buttons & ~suppressed);
      direction = 0;
    } else {
      const next = [4, 8, 2, 1].find(bit => input.buttons & bit) ?? 0;
      if (next && (next !== direction || now >= repeatAt)) {
        navigate(next);
        repeatAt = now + (next !== direction ? 350 : 120);
      }
      direction = next;
      if (input.back && game.state.loaded) { suppressed = input.buttons; void game.resume(); }
      else if (input.confirm) {
        suppressed = input.buttons;
        const targets = menuTargets();
        const target = targets.includes(document.activeElement as HTMLElement)
          ? document.activeElement as HTMLElement : targets[0];
        // Left/right changes selects without opening an OS menu that cannot be polled.
        if (target && !(target instanceof HTMLSelectElement)) target.click();
        else target?.focus();
      }
    }
    request = requestAnimationFrame(poll);
  }
  request = requestAnimationFrame(poll);
  return () => {
    cancelAnimationFrame(request);
    game.release("controller");
    window.removeEventListener("blur", blur);
    window.removeEventListener("focus", focus);
  };
}
