/*
 * What the two sky layers agree about: how far away the sky is, and how it is turned. A line that ended up at
 * a different distance or rotation than the star it points at would be a line pointing at nothing.
 */

/* Far enough that everything real is in front of it, near enough that the camera's far plane never clips.
   See ARCHITECTURE.md#srcglobeskyts. */
export const SKY_DISTANCE = 80;

/* Placing a direction in the sky: the sidereal turn, then the skybox offset. See ARCHITECTURE.md#srcglobeskyts. */
export const SKY_GLSL = /* glsl */ `
  uniform float uSpin;
  uniform float uDistance;

  vec3 skyPoint(vec3 dir) {
    float s = sin(uSpin);
    float c = cos(uSpin);
    vec3 turned = vec3(dir.x * c + dir.z * s, dir.y, dir.z * c - dir.x * s);
    return turned * uDistance + cameraPosition;
  }
`;
