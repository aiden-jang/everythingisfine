import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Web Analytics. The token is locked to everythingisfine.aidenjang.com, so anywhere else the beacon is
// CORS-refused and adds nothing but console noise.
if (import.meta.env.PROD && location.hostname === "everythingisfine.aidenjang.com") {
  const beacon = document.createElement("script");
  beacon.type = "module";
  beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
  beacon.setAttribute("data-cf-beacon", '{"token": "aebe0dfac8b849ee8a826e66148117d0"}');
  document.body.appendChild(beacon);
}
