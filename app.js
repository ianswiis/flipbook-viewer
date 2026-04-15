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
const saveShareBtn = document.getElementById("saveShareBtn");
const copyShareBtn = document.getElementById("copyShareBtn");
const shareLinkOutput = document.getElementById("shareLinkOutput");

// Configure these endpoints after creating API endpoints in Xano.
const XANO_CONFIG = {
  apiBaseUrl: "",
  uploadPdfPath: "/flipbooks/upload",
  createSharePath: "/flipbooks/share",
  resolveSharePath: "/flipbooks/share",
  apiKey: "",
};

let pageFlip = null;
let currentPage = 1;
let pageCount = 0;
let currentObjectUrls = [];
let bookDimensions = { width: 900, height: 1200 };
let currentPdfBytes = null;
let currentPdfName = "";
const BLANK_FRONT_PAGE_COUNT = 1;
const BLANK_BACK_PAGE_COUNT = 1;

const DEFAULT_PAGE_WIDTH = 900;
const DEFAULT_PAGE_HEIGHT = 1200;
const QUALITY_PRESETS = {
  fast: { scale: 0.95, imageQuality: 0.8, label: "Fast" },
  balanced: { scale: 1.25, imageQuality: 0.9, label: "Balanced" },
  high: { scale: 1.6, imageQuality: 0.94, label: "High" },
};

let dragDepth = 0;

function isXanoConfigured() {
  return Boolean(XANO_CONFIG.apiBaseUrl.trim());
}

function buildApiUrl(path) {
  const base = XANO_CONFIG.apiBaseUrl.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

function buildApiHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const apiKey = XANO_CONFIG.apiKey.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function extractFileUrl(payload) {
  return payload.file_url || payload.fileUrl || payload.url || payload.pdf_url || payload.pdfUrl || "";
}

function extractShareToken(payload) {
  return payload.share_token || payload.shareToken || payload.token || payload.id || "";
}

function extractShareUrl(payload) {
  return payload.share_url || payload.shareUrl || "";
}

function updateShareControls() {
  const canShare = isXanoConfigured() && currentPdfBytes;
  saveShareBtn.disabled = !canShare;
  copyShareBtn.disabled = !shareLinkOutput.value;
}

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

  if (currentPage > BLANK_FRONT_PAGE_COUNT + pageCount) {
    pageIndicator.textContent = `PDF page ${pageCount} of ${pageCount}`;
    pageNumberInput.value = String(pageCount);
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

function buildBlankBackPageNode() {
  const pageNode = document.createElement("div");
  pageNode.className = "page blank-back-page";
  pageNode.setAttribute("aria-label", "Blank back page");
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
  shareLinkOutput.value = "";
  setControlsEnabled(false);
  updateShareControls();
  updateIndicator();
}

async function uploadPdfToXano(pdfBytes, filename) {
  const fileBlob = new Blob([pdfBytes], { type: "application/pdf" });
  const formData = new FormData();
  formData.append("file", fileBlob, filename || "document.pdf");

  const response = await fetch(buildApiUrl(XANO_CONFIG.uploadPdfPath), {
    method: "POST",
    body: formData,
    headers: buildApiHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const fileUrl = extractFileUrl(payload);
  if (!fileUrl) {
    throw new Error("Upload endpoint did not return a file URL.");
  }

  return fileUrl;
}

async function createShareRecordInXano(fileUrl, name, pages) {
  const response = await fetch(buildApiUrl(XANO_CONFIG.createSharePath), {
    method: "POST",
    headers: buildApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      file_url: fileUrl,
      filename: name,
      page_count: pages,
      created_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Share create failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const shareUrl = extractShareUrl(payload);
  if (shareUrl) {
    return shareUrl;
  }

  const token = extractShareToken(payload);
  if (!token) {
    throw new Error("Share endpoint did not return a token or share URL.");
  }

  const url = new URL(window.location.href);
  url.searchParams.set("book", token);
  return url.toString();
}

async function resolveSharedBookFromXano(token) {
  const response = await fetch(buildApiUrl(`${XANO_CONFIG.resolveSharePath}/${encodeURIComponent(token)}`), {
    method: "GET",
    headers: buildApiHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Share resolve failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const fileUrl = extractFileUrl(payload);
  if (!fileUrl) {
    throw new Error("Resolve endpoint did not return a file URL.");
  }

  return {
    fileUrl,
    filename: payload.filename || payload.name || "shared-document.pdf",
  };
}

async function fetchPdfBytesFromUrl(fileUrl) {
  const response = await fetch(fileUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Could not load shared PDF (status ${response.status}).`);
  }

  return response.arrayBuffer();
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

async function buildFlipbookFromPdfBytes(pdfBytes, sourceName) {
  resetFlipbook();
  setStatus("Reading PDF...");
  const qualityPreset = getSelectedQualityPreset();

  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
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

    if (i === pageCount && BLANK_BACK_PAGE_COUNT > 0) {
      for (let j = 0; j < BLANK_BACK_PAGE_COUNT; j += 1) {
        flipbookEl.appendChild(buildBlankBackPageNode());
      }
    }

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

  currentPdfBytes = pdfBytes.slice(0);
  currentPdfName = sourceName || "document.pdf";
  updateShareControls();
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
    const fileBytes = await file.arrayBuffer();
    await buildFlipbookFromPdfBytes(fileBytes, file.name);
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

saveShareBtn.addEventListener("click", async () => {
  if (!isXanoConfigured()) {
    setStatus("Xano is not configured yet. Add API URLs in app.js.", true);
    return;
  }

  if (!currentPdfBytes) {
    setStatus("Load a PDF before creating a share link.", true);
    return;
  }

  try {
    saveShareBtn.disabled = true;
    setStatus("Saving PDF to backend and creating share link...");
    const fileUrl = await uploadPdfToXano(currentPdfBytes, currentPdfName);
    const shareUrl = await createShareRecordInXano(fileUrl, currentPdfName, pageCount);
    shareLinkOutput.value = shareUrl;
    copyShareBtn.disabled = false;
    setStatus("Share link created.");
  } catch (error) {
    console.error(error);
    setStatus("Could not create share link. Check Xano endpoint config and CORS.", true);
  } finally {
    updateShareControls();
  }
});

copyShareBtn.addEventListener("click", async () => {
  if (!shareLinkOutput.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(shareLinkOutput.value);
    setStatus("Share link copied.");
  } catch (error) {
    console.error(error);
    setStatus("Could not copy automatically. Copy from the text field.", true);
  }
});

async function loadSharedBookFromUrlIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("book");
  if (!token) {
    return;
  }

  if (!isXanoConfigured()) {
    setStatus("Shared link detected, but Xano is not configured in app.js.", true);
    return;
  }

  try {
    dropHint.hidden = true;
    setStatus("Loading shared document...");
    const { fileUrl, filename } = await resolveSharedBookFromXano(token);
    const pdfBytes = await fetchPdfBytesFromUrl(fileUrl);
    await buildFlipbookFromPdfBytes(pdfBytes, filename);
    setStatus("Shared flipbook loaded.");
  } catch (error) {
    console.error(error);
    setStatus("Could not load this shared link.", true);
  }
}

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
updateShareControls();
loadSharedBookFromUrlIfPresent();
