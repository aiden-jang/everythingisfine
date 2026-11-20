import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StorySourceProvider } from "./app/observations/StorySourceStatus";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

async function start() {
  if (location.pathname.startsWith("/share/tonga/")) {
    try {
      const [{ pressureMoment }, { writeStoryMoment }] = await Promise.all([
        import("./app/tonga/pressureShare"),
        import("./app/observations/storyMoment"),
      ]);
      const moment = pressureMoment(location.pathname);
      if (moment) {
        const params = new URLSearchParams();
        writeStoryMoment(params, {
          ...moment,
          map: new URLSearchParams(location.hash.slice(1)).get("p") === "map",
        });
        history.replaceState(null, "", `/#${params.toString()}`);
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
