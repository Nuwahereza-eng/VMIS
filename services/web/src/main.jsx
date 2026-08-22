import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "./styles/theme.css";
import { AppProvider } from "./context/AppContext.jsx";
import App from "./App.jsx";

// Register the service worker so the app is installable and works offline.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
