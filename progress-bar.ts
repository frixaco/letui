import { Row, Text } from "./components";
import { $, ff, type Signal } from "./signals";
import type { Node } from "./types";

export type ProgressBarProps = {
  width?: number;
  filledColor: number;
  unfilledColor: number;
};

export type ProgressBarController = {
  node: Node;
  progress: Signal<number>;
  /** Start animated progress toward target (default 90%), completes in ~duration ms */
  start: (target?: number, duration?: number) => void;
  /** Instantly set to 100% and stop animation */
  complete: () => void;
  /** Reset to 0% and stop animation */
  reset: () => void;
};

export function ProgressBar(props: ProgressBarProps): ProgressBarController {
  const { width = 30, filledColor, unfilledColor } = props;

  const progress = $(0);
  let timer: Timer | null = null;

  // Two text nodes: filled (left) + unfilled (right)
  const filledNode = Text({ text: "", background: filledColor, foreground: filledColor });
  const unfilledNode = Text({ text: "", background: unfilledColor, foreground: unfilledColor });
  const node = Row({}, [filledNode, unfilledNode]);

  // React to progress changes - update text lengths
  ff(() => {
    const p = progress();
    const filledChars = Math.round((p / 100) * width);
    const unfilledChars = width - filledChars;

    // Use spaces - background color creates the bar visual
    filledNode.setStyle?.({ text: " ".repeat(filledChars) });
    unfilledNode.setStyle?.({ text: " ".repeat(unfilledChars) });
  });

  function clearTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start(target = 90, duration = 1000) {
    clearTimer();
    progress(0);

    const steps = 10;
    const interval = duration / steps;
    const increment = target / steps;

    timer = setInterval(() => {
      const current = progress();
      if (current >= target) {
        clearTimer();
      } else {
        progress(Math.min(current + increment, target));
      }
    }, interval);
  }

  function complete() {
    clearTimer();
    progress(100);
  }

  function reset() {
    clearTimer();
    progress(0);
  }

  return { node, progress, start, complete, reset };
}
