import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Inter, self-hosted and bundled by Vite. Previously it came from the Google
// Fonts CDN, so any machine without internet (or with Google blocked) silently
// fell back to its OS font — Segoe UI on Windows, Roboto/DejaVu on Linux —
// which is why typography differed between PCs. Bundled woff2 renders the
// same everywhere and needs no network.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./index.css";
import { installFetchLogger } from "./utils/apiLogger";
import { installAuthHeader } from "./auth/authHeader";
import { installGlobalErrorLog } from "./utils/fileLog";

// Log every backend request/response (with parameters) to the console.
// Installed before render so no early API call is missed.
installFetchLogger();

// Uncaught errors and rejected promises into src/logs/frontend-error.log.
// Before render for the same reason: a crash during the first paint is
// exactly the one worth having on disk.
installGlobalErrorLog();

// Signs every /api call with the stored bearer token. Installed here for the
// same reason as the logger: one place, before the first request goes out.
installAuthHeader();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);