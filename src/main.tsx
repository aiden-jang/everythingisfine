import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { writeStoryMoment } from "./app/observations/storyMoment";
import { StorySourceProvider } from "./app/observations/StorySourceStatus";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

async function start() {
  if (location.pathname.startsWith("/share/")) {
    try {
      const params = new URLSearchParams(location.hash.slice(1));
      const decode = async () => {
        if (location.pathname.startsWith("/share/tonga/")) {
          const { pressureMoment } = await import("./app/tonga/pressureShare");
          const moment = pressureMoment(location.pathname);
          return moment && { ...moment, map: params.get("p") === "map" };
        }
        if (location.pathname.startsWith("/share/moonfall/")) {
          const { moonfallMoment } = await import("./app/moonfall/moonfallShare");
          return moonfallMoment(location.pathname, params, Date.now());
        }
      };
      const moment = await decode();
      if (moment) {
        const fragment = new URLSearchParams();
        writeStoryMoment(fragment, moment);
        history.replaceState(null, "", `/#${fragment.toString()}`);
      }
    } catch {
      createRoot(root!).render(
        <main style={{ padding: "40px", color: "#e4edeb" }}>
          <h1>This finding couldn’t open.</h1>
          <p>The saved link is unchanged. Reload this page to try again.</p>
          <a href="/">Explore the observatory</a>
        </main>,
      );
      return;
    }
  }
  createRoot(root!).render(
    <StrictMode>
      <StorySourceProvider>
        <App />
      </StorySourceProvider>
    </StrictMode>,
  );
}
void start();
