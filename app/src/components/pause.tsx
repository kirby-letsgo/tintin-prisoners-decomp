import { menu } from "./menu-styles";
import { Player, PlayerState } from "../lib/player";
import {
  displayModes,
  type ScalingMode,
  type DisplayMode,
} from "../lib/display";

export const Pause = ({
  state,
  game,
}: {
  state: PlayerState;
  game: Player;
}) => {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 px-5 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <section className={`${menu.panel} max-h-full w-full max-w-sm space-y-3 overflow-y-auto overscroll-contain [scrollbar-color:#84975f_#cfdda6] [scrollbar-width:thin]`}>
        <button
          className={`${menu.primary} w-full`}
          disabled={state.busy}
          onClick={() => void game?.resume()}
        >
          Resume
        </button>
        <div className="flex gap-3">
          <button
            className={`${menu.secondary} flex-1`}
            disabled={state.busy}
            onClick={() => void game?.save()}
          >
            Save state
          </button>
          <button
            className={`${menu.secondary} flex-1`}
            disabled={state.busy}
            onClick={() => void game?.restore()}
          >
            Load state
          </button>
        </div>
        <details className={`${menu.details} mt-4`}>
          <summary className={menu.summary}>
            Picture & sound<span aria-hidden="true" className={menu.indicator}>+</span>
          </summary>
          <div className={menu.content}>
            <label className="flex items-center justify-between gap-3 text-xs text-inherit">
              Display
              <select
                aria-label="Display effect"
                className={menu.secondary}
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
            <label className="flex items-center justify-between gap-3 text-xs text-inherit">
              Scaling
              <select
                aria-label="Pixel scaling"
                className={menu.secondary}
                value={state.scalingMode}
                onChange={(event) =>
                  game.setScalingMode(event.target.value as ScalingMode)
                }
              >
                <option value="integer">Whole pixels</option>
                <option value="fit">Fit screen</option>
              </select>
            </label>
            <p className={menu.note}>
              {state.scalingMode === "integer"
                ? "Even pixel sizes with a little extra space around the game."
                : "The largest picture that fits, keeping the original proportions."}
            </p>
            {!state.shadersSupported && (
              <p className={menu.note}>
                Display effects are unavailable on this device.
              </p>
            )}
            <button
              className={`${menu.secondary} w-full`}
              disabled={state.busy}
              onClick={() => void game?.chooseSpritePack()}
            >
              {state.spritePack
                ? "Change 2× sprite pack"
                : "Load 2× sprite pack"}
            </button>
            {state.spritePack && (
              <button
                className={`${menu.note} min-h-11 w-full py-2 enabled:hover:bg-gb-hover`}
                disabled={state.busy}
                onClick={() => void game?.clearSpritePack()}
              >
                Use original sprites
              </button>
            )}
            <button
              className={`${menu.note} min-h-11 w-full py-2 enabled:hover:bg-gb-hover`}
              onClick={() => void game?.toggleSound()}
            >
              Sound {state.muted ? "off" : "on"}
            </button>
          </div>
        </details>
        <details className={`${menu.details} mt-4`}>
          <summary className={menu.summary}>
            Game options<span aria-hidden="true" className={menu.indicator}>+</span>
          </summary>
          <div className={menu.content}>
            <label className="flex items-center justify-between gap-3 text-xs text-inherit">
              Lives
              <select
                aria-label="Lives"
                className={menu.secondary}
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
                className={`${menu.secondary} w-full`}
                disabled={state.busy}
                onClick={() => void game?.setStartingLives(state.startingLives)}
              >
                Set lives to {state.startingLives}
              </button>
            )}
            <p className={menu.note}>
              Choosing 1–9 sets your current lives and starting lives for new
              games. Game default affects only new games.
            </p>
          </div>
        </details>
        <details className={`${menu.details} mt-4`}>
          <summary className={menu.summary}>
            Save files & ROM<span aria-hidden="true" className={menu.indicator}>+</span>
          </summary>
          <div className={menu.content}>
            <div className="flex gap-3">
              <button
                className={`${menu.secondary} flex-1`}
                disabled={state.busy}
                onClick={() => void game?.transferSave(false)}
              >
                Export save
              </button>
              <button
                className={`${menu.secondary} flex-1`}
                disabled={state.busy}
                onClick={() => void game?.transferSave(true)}
              >
                Import save
              </button>
            </div>
            <button
              className={`${menu.secondary} w-full`}
              disabled={state.busy}
              onClick={() => void game?.choose()}
            >
              Choose ROM
            </button>
          </div>
        </details>
        <button
          className={`${menu.link} w-full`}
          disabled={state.busy}
          onClick={() => void game?.mainMenu()}
        >
          Main menu
        </button>
        {state.message && (
          <p
            role="status"
            className={`${menu.status} ${state.error ? "border-dashed" : ""}`}
          >
            {state.message}
          </p>
        )}
      </section>
    </div>
  );
};
