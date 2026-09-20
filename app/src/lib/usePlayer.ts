import { connectController } from "./controller";
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Player, initialState, keyMap } from "./player";

export function usePlayer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<Player | null>(null);
  const [state, setState] = useState(initialState);

  useEffect(() => {
    const game = new Player(canvas.current!, setState);
    player.current = game;
    const disconnectController = connectController(game);

    const down = (event: KeyboardEvent) => {
      if (!game.state.loaded || game.state.busy) return;
      if ((event.metaKey || event.ctrlKey) && event.code === "KeyS") {
        event.preventDefault();
        if (!event.repeat) void game.save();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.code === "KeyL") {
        event.preventDefault();
        if (!event.repeat) void game.restore();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === "Escape") {
        event.preventDefault();
        if (!event.repeat) void game.togglePause();
        return;
      }
      if (event.code === "KeyM") {
        event.preventDefault();
        if (!event.repeat) void game.toggleSound();
        return;
      }
      if (keyMap[event.code] && game.state.playing) {
        event.preventDefault();
        game.press(event.code, keyMap[event.code]);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (keyMap[event.code]) {
        game.release(event.code);
        if (game.state.loaded) event.preventDefault();
      }
    };
    const blur = () => game.clearInput();
    const visibility = () => {
      if (document.hidden && game.state.loaded) {
        void game.pause().then(() => game.save(true));
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    const auto = setInterval(() => {
      if (game.state.playing) void game.save(true);
    }, 30000);
    const unlisten = listen<string>("save-error", (event) =>
      game.reportError(event.payload),
    );
    return () => {
      disconnectController();
      clearInterval(auto);
      void unlisten.then((fn) => fn());
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      void game.dispose();
      player.current = null;
    };
  }, []);
  return { canvas, player, state };
}
