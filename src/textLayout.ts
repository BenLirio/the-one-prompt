import p5 from "p5";

export interface LaidOutText {
  fontSize: number;
  lines: string[];
  lineHeight: number;
  totalHeight: number;
}

export function layoutCellText(
  p: p5,
  text: string,
  cellSize: number,
  opts: {
    maxFactor?: number;
    minFactor?: number;
    widthPad?: number;
    heightPad?: number;
  } = {}
): LaidOutText {
  const {
    maxFactor = 0.5, // slightly lower base
    minFactor = 0.04, // allow much smaller text
    widthPad = 0.9,
    heightPad = 0.9,
  } = opts;
  const raw = text || "";
  const len = raw.length;
  // Much more aggressive shrink: after 3 chars apply exponential decay.
  // Each extra char multiplies by 0.8 -> rapid reduction.
  const expPenalty = Math.pow(0.8, Math.max(0, len - 3));
  const baseMaxFont = cellSize * maxFactor;
  let dynamicMaxFont = baseMaxFont * expPenalty;
  // For very long strings clamp directly to near-min.
  if (len > 30) dynamicMaxFont = Math.min(dynamicMaxFont, cellSize * (minFactor * 1.15));
  if (len > 60) dynamicMaxFont = cellSize * minFactor; // force smallest for extreme length
  const maxFont = Math.max(cellSize * minFactor, dynamicMaxFont);
  const minFont = cellSize * minFactor;
  const targetWidth = cellSize * widthPad;
  const targetHeight = cellSize * heightPad;

  // Early exit blank
  if (!raw.trim()) {
    const fontSize = Math.max(minFont, Math.min(maxFont, cellSize * 0.14));
    return {
      fontSize,
      lines: [""],
      lineHeight: fontSize * 1.05,
      totalHeight: fontSize * 1.05,
    };
  }

  // Prevent splitting short single words
  const preventSplitShortSingle = !raw.includes(" ") && raw.length <= 12;

  // Attempt from large to small font sizes (simple decrement step)
  const step = Math.max(1, Math.floor(maxFont / 20));
  for (let fs = Math.floor(maxFont); fs >= minFont; fs -= step) {
    p.textSize(fs);
    const lineHeight = fs * 1.05;
    const lines = wrap(raw, targetWidth, p);
    if (preventSplitShortSingle && lines.length > 1) {
      // word got split; continue shrinking instead of accepting split layout
      continue;
    }
    const totalHeight = lines.length * lineHeight;
    if (totalHeight <= targetHeight) {
      return { fontSize: fs, lines, lineHeight, totalHeight };
    }
  }
  // Fallback smallest
  const fs = Math.ceil(minFont);
  p.textSize(fs);
  const lineHeight = fs * 1.05;
  let lines = wrap(raw, targetWidth, p, true);
  if (preventSplitShortSingle && lines.length > 1) {
    // allow slight overflow instead of wrapping tiny word
    lines = [raw];
  }
  const totalHeight = lines.length * lineHeight;
  return { fontSize: fs, lines, lineHeight, totalHeight };
}

function wrap(
  text: string,
  maxWidth: number,
  p: p5,
  forceSplitLongWords = false
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.length) lines.push(current);
    current = "";
  };

  for (let w of words) {
    if (!w) continue;
    const trial = current ? current + " " + w : w;
    const tw = p.textWidth(trial);
    if (tw <= maxWidth) {
      current = trial;
      continue;
    }
    // Word itself wider than maxWidth
    if (!current) {
      if (forceSplitLongWords || p.textWidth(w) > maxWidth) {
        // Hard split
        const approxCharWidth = p.textWidth("M");
        const charsPerLine = Math.max(
          1,
          Math.floor(maxWidth / approxCharWidth)
        );
        let idx = 0;
        while (idx < w.length) {
          lines.push(w.slice(idx, idx + charsPerLine));
          idx += charsPerLine;
        }
      } else {
        lines.push(w);
      }
      continue;
    }
    // Push current line and start new with word (may split next loop if needed)
    pushCurrent();
    // Re-evaluate word alone
    if (p.textWidth(w) <= maxWidth) current = w;
    else {
      // split long word forcibly
      const approxCharWidth = p.textWidth("M");
      const charsPerLine = Math.max(1, Math.floor(maxWidth / approxCharWidth));
      let idx = 0;
      while (idx < w.length) {
        lines.push(w.slice(idx, idx + charsPerLine));
        idx += charsPerLine;
      }
    }
  }
  pushCurrent();
  return lines;
}
