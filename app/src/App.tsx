import { useState, type ReactNode, type PointerEvent } from "react";
import { usePlayer } from "./usePlayer";
import type { Player } from "./player";

function TouchButton({
  value,
  label,
  className = "",
  children,
  game,
}: {
  value: number;
  label: string;
  className?: string;
  children: ReactNode;
  game: Player | null;
}) {
  const [pressed, setPressed] = useState(false);
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    game?.release(`pointer${event.pointerId}`);
    setPressed(false);
  };
  return (
    <button
      className={`touch-button ${className} ${pressed ? "pressed" : ""}`}
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        game?.press(`pointer${event.pointerId}`, value);
        setPressed(true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      {children}
    </button>
  );
}
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
      {state.loaded && !state.playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-white">
          <section className="w-full max-w-xs space-y-3">
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
              onClick={() => void game?.choose()}
            >
              Choose ROM
            </button>
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
      )}
      {state.loaded && state.playing && (
        <>
          {state.message && (
            <p
              role="status"
              className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded bg-black/70 px-3 py-2 text-xs text-white"
            >
              {state.message}
            </p>
          )}
          <div className="mobile-controls">
            <div className="dpad">
              <TouchButton game={game} value={4} className="up" label="Up">
                ↑
              </TouchButton>
              <TouchButton game={game} value={2} className="left" label="Left">
                ←
              </TouchButton>
              <TouchButton
                game={game}
                value={1}
                className="right"
                label="Right"
              >
                →
              </TouchButton>
              <TouchButton game={game} value={8} className="down" label="Down">
                ↓
              </TouchButton>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <TouchButton
                game={game}
                value={64}
                className="system"
                label="Select"
              >
                SELECT
              </TouchButton>
              <TouchButton
                game={game}
                value={128}
                className="system"
                label="Start"
              >
                START
              </TouchButton>
              <button
                className="touch-button system"
                aria-label="Game menu"
                onClick={() => void game?.pause()}
              >
                ☰
              </button>
            </div>
            <div className="flex items-center gap-3">
              <TouchButton game={game} value={32} className="action" label="B">
                B
              </TouchButton>
              <TouchButton game={game} value={16} className="action" label="A">
                A
              </TouchButton>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
