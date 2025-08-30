import p5 from "p5";
import { Engine } from "./engine";
import { DEFAULT_GRID_SIZE, CELL_SIZE } from "./constants";

let engine: Engine;
let pInstance: p5;

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
    const canvas = p
      .createCanvas(engine.cols * CELL_SIZE, engine.rows * CELL_SIZE)
      .parent("app") as unknown as { canvas?: HTMLCanvasElement };
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(CELL_SIZE * 0.32);
    p.noLoop();

    // Explicit size fitting (no transform) to keep cells square when width constrained
    const fitCanvas = () => {
      const canvasEl = (p as any)?._renderer?.canvas as
        | HTMLCanvasElement
        | undefined;
      if (!canvasEl) return;
      const wrap = document.getElementById("canvasWrap");
      const parent = wrap || canvasEl.parentElement;
      if (!parent) return;
      const base = engine.cols * CELL_SIZE; // intrinsic square side
      const available = parent.clientWidth;
      const display = Math.min(base, available);
      canvasEl.style.width = display + "px";
      canvasEl.style.height = display + "px"; // force square display
    };
    window.addEventListener("resize", fitCanvas, { passive: true });

    const sizeInput = document.getElementById(
      "gridSizeInput"
    ) as HTMLInputElement | null;
    const stepBtn = document.getElementById(
      "stepBtn"
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

    // Automatic resize on slider movement (range 1-8)
    sizeInput?.addEventListener("input", () => {
      const val = sizeInput ? parseInt(sizeInput.value, 10) : engine.cols;
      if (!isNaN(val) && val > 0 && val <= 8) {
        engine.resize(val, p);
        engine.draw(p);
        // fitCanvas is in scope
        (function resizeCanvasFit() {
          const canvasEl = (p as any)?._renderer?.canvas as
            | HTMLCanvasElement
            | undefined;
          if (!canvasEl) return;
          const wrap = document.getElementById("canvasWrap");
          const parent = wrap || canvasEl.parentElement;
          if (!parent) return;
          const base = engine.cols * CELL_SIZE;
          const available = parent.clientWidth;
          const display = Math.min(base, available);
          canvasEl.style.width = display + "px";
          canvasEl.style.height = display + "px";
        })();
      }
    });

    stepBtn?.addEventListener("click", async () => {
      await runGeneration(promptInput, stepBtn);
    });

    // Keyboard shortcut Ctrl+Enter for step (always allowed now)
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runGeneration(promptInput, stepBtn);
      }
    });

    // Canvas single-cell update
    const canvasEl = (p as any)?._renderer?.canvas as
      | HTMLCanvasElement
      | undefined;
    if (canvasEl) {
      const handlePoint = (clientX: number, clientY: number) => {
        const rect = canvasEl.getBoundingClientRect();
        const mx = clientX - rect.left;
        const my = clientY - rect.top;
        // Account for CSS scaling (canvas logical size vs displayed size)
        const scaleX = rect.width / (engine.cols * CELL_SIZE);
        const scaleY = rect.height / (engine.rows * CELL_SIZE);
        const cx = Math.floor(mx / (CELL_SIZE * scaleX));
        const cy = Math.floor(my / (CELL_SIZE * scaleY));
        const rulePrompt =
          (promptInput && promptInput.value) ||
          "Update the cell based on neighbors; return the same value.";
        engine.updateSingleCell(cx, cy, rulePrompt, p);
      };

      canvasEl.addEventListener("click", (ev: MouseEvent) => {
        handlePoint(ev.clientX, ev.clientY);
      });

      let lastTouch = 0;
      canvasEl.addEventListener(
        "touchstart",
        (ev: TouchEvent) => {
          if (!ev.touches.length) return;
          const now = Date.now();
          // Prevent duplicate click (some browsers fire both)
          if (now - lastTouch < 120) return;
          lastTouch = now;
          const t = ev.touches[0];
          handlePoint(t.clientX, t.clientY);
        },
        { passive: true }
      );
    }

    if (canvas) {
      fitCanvas();
    }

    engine.draw(p);
    engine.updateTokenDisplay();
    fitCanvas();
  };

  p.draw = () => {
    // Intentionally blank – manual redraws only
  };
};

new p5(sketch);
