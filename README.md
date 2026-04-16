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

## Limitations

- Very large PDFs can consume high memory and be slower on phones.
- Conversion happens fully in the client browser, so performance depends on device power.

## Project Files

- `index.html` - app structure and CDN library imports
- `styles.css` - visual design and responsive behavior
- `app.js` - PDF rendering + flipbook logic