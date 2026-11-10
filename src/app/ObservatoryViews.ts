import { lazy } from "react";
export const SunWatch = lazy(() => import("./sun/SunWatch").then(({ SunWatch }) => ({ default: SunWatch })));

export const TonightSky = lazy(() =>
  import("./tonight/TonightSky").then(({ TonightSky }) => ({ default: TonightSky })),
);
export const TonightCompass = lazy(() =>
  import("./tonight/TonightCompass").then(({ TonightCompass }) => ({ default: TonightCompass })),
);

export const FloatDive = lazy(() =>
  import("./float/FloatDivePanel").then(({ FloatDivePanel }) => ({ default: FloatDivePanel })),
);
