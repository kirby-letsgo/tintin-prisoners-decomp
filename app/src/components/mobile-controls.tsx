import { PointerEvent, ReactNode, useState } from "react";
import { Player, PlayerState } from "../lib/player";

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

export const MobileControls = ({
  state,
  game,
}: {
  state: PlayerState;
  game: Player;
}) => {
  return (
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
          <TouchButton game={game} value={1} className="right" label="Right">
            →
          </TouchButton>
          <TouchButton game={game} value={8} className="down" label="Down">
            ↓
          </TouchButton>
        </div>
        <div className="flex items-end gap-2 pb-1">
          <TouchButton game={game} value={64} className="system" label="Select">
            SELECT
          </TouchButton>
          <TouchButton game={game} value={128} className="system" label="Start">
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
  );
};
