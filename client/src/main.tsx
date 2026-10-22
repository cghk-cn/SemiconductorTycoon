import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* HashRouter works inside the Capacitor WebView (file:// scheme) where
        BrowserRouter history routing cannot resolve deep paths. */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
