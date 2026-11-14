import { useId } from "react";
import type { eclipseFrom } from "../../geo/eclipse2027";

export function EclipseDisc({ frame }: { frame: ReturnType<typeof eclipseFrom> }): JSX.Element {
  const light = `eclipse-light-${useId()}`;
  const corona = `eclipse-corona-${useId()}`;
  const aperture = `eclipse-aperture-${useId()}`;
  const radius = 29;
  return (
    <svg
      className="shadow-disc"
      viewBox="-86 -86 172 172"
      aria-hidden="true"
      data-total={frame.total || undefined}
      data-ramp=""
    >
      <defs>
        <radialGradient id={light}>
          <stop offset="0%" stopColor="#fff8e8" />
          <stop offset="84%" stopColor="#ffdb9b" />
          <stop offset="100%" stopColor="#eba75c" />
        </radialGradient>
        <radialGradient id={corona}>
          <stop offset="26%" stopColor="#fef7e9" />
          <stop offset="34%" stopColor="#ffe7bf" stopOpacity=".85" />
          <stop offset="50%" stopColor="#e9c6a5" stopOpacity=".24" />
          <stop offset="88%" stopColor="#bcbdd1" stopOpacity="0" />
        </radialGradient>
        <clipPath id={aperture}>
          <circle r="29" />
        </clipPath>
      </defs>
      <g fill="none" stroke="currentColor" opacity=".48" strokeWidth=".45">
        <circle r="58" strokeDasharray="1 3.55" />
        <path d="M-65 0h12m106 0h12M0-65v12m0 106v12" />
      </g>
      <g className="shadow-corona" fill={`url(#${corona})`}>
        <circle r="74" />
        <ellipse rx="82" ry="40" transform="rotate(-18)" />
        <ellipse rx="58" ry="43" transform="rotate(63)" />
        <ellipse rx="78" ry="32" transform="rotate(29)" />
      </g>
      <circle r={radius} fill={`url(#${light})`} />
      <g clipPath={`url(#${aperture})`}>
        <circle
          className="shadow-moon"
          cx={frame.moonX * radius}
          cy={frame.moonY * radius}
          r={frame.moonRadius * radius}
        />
      </g>
    </svg>
  );
}
