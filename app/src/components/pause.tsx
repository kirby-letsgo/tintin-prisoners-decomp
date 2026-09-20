import { Player, PlayerState } from "../lib/player";
import { displayModes, type DisplayMode } from "../lib/display";

export const Pause = ({
  state,
  game,
}: {
  state: PlayerState;
  game: Player;
}) => {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-white">
      <section className="max-h-full w-full max-w-xs space-y-3 overflow-y-auto">
        <button
          className="primary w-full"
          disabled={state.busy}
          onClick={() => void game?.resume()}
        >
          Continue
        </button>
        <div className="flex gap-3">
          <button
            className="secondary flex-1"
            disabled={state.busy}
            onClick={() => void game?.save()}
          >
            Save state
          </button>
          <button
            className="secondary flex-1"
            disabled={state.busy}
            onClick={() => void game?.restore()}
          >
            Load state
          </button>
        </div>
        <div className="flex gap-3">
          <button
            className="secondary flex-1"
            disabled={state.busy}
            onClick={() => void game?.transferSave(false)}
          >
            Export save
          </button>
          <button
            className="secondary flex-1"
            disabled={state.busy}
            onClick={() => void game?.transferSave(true)}
          >
            Import save
          </button>
        </div>
        <button
          className="secondary w-full"
          disabled={state.busy}
          onClick={() => void game?.mainMenu()}
        >
          Main menu / level select
        </button>
        <button
          className="secondary w-full"
          disabled={state.busy}
          onClick={() => void game?.choose()}
        >
          Choose ROM
        </button>
        <button
          className="secondary w-full"
          disabled={state.busy}
          onClick={() => void game?.chooseSpritePack()}
        >
          {state.spritePack ? "Change 2× sprite pack" : "Load 2× sprite pack"}
        </button>
        {state.spritePack && (
          <button
            className="w-full py-2 text-sm text-zinc-400"
            disabled={state.busy}
            onClick={() => void game?.clearSpritePack()}
          >
            Use original sprites
          </button>
        )}
        <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
          Lives
          <select
            aria-label="Lives"
            className="secondary"
            value={state.startingLives}
            disabled={state.busy}
            onChange={(event) =>
              void game?.setStartingLives(Number(event.target.value))
            }
          >
            <option value={0}>Game default</option>
            {Array.from({ length: 9 }, (_, i) => i + 1).map((lives) => (
              <option key={lives} value={lives}>
                {lives}
              </option>
            ))}
          </select>
        </label>
        {state.startingLives > 0 && (
          <button
            className="secondary w-full"
            disabled={state.busy}
            onClick={() => void game?.setStartingLives(state.startingLives)}
          >
            Set lives to {state.startingLives}
          </button>
        )}
        <p className="text-xs text-zinc-400">
          Choosing 1–9 sets your current lives and starting lives for new games.
          Game default affects only new games.
        </p>
        <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">
          Display
          <select
            aria-label="Display effect"
            className="secondary max-w-48"
            value={state.displayMode}
            disabled={!state.shadersSupported}
            onChange={(event) =>
              game?.setDisplayMode(event.target.value as DisplayMode)
            }
          >
            {Object.entries(displayModes).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {!state.shadersSupported && (
          <p className="text-xs text-zinc-400">
            Display effects are unavailable on this device.
          </p>
        )}
        <button
          className="w-full py-2 text-sm text-zinc-400"
          onClick={() => void game?.toggleSound()}
        >
          Sound {state.muted ? "off" : "on"}
        </button>
        {state.message && (
          <p
            role="status"
            className={`text-sm ${state.error ? "text-red-300" : "text-zinc-300"}`}
          >
            {state.message}
          </p>
        )}
      </section>
    </div>
  );
};
