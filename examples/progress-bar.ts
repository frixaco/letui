// Loading bar helper: animated single-dot progress track for demo screens.
//
// Data flow:
// start() → timer interval → position/direction signals → ff() effect → Text node updates
// stop() → clear timer → reset signals → UI clear

import { Row, Text } from "@/components";
import { $, ff } from "@/signals";
import type { Node } from "@/types";
import { log } from "@/debug";


export type LoadingBarProps = {
  dotColor: number;
  trackColor: number;
  flexGrow?: number;
  interval?: number;
};

export type LoadingBarController = {
  node: Node;
  start: () => void;
  stop: () => void;
  setColors: (colors: { dotColor: number; trackColor: number }) => void;
};


export function LoadingBar(props: LoadingBarProps): LoadingBarController {
  const { dotColor, trackColor, flexGrow = 1, interval = 80 } = props;


  const position = $(0);
  const direction = $(1);
  const active = $(false);
  let timer: Timer | null = null;


  const leftTrack = Text({
    text: "",
    background: trackColor,
    foreground: trackColor,
  });
  const dot = Text({ text: "", background: dotColor, foreground: dotColor });
  const rightTrack = Text({
    text: "",
    background: trackColor,
    foreground: trackColor,
  });

  const node = Row({ flexGrow }, [leftTrack, dot, rightTrack]);

  ff(() => {
    const isActive = active();
    const pos = position();
    const width = node.frameWidth();
    log(`LoadingBar: x=${node.frame.x}, width=${width}, pos=${pos}, active=${isActive}`);
    if (width === 0 || !isActive) return;

    const maxPos = width - 1;
    const clampedPos = Math.max(0, Math.min(pos, maxPos));

    leftTrack.setText?.(" ".repeat(clampedPos));
    dot.setText?.(" ");
    rightTrack.setText?.(" ".repeat(maxPos - clampedPos));
  });


  function clearTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    if (active()) return;
    active(true);
    position(0);
    direction(1);

    timer = setInterval(() => {
      const width = node.frameWidth();
      if (width === 0) return;

      const maxPos = width - 1;
      const pos = position();
      const dir = direction();

      const step = 12;
      const nextPos = pos + dir * step;
      if (nextPos >= maxPos) {
        direction(-1);
        position(maxPos);
      } else if (nextPos <= 0) {
        direction(1);
        position(0);
      } else {
        position(nextPos);
      }
    }, interval);
  }

  function stop() {
    clearTimer();
    active(false);
    position(0);
    leftTrack.setText?.("");
    dot.setText?.("");
    rightTrack.setText?.("");
  }

  function setColors(colors: { dotColor: number; trackColor: number }) {
    leftTrack.setStyle?.({
      background: colors.trackColor,
      foreground: colors.trackColor,
    });
    dot.setStyle?.({
      background: colors.dotColor,
      foreground: colors.dotColor,
    });
    rightTrack.setStyle?.({
      background: colors.trackColor,
      foreground: colors.trackColor,
    });
  }

  return { node, start, stop, setColors };
}
