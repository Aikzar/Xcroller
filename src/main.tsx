import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyAppearanceTheme, DEFAULT_ACCENT_COLOR, getStoredAppearanceTheme } from "./lib/theme";

applyAppearanceTheme(getStoredAppearanceTheme(), DEFAULT_ACCENT_COLOR);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
