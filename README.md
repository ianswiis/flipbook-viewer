# Flipbook Viewer (GitHub Pages)

This project is a browser-only PDF to flipbook creator designed for GitHub Pages.

Users can upload a local PDF file, and the app will:

1. Parse the PDF with PDF.js.
2. Render each page to an image in the browser.
3. Build a page-turning flipbook using StPageFlip.

No backend is required, and uploaded PDFs are not sent to a server.

## Features

- Local PDF upload (`input type="file"`).
- Drag-and-drop PDF support in the viewer area.
- In-browser PDF rendering with Mozilla PDF.js.
- Animated page-turn effect with StPageFlip.
- Previous/Next navigation and direct page jump.
- Quality mode selector: `Fast`, `Balanced`, `High`.
- Optional Xano backend integration for share links.
- Mobile-friendly responsive layout.

## Tech Stack

- `HTML`, `CSS`, `JavaScript`
- `PDF.js` via CDN
- `StPageFlip` via CDN

## Run Locally

You can open `index.html` directly, but using a local server is more reliable:

```bash
npx serve .
```

Then open the local URL in your browser.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. In the GitHub repository, open **Settings** -> **Pages**.
3. Under **Build and deployment**, set:
	- **Source**: `Deploy from a branch`
	- **Branch**: `main` (or your default branch), folder `/ (root)`
4. Save and wait for deployment.
5. Open the generated Pages URL.

## How It Works

- `index.html` contains the upload control, navigation controls, and flipbook container.
- `app.js` reads the selected PDF as an `ArrayBuffer`, renders pages with PDF.js, and initializes StPageFlip from generated page elements.
- `styles.css` provides responsive UI styling and viewer layout.

## Optional Backend Sharing With Xano

The app now includes a **Create Share Link** workflow that can store PDFs on a backend and generate a URL another user can open.

### 1) Configure Xano endpoints in `app.js`

Update the `XANO_CONFIG` object:

- `apiBaseUrl` (required)
- `uploadPdfPath`
- `createSharePath`
- `resolveSharePath`
- `apiKey` (optional, if your endpoint requires auth)

### 2) Expected API behavior

Upload endpoint (`POST`):

- Receives multipart form-data with `file`
- Returns JSON containing one of: `file_url`, `fileUrl`, `url`, `pdf_url`, `pdfUrl`

Create share endpoint (`POST`):

- Receives JSON: `file_url`, `filename`, `page_count`, `created_at`
- Returns either:
	- `share_url` / `shareUrl`, or
	- token-like value in `share_token`, `shareToken`, `token`, or `id`

Resolve share endpoint (`GET /{token}`):

- Returns JSON with file URL and optional `filename`
- File URL keys supported: `file_url`, `fileUrl`, `url`, `pdf_url`, `pdfUrl`

### 3) Share URL format

If your create endpoint returns a full URL, that URL is used directly.

If it returns only a token, the app creates a URL like:

`https://your-site.example/?book=TOKEN`

When someone opens that link, the app resolves the token through Xano and opens the document automatically.

## Limitations

- Very large PDFs can consume high memory and be slower on phones.
- Conversion happens fully in the client browser, so performance depends on device power.

## Project Files

- `index.html` - app structure and CDN library imports
- `styles.css` - visual design and responsive behavior
- `app.js` - PDF rendering + flipbook logic