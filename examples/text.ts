import { COLORS, Column, Input, Text, onKey, run, $ } from "../index.ts";

const p1 = Text({
  text: "Talks about learning technology often center on technology. Instead, I want to begin by asking: *what do you want learning to be like—for yourself?* If you could snap your fingers and drop yourself into a perfect learning environment, what’s your ideal?",
  foreground: COLORS.light.fg,
  background: COLORS.light.bg,
  paddingX: 1,
  border: {
    style: "square",
    color: COLORS.light.cyan,
  },
  wrap: "none",
  textOverflow: "ellipsis",
  maxHeight: 2,
  boxSizing: "contentBox",
});

const p2 = Text({
  text: "One way to start thinking about this question is to ask: what were the most rewarding high-growth periods of your life?",
  foreground: COLORS.light.fg,
  background: COLORS.light.bg,
  paddingX: 1,
  border: {
    style: "square",
    color: COLORS.light.cyan,
  },
  wrap: "char",
  textOverflow: "ellipsis",
  maxHeight: 1,
  boxSizing: "contentBox",
});

const p3 = Text({
  text: "I’ve noticed two patterns in answers to this question: first, people will tell me about a time when they learned a lot, but *learning wasn’t the point*. Instead, they were immersed in a situation with real personal meaning—like a startup, a research project, an artistic urge, or just a fiery curiosity. They dove in, got their hands dirty, and learned whatever was important along the way. And secondly: in these stories, *learning really worked*. People emerged feeling transformed, newly capable, filled with insight and understanding that has stayed with them years later.",
  foreground: COLORS.light.fg,
  background: COLORS.light.bg,
  paddingX: 1,
  border: {
    style: "square",
    color: COLORS.light.cyan,
  },
  wrap: "word",
  textOverflow: "clip",
  maxHeight: 3,
  boxSizing: "contentBox",
});

const i1 = Input({
  multiline: true,
  border: {
    style: "square",
    color: COLORS.light.cyan,
  },
  background: COLORS.light.bg,
  foreground: COLORS.light.fg,
  paddingX: 1,
});

const root = Column({ background: COLORS.light.bg }, [p1, p2, p3, i1]);

const app = run(root, { debug: true });

onKey("q", () => {
  app.quit();
});
