import type { ReactNode } from "react";
import { Globe } from "./globe/Globe";
import { createFeed } from "./app/feed";

/*
 * Step 1 of PLAN.md: the frame, and nothing inside it.
 *
 * The gate is that the empty layout is correct at 375, 768 and 1280 with no horizontal scroll at
 * any width. Getting the frame right while it is still cheap to move is the entire reason this is
 * step 1 rather than something done around the globe once the globe exists.
 *
 * Every value on screen reads `--` because there is no source connected yet. That is not a
 * placeholder in the usual sense: it is the honest state of an app with no feed, and it is the same
 * state the rail will show if both feeds ever fail at once.
 */

function Rail(): JSX.Element {
  return (
    <aside className="zone-rail rail border-hairline bg-deck p-4 max-xl:border-b xl:border-r">
      <div>
        <div className="label">Events</div>
        <div className="mt-1 text-[31px] leading-none font-semibold text-faint">--</div>
        <div className="mt-1 text-[9.5px] text-faint">no source connected</div>
      </div>

      <Rows
        rows={[
          ["USGS", "poll"],
          ["EMSC", "push"],
          ["reconciled", "--"],
        ]}
      />

      <div>
        <div className="label">Regions</div>
        <Rows rows={[["--", "--"]]} />
      </div>
    </aside>
  );
}

function Rows({ rows }: { rows: readonly (readonly [string, string])[] }): JSX.Element {
  return (
    <div className="flex flex-col">
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="flex items-center justify-between border-t border-hairline py-1.5 text-[10.5px] text-dim"
        >
          <span>{k}</span>
          <span className="font-mono text-[10px] text-faint">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Header(): JSX.Element {
  return (
    <header className="flex items-center gap-4 border-b border-hairline bg-deck px-4 py-2.5">
      <div className="text-[11px] font-semibold tracking-[0.18em]">FIRST MOTION</div>
      <div className="ml-auto text-[9.5px] tracking-[0.1em] text-faint">STANDING BY</div>
    </header>
  );
}

/** `detail` stays optional: the panel column is `auto`, so it costs no width until step 9 fills it. */
/*
 * The feed is created once, outside the component.
 *
 * Two sources and a fifty-thousand-event ring buffer are not React state and must survive a
 * re-render, a StrictMode double-mount, and every future filter change. Creating it in a ref or an
 * effect would open two WebSockets in development and quietly leave one of them running.
 */
const feed = createFeed();

export function App({ detail }: { detail?: ReactNode }): JSX.Element {
  return (
    <div className="frame">
      <Header />
      <div className="zones">
        <Rail />
        {/* Hidden from assistive tech from the very first commit. The parallel accessible feed in
            step B is the real interface for a screen reader; the canvas is never it. */}
        <main className="zone-canvas bg-void" aria-hidden="true">
          <Globe feed={feed} />
        </main>
        {detail ? (
          <aside className="zone-panel w-[360px] border-l border-hairline bg-deck p-4">{detail}</aside>
        ) : null}
      </div>
    </div>
  );
}
