(() => {
  if (window.__waAreaBlurInstalled) return;
  window.__waAreaBlurInstalled = true;

  const BLUR_CLASS = "wa-area-blur-region";
  let selectionLayer = null;
  let startX = 0;
  let startY = 0;
  let selectionBox = null;
  let isDragging = false;
  let blurRegions = [];
  let blurVisible = true;

  const style = document.createElement("style");
  style.textContent = `
    .${BLUR_CLASS} {
      position: fixed !important;
      z-index: 2147483645 !important;
      pointer-events: none !important;
      background: rgba(220, 230, 235, .16) !important;
      -webkit-backdrop-filter: blur(12px) !important;
      backdrop-filter: blur(12px) !important;
      border: 1px solid rgba(255,255,255,.7) !important;
      border-radius: 3px !important;
      box-shadow: 0 0 0 1px rgba(0,0,0,.08) !important;
    }
    #wa-area-blur-selection-layer {
      position: fixed; inset: 0; z-index: 2147483647;
      cursor: crosshair; background: rgba(15, 23, 42, .10);
      touch-action: none;
    }
    #wa-area-blur-selection-hint {
      position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
      background: #17212b; color: #fff; padding: 10px 14px; border-radius: 10px;
      font: 600 13px/1.3 system-ui, sans-serif; box-shadow: 0 4px 18px #0003;
      white-space: nowrap; pointer-events: none;
    }
    #wa-area-blur-selection-box {
      position: fixed; border: 2px dashed #087e70; background: rgba(8,126,112,.12);
      pointer-events: none;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  function createSelectionLayer() {
    cancelSelection();
    selectionLayer = document.createElement("div");
    selectionLayer.id = "wa-area-blur-selection-layer";

    const hint = document.createElement("div");
    hint.id = "wa-area-blur-selection-hint";
    hint.textContent = "Drag to select an area · Press Esc to cancel";
    selectionLayer.appendChild(hint);

    selectionBox = document.createElement("div");
    selectionBox.id = "wa-area-blur-selection-box";
    selectionBox.style.display = "none";
    selectionLayer.appendChild(selectionBox);

    selectionLayer.addEventListener("pointerdown", onPointerDown);
    selectionLayer.addEventListener("pointermove", onPointerMove);
    selectionLayer.addEventListener("pointerup", onPointerUp);
    document.documentElement.appendChild(selectionLayer);
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    selectionBox.style.display = "block";
    updateSelectionBox(event.clientX, event.clientY);
  }

  function onPointerMove(event) {
    if (!isDragging) return;
    event.preventDefault();
    updateSelectionBox(event.clientX, event.clientY);
  }

  function updateSelectionBox(currentX, currentY) {
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    selectionBox.style.left = `${left}px`;
    selectionBox.style.top = `${top}px`;
    selectionBox.style.width = `${Math.abs(currentX - startX)}px`;
    selectionBox.style.height = `${Math.abs(currentY - startY)}px`;
  }

  function onPointerUp(event) {
    if (!isDragging) return;
    event.preventDefault();
    isDragging = false;
    const left = Math.min(startX, event.clientX);
    const top = Math.min(startY, event.clientY);
    const width = Math.abs(event.clientX - startX);
    const height = Math.abs(event.clientY - startY);

    cancelSelection();
    if (width < 12 || height < 12) return;

    const region = document.createElement("div");
    region.className = BLUR_CLASS;
    Object.assign(region.style, {
      left: `${left}px`, top: `${top}px`,
      width: `${width}px`, height: `${height}px`,
      display: blurVisible ? "block" : "none"
    });
    region.setAttribute("aria-label", "Blurred screen area");
    document.documentElement.appendChild(region);
    blurRegions.push(region);
  }

  function cancelSelection() {
    isDragging = false;
    if (selectionLayer) selectionLayer.remove();
    selectionLayer = null;
    selectionBox = null;
  }

  function clearAll() {
    cancelSelection();
    blurRegions.forEach(region => region.remove());
    blurRegions = [];
  }

  function toggleVisibility() {
    blurVisible = !blurVisible;
    blurRegions.forEach(region => {
      region.style.display = blurVisible ? "block" : "none";
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "WA_AREA_BLUR") return;
    if (message.action === "select") createSelectionLayer();
    if (message.action === "toggle") toggleVisibility();
    if (message.action === "clear") clearAll();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selectionLayer) cancelSelection();
  });
})();