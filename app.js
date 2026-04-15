/* global pdfjsLib, St */

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const pdfInput = document.getElementById("pdfInput");
const statusEl = document.getElementById("status");
const flipbookEl = document.getElementById("flipbook");
const flipbookContainer = document.getElementById("flipbookContainer");
const viewerWrap = document.querySelector(".viewer-wrap");
const dropHint = document.getElementById("dropHint");
const qualityMode = document.getElementById("qualityMode");

const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const goToPageBtn = document.getElementById("goToPageBtn");
const pageNumberInput = document.getElementById("pageNumberInput");
const pageIndicator = document.getElementById("pageIndicator");

let pageFlip = null;
let currentPage = 1;
let pageCount = 0;
let currentObjectUrls = [];
let bookDimensions = { width: 900, height: 1200 };
const BLANK_FRONT_PAGE_COUNT = 1;

const DEFAULT_PAGE_WIDTH = 900;
const DEFAULT_PAGE_HEIGHT = 1200;
const QUALITY_PRESETS = {
  fast: { scale: 0.95, imageQuality: 0.8, label: "Fast" },
  balanced: { scale: 1.25, imageQuality: 0.9, label: "Balanced" },
  high: { scale: 1.6, imageQuality: 0.94, label: "High" },
};

let dragDepth = 0;

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function setControlsEnabled(enabled) {
  prevBtn.disabled = !enabled;
  nextBtn.disabled = !enabled;
  goToPageBtn.disabled = !enabled;
  pageNumberInput.disabled = !enabled;
}

function updateIndicator() {
  if (!pageCount) {
    pageIndicator.textContent = "No document loaded";
    pageNumberInput.value = "1";
    pageNumberInput.max = "1";
    return;
  }

  if (currentPage <= BLANK_FRONT_PAGE_COUNT) {
    pageIndicator.textContent = `PDF page 1 of ${pageCount}`;
    pageNumberInput.value = "1";
    pageNumberInput.max = String(pageCount);
    return;
  }

  const pdfPage = Math.min(pageCount, currentPage - BLANK_FRONT_PAGE_COUNT);
  pageIndicator.textContent = `PDF page ${pdfPage} of ${pageCount}`;
  pageNumberInput.value = String(pdfPage);
  pageNumberInput.max = String(pageCount);
}

function buildBlankFrontPageNode() {
  const pageNode = document.createElement("div");
  pageNode.className = "page blank-front-page";
  pageNode.setAttribute("aria-label", "Blank intro page");
  return pageNode;
}

function resetFlipbook() {
  currentObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  currentObjectUrls = [];

  if (pageFlip) {
    pageFlip.destroy();
    pageFlip = null;
  }

  flipbookEl.innerHTML = "";
  currentPage = 1;
  pageCount = 0;
  setControlsEnabled(false);
  updateIndicator();
}

function toBlob(canvas, imageQuality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to encode rendered PDF page."));
        return;
      }
      resolve(blob);
    }, "image/webp", imageQuality);
  });
}

function getSelectedQualityPreset() {
  const selected = qualityMode.value;
  return QUALITY_PRESETS[selected] ?? QUALITY_PRESETS.balanced;
}

async function renderPageAsImage(page, renderScale, imageQuality) {
  const viewport = page.getViewport({ scale: renderScale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  const blob = await toBlob(canvas, imageQuality);
  return URL.createObjectURL(blob);
}

function buildPageNode(imageUrl, pageNum) {
  const pageNode = document.createElement("div");
  pageNode.className = "page";

  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = `PDF page ${pageNum}`;
  img.loading = "lazy";

  pageNode.appendChild(img);
  return pageNode;
}

function initializeFlipbook() {
  const pageWidth = bookDimensions.width || DEFAULT_PAGE_WIDTH;
  const pageHeight = bookDimensions.height || DEFAULT_PAGE_HEIGHT;

  pageFlip = new St.PageFlip(flipbookEl, {
    width: pageWidth,
    height: pageHeight,
    maxShadowOpacity: 0.38,
    size: "stretch",
    minWidth: 260,
    maxWidth: 1280,
    minHeight: 260,
    maxHeight: 1600,
    showCover: false,
    mobileScrollSupport: true,
    flippingTime: 680,
    usePortrait: true,
    startPage: 0,
    drawShadow: true,
  });

  pageFlip.loadFromHTML(document.querySelectorAll("#flipbook .page"));

  pageFlip.on("flip", (event) => {
    currentPage = event.data + 1;
    updateIndicator();
  });

  currentPage = 1;
  updateIndicator();
  setControlsEnabled(true);
}

async function buildFlipbookFromPdf(file) {
  resetFlipbook();
  setStatus("Reading PDF...");
  const qualityPreset = getSelectedQualityPreset();

  const fileData = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: fileData });
  const pdf = await loadingTask.promise;

  pageCount = pdf.numPages;
  if (pageCount > 0) {
    // Match flipbook page shape to the document to avoid portrait/landscape letterboxing.
    const firstPage = await pdf.getPage(1);
    const firstViewport = firstPage.getViewport({ scale: 1 });
    const baseWidth = firstViewport.width;
    const baseHeight = firstViewport.height;
    const longSide = 1200;
    const scaleToLongSide = longSide / Math.max(baseWidth, baseHeight);

    bookDimensions = {
      width: Math.max(260, Math.round(baseWidth * scaleToLongSide)),
      height: Math.max(260, Math.round(baseHeight * scaleToLongSide)),
    };
  }

  if (pageCount > 150) {
    setStatus(
      `Large PDF detected. Rendering may take a while and can use significant memory on mobile (${qualityPreset.label} mode).`
    );
  } else {
    setStatus(
      `Rendering ${pageCount} page${pageCount === 1 ? "" : "s"} in ${qualityPreset.label} mode...`
    );
  }

  for (let i = 1; i <= pageCount; i += 1) {
    if (i === 1 && BLANK_FRONT_PAGE_COUNT > 0) {
      for (let j = 0; j < BLANK_FRONT_PAGE_COUNT; j += 1) {
        flipbookEl.appendChild(buildBlankFrontPageNode());
      }
    }

    const page = await pdf.getPage(i);
    const imageUrl = await renderPageAsImage(page, qualityPreset.scale, qualityPreset.imageQuality);
    currentObjectUrls.push(imageUrl);

    const pageNode = buildPageNode(imageUrl, i);
    flipbookEl.appendChild(pageNode);

    if (i % 4 === 0 || i === pageCount) {
      setStatus(`Rendered ${i}/${pageCount} page${pageCount === 1 ? "" : "s"}...`);
    }
  }

  if (pageCount > 0) {
    flipbookContainer.hidden = false;
    statusEl.hidden = true;
    initializeFlipbook();
    setStatus("Flipbook ready.");
    statusEl.hidden = false;
    statusEl.classList.remove("error");
  }

  window.addEventListener(
    "beforeunload",
    () => {
      currentObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    },
    { once: true }
  );
}

async function handlePdfFile(file) {
  if (!file) {
    return;
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    setStatus("Please upload a valid PDF file.", true);
    return;
  }

  try {
    setControlsEnabled(false);
    statusEl.hidden = false;
    flipbookContainer.hidden = true;
    dropHint.hidden = true;
    await buildFlipbookFromPdf(file);
  } catch (error) {
    console.error(error);
    setStatus("Failed to parse this PDF. Try a different file.", true);
    dropHint.hidden = false;
    resetFlipbook();
  }
}

pdfInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  await handlePdfFile(file);
});

viewerWrap.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  viewerWrap.classList.add("drag-active");
  setStatus("Drop your PDF to create a flipbook.");
});

viewerWrap.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

viewerWrap.addEventListener("dragleave", (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    viewerWrap.classList.remove("drag-active");
    if (!pageCount) {
      setStatus("Upload a PDF to generate your flipbook.");
    }
  }
});

viewerWrap.addEventListener("drop", async (event) => {
  event.preventDefault();
  dragDepth = 0;
  viewerWrap.classList.remove("drag-active");

  const file = event.dataTransfer.files?.[0];
  if (!file) {
    return;
  }

  await handlePdfFile(file);
});

prevBtn.addEventListener("click", () => {
  if (pageFlip) {
    pageFlip.flipPrev();
  }
});

nextBtn.addEventListener("click", () => {
  if (pageFlip) {
    pageFlip.flipNext();
  }
});

goToPageBtn.addEventListener("click", () => {
  if (!pageFlip) {
    return;
  }

  const targetPage = Number.parseInt(pageNumberInput.value, 10);
  if (Number.isNaN(targetPage)) {
    return;
  }

  const clamped = Math.min(Math.max(targetPage, 1), pageCount);
  pageFlip.flip(clamped - 1 + BLANK_FRONT_PAGE_COUNT);
});

setControlsEnabled(false);
updateIndicator();
