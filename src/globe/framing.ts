export const DEFAULT_CAMERA = { lon: -74.006, lat: 40.7128, zoom: 1 } as const;

// The camera stays short of the poles, where its up vector would flip.
export const LAT_LIMIT = 85;
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 12;
