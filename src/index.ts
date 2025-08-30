import p5 from "p5";
import { Engine } from "./engine";
import { DEFAULT_GRID_SIZE, CELL_SIZE } from "./constants";

let engine: Engine;
let pInstance: p5;
let autoInterval: number | null = null;

const runGeneration = async (
  promptInput: HTMLTextAreaElement | HTMLInputElement | null,
  stepBtn: HTMLButtonElement | null
) => {
  if (!promptInput) return;
  const rulePrompt =
    promptInput.value ||
    "Update the cell based on neighbors; return the same value.";
  if (stepBtn) {
    stepBtn.disabled = true;
    const label = stepBtn.dataset.label || "Step";
    stepBtn.textContent = "Running...";
    const start = performance.now();
    await engine.nextGeneration(rulePrompt, pInstance);
    engine.draw(pInstance);
    const elapsed = Math.round(performance.now() - start);
    stepBtn.textContent = `${label} (${elapsed}ms)`;
    stepBtn.disabled = false;
  } else {
    await engine.nextGeneration(rulePrompt, pInstance);
    engine.draw(pInstance);
  }
};

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
    const autoBtn = document.getElementById(
      "autoBtn"
    ) as HTMLButtonElement | null;
    const promptInput = document.getElementById("promptInput") as
      | HTMLTextAreaElement
      | HTMLInputElement
      | null;
    const apiKeyInput = document.getElementById(
      "apiKeyInput"
    ) as HTMLInputElement | null;
    const toggleApiBtn = document.getElementById(
      "toggleApiKey"
    ) as HTMLButtonElement | null;
    const tokenCost = document.getElementById("tokenCost");
    if (tokenCost) engine.setTokenDiv(tokenCost);

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

    // Toggle API key visibility
    if (toggleApiBtn && apiKeyInput) {
      toggleApiBtn.addEventListener("click", () => {
        if (apiKeyInput.type === "password") {
          apiKeyInput.type = "text";
          toggleApiBtn.textContent = "Hide";
        } else {
          apiKeyInput.type = "password";
          toggleApiBtn.textContent = "Show";
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
      await runGeneration(promptInput, stepBtn);
    });

    // Auto run toggle
    autoBtn?.addEventListener("click", () => {
      if (autoInterval !== null) {
        window.clearInterval(autoInterval);
        autoInterval = null;
        autoBtn.textContent = "Auto";
        stepBtn && (stepBtn.disabled = false);
      } else {
        const delay = 600; // ms per generation
        autoBtn.textContent = "Stop";
        stepBtn && (stepBtn.disabled = true);
        autoInterval = window.setInterval(() => {
          runGeneration(promptInput, null);
        }, delay);
      }
    });

    // Keyboard shortcut Ctrl+Enter for step
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (autoInterval === null) {
          runGeneration(promptInput, stepBtn);
        }
      }
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
