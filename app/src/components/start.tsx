import { menu } from "./menu-styles";
import type { Player, PlayerState } from "../lib/player";
import { levels } from "../lib/levels";
import cartridge from "../../src-tauri/icons/icon.png";

const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

const keys = [
  ["Move", "↑ ← ↓ →"],
  ["A / B", "Z / X"],
  ["Start / Select", "Enter / ⌫"],
  ["Save / Load", `${modifier}S / ${modifier}L`],
  ["Menu", "Esc"],
  ["Mute", "M"],
];

export function StartMenu({
  state,
  game,
}: {
  state: PlayerState;
  game: Player | null;
}) {
  return (
    <section className={`${menu.panel} menu-enter w-full max-w-[424px]`}>
      <header className="flex items-center gap-4 pb-6 max-[360px]:gap-3">
        <img
          src={cartridge}
          alt=""
          className="h-20 w-18 shrink-0 object-contain [image-rendering:pixelated] max-[360px]:h-16 max-[360px]:w-12"
        />
        <div>
          <h1 className="text-[32px] leading-[1.1] font-normal max-[360px]:text-[28px]">
            Tintin
            <span className="mt-2 block text-xs leading-normal">
              Prisoners of the Sun
            </span>
          </h1>
        </div>
      </header>
      <div>
        <button
          className={`${menu.primary} w-full`}
          disabled={state.busy}
          onClick={() =>
            void (state.recent ? game?.openRecent() : game?.choose())
          }
        >
          {state.busy ? "Opening…" : state.recent ? "Continue" : "Add a ROM"}
        </button>
        {state.recent && (
          <button
            className={`${menu.link} w-full`}
            disabled={state.busy}
            onClick={() => void game?.restartRun()}
          >
            Restart run
          </button>
        )}
      </div>
      <div className="mt-6">
        <label htmlFor="start-level" className="text-xs">
          Level select
        </label>
        <div className="mt-2 flex gap-2 max-[360px]:flex-wrap">
          <select
            id="start-level"
            aria-label="Level select"
            className={`${menu.secondary} min-w-0 flex-1 max-[360px]:basis-full`}
            value={state.selectedLevel}
            disabled={state.busy}
            onChange={(event) => game?.selectLevel(Number(event.target.value))}
          >
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.label}
              </option>
            ))}
          </select>
          <button
            className={`${menu.secondary} shrink-0 max-[360px]:w-full`}
            disabled={state.busy}
            aria-label={
              state.recent ? "Start selected level" : "Add ROM and start level"
            }
            onClick={() => void game?.startLevel()}
          >
            Play
          </button>
        </div>
      </div>
      <details className={`${menu.details} mt-6`}>
        <summary className={menu.summary}>
          How to play
          <span aria-hidden="true" className={menu.indicator}>
            +
          </span>
        </summary>
        <dl>
          {keys.map(([label, key]) => (
            <div
              className="flex items-center justify-between gap-2 py-1.5 text-xs"
              key={label}
            >
              <dt>{label}</dt>
              <dd>
                <kbd className="rounded-none border-gb-line bg-transparent text-xs whitespace-nowrap text-inherit">
                  {key}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
        <p className="pt-3 text-xs leading-[1.7] text-gb-muted">
          On phones, use the on-screen controls. Controllers: D-pad or left stick to move, bottom/right buttons for A/B, Start/Select, and left shoulder for the menu. In menus, up/down moves, left/right changes options, and the bottom button selects.
        </p>
      </details>
      {state.message && (
        <p
          className={`${menu.status} ${state.error ? "border-dashed" : ""}`}
          role="status"
        >
          {state.message}
        </p>
      )}
    </section>
  );
}
