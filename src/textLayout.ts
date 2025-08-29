import p5 from "p5";

export interface LaidOutText {
  fontSize: number;
  lines: string[];
  lineHeight: number;
  totalHeight: number;
}

// Compute wrapped lines and the largest font size that fits inside a square cell.
// Tries progressively smaller font sizes until both width and height constraints pass.
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
    maxFactor = 0.55,
    minFactor = 0.08,
    widthPad = 0.9,
    heightPad = 0.9,
  } = opts;
  const maxFont = cellSize * maxFactor;
  const minFont = cellSize * minFactor;
  const targetWidth = cellSize * widthPad;
  const targetHeight = cellSize * heightPad;
  const raw = text || "";

  // Early exit blank
  if (!raw.trim()) {
    const fontSize = Math.max(minFont, Math.min(maxFont, cellSize * 0.2));
    return {
      fontSize,
      lines: [""],
      lineHeight: fontSize * 1.1,
      totalHeight: fontSize * 1.1,
    };
  }

  // Attempt from large to small font sizes (simple decrement step)
  const step = Math.max(1, Math.floor(maxFont / 16));
  for (let fs = Math.floor(maxFont); fs >= minFont; fs -= step) {
    p.textSize(fs);
    const lineHeight = fs * 1.1;
    const lines = wrap(raw, targetWidth, p);
    const totalHeight = lines.length * lineHeight;
    if (totalHeight <= targetHeight) {
      return { fontSize: fs, lines, lineHeight, totalHeight };
    }
  }
  // Fallback smallest
  const fs = Math.ceil(minFont);
  p.textSize(fs);
  const lineHeight = fs * 1.1;
  const lines = wrap(raw, targetWidth, p, true);
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
