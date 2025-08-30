import p5 from "p5";
import { Engine } from "./engine";
import { DEFAULT_GRID_SIZE, CELL_SIZE } from "./constants";

let engine: Engine;
let pInstance: p5;

const sketch = (p: p5) => {
  pInstance = p;
  p.setup = () => {
    engine = new Engine(DEFAULT_GRID_SIZE, DEFAULT_GRID_SIZE);
    engine.initHelperFromStorage();
    p.createCanvas(engine.cols * CELL_SIZE, engine.rows * CELL_SIZE).parent(
      "app"
    );
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(CELL_SIZE * 0.32);
    p.noLoop();

    const sizeInput = document.getElementById(
      "gridSizeInput"
    ) as HTMLInputElement | null;
    const resizeBtn = document.getElementById("resizeBtn");
    const stepBtn = document.getElementById(
      "stepBtn"
    ) as HTMLButtonElement | null;
    const promptInput = document.getElementById(
      "promptInput"
    ) as HTMLInputElement | null;
    const apiKeyInput = document.getElementById(
      "apiKeyInput"
    ) as HTMLInputElement | null;
    const tokenDiv = document.getElementById("tokenUsage");
    if (tokenDiv) engine.setTokenDiv(tokenDiv);

    // API key persistence
    if (apiKeyInput) {
      const stored = localStorage.getItem("openai_api_key");
      if (stored) apiKeyInput.value = stored;
      apiKeyInput.addEventListener("change", () => {
        const val = apiKeyInput.value.trim();
        if (val) {
          localStorage.setItem("openai_api_key", val);
          (window as any).__OPENAI_KEY__ = val;
          engine.setApiKey(val);
        } else {
          localStorage.removeItem("openai_api_key");
          (window as any).__OPENAI_KEY__ = "";
          engine.setApiKey("");
        }
      });
    }

    resizeBtn?.addEventListener("click", () => {
      const val = sizeInput ? parseInt(sizeInput.value, 10) : engine.cols;
      if (!isNaN(val) && val > 0 && val <= 50) {
        engine.resize(val, p);
        engine.draw(p);
      }
    });

    stepBtn?.addEventListener("click", async () => {
      if (!promptInput) return;
      const rulePrompt =
        promptInput.value ||
        "Update the cell based on neighbors; return the same value.";
      if (stepBtn) stepBtn.disabled = true;
      stepBtn!.textContent = "Running...";
      const start = performance.now();
      await engine.nextGeneration(rulePrompt, p);
      engine.draw(p);
      const elapsed = Math.round(performance.now() - start);
      stepBtn!.textContent = `Step (${elapsed}ms)`;
      if (stepBtn) stepBtn.disabled = false;
    });

    // Canvas single-cell update
    const canvasEl = (p as any)?._renderer?.canvas as
      | HTMLCanvasElement
      | undefined;
    if (canvasEl) {
      canvasEl.addEventListener("click", (ev: MouseEvent) => {
        const rect = canvasEl.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;
        const cx = Math.floor(mx / CELL_SIZE);
        const cy = Math.floor(my / CELL_SIZE);
        const rulePrompt =
          (promptInput && promptInput.value) ||
          "Update the cell based on neighbors; return the same value.";
        engine.updateSingleCell(cx, cy, rulePrompt, p);
      });
    }

    engine.draw(p);
    engine.updateTokenDisplay();
  };

  p.draw = () => {
    // Intentionally blank – manual redraws only
  };
};

new p5(sketch);
