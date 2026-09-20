import { menu } from "./components/menu-styles";
import { StartMenu } from "./components/start";
import { usePlayer } from "./lib/usePlayer";
import { Pause } from "./components/pause";
import { MobileControls } from "./components/mobile-controls";

export default function App() {
  const { canvas, player, state } = usePlayer();
  const game = player.current;
  return (
    <main
      className={
        state.loaded
          ? "game-stage fixed inset-0 bg-black"
          : menu.shell
      }
    >
      <canvas
        ref={canvas}
        width={160}
        height={144}
        tabIndex={0}
        aria-label="Tintin game screen"
        className={`game-screen ${state.loaded ? "screen-enter" : "hidden"}`}
      />
      {!state.loaded && <StartMenu state={state} game={game} />}
      {state.loaded && (
        <div className={`pause-layer ${state.playing ? "is-hidden" : ""}`}
          aria-hidden={state.playing} inert={state.playing}>
          <Pause state={state} game={game!} />
        </div>
      )}
      {state.loaded && state.playing && (
        <MobileControls state={state} game={game!} />
      )}
    </main>
  );
}
