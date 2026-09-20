import { levels } from "./lib/levels";

import { useState, type ReactNode, type PointerEvent } from "react";
import { usePlayer } from "./lib/usePlayer";
import { Pause } from "./components/pause";
import { MobileControls } from "./components/mobile-controls";

const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
const keyGuide: [string, string[]][] = [
  ["Move", ["↑", "←", "↓", "→"]],
  ["A / B", ["Z", "X"]],
  ["Start / Select", ["Enter", "⌫"]],
  ["Save / Load state", [`${modifier}S`, `${modifier}L`]],
  ["Menu", ["Esc"]],
  ["Mute", ["M"]],
];
export default function App() {
  const { canvas, player, state } = usePlayer();
  const [expandedKeys, setExpandedKeys] = useState(false);
  const game = player.current;
  return (
    <main
      className={
        state.loaded
          ? "fixed inset-0 bg-black"
          : "flex min-h-dvh items-center justify-center bg-zinc-950 px-6 py-10 text-zinc-100"
      }
    >
      <canvas
        ref={canvas}
        width={160}
        height={144}
        tabIndex={0}
        aria-label="Tintin game screen"
        className={`game-screen ${state.loaded ? "" : "hidden"}`}
      />
      {!state.loaded && (
        <section className="w-full max-w-sm">
          <h1 className="mb-6 text-xl font-medium tracking-tight">
            Tintin · Prisoners of the Sun
          </h1>
          <button
            className="primary w-full"
            disabled={state.busy}
            onClick={() => void game?.choose()}
          >
            {state.busy ? "Opening…" : "Add a ROM"}
          </button>
          {state.recent && (
            <button
              className="secondary mt-3 w-full"
              disabled={state.busy}
              onClick={() => void game?.openRecent()}
            >
              Continue last game
            </button>
          )}
          <div className="mt-6 space-y-3">
            <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
              Level select
              <select
                aria-label="Level select"
                className="secondary min-w-0 max-w-[70%]"
                value={state.selectedLevel}
                disabled={state.busy}
                onChange={(event) =>
                  game?.selectLevel(Number(event.target.value))
                }
              >
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary w-full"
              disabled={state.busy}
              onClick={() => void game?.startLevel()}
            >
              {state.busy
                ? "Opening…"
                : state.recent
                  ? "Start selected level"
                  : "Add ROM and start level"}
            </button>
          </div>
          <button
            className="secondary w-full mt-4"
            onClick={() => setExpandedKeys(!expandedKeys)}
          >
            Show key guide
          </button>
          {expandedKeys && (
            <dl className="mt-9 space-y-4">
              {keyGuide.map(([label, buttons]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <dt className="text-zinc-400">{label}</dt>
                  <dd className="flex gap-1.5">
                    {buttons.map((button) => (
                      <kbd key={button}>{button}</kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-7 text-xs leading-relaxed text-zinc-500">
            Your last ROM and progress are remembered. A state is saved when you
            close the game.
          </p>
          {state.message && (
            <p
              className={`mt-4 text-sm ${state.error ? "text-red-300" : "text-zinc-300"}`}
              role="status"
            >
              {state.message}
            </p>
          )}
        </section>
      )}
      {state.loaded && !state.playing && <Pause state={state} game={game!} />}
      {state.loaded && state.playing && (
        <MobileControls state={state} game={game!} />
      )}
    </main>
  );
}
