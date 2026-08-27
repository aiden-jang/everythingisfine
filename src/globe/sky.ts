/*
 * What the two sky layers agree about: how far away the sky is, and how it is turned. A line that ended up at
 * a different distance or rotation than the star it points at would be a line pointing at nothing.
 */

/*
 * Far enough that everything real is in front of it, near enough that the camera's far plane never clips.
 *
 * The moon sets this: at apogee it reaches 64 radii from the origin and up to 68 from the eye, so a star
 * nearer than that draws in front of it. Sixty did, until there was a moon to be in front of.
 *
 * The exact value sets no scale a viewer can see, because the sky is placed relative to the eye.
 */
export const SKY_DISTANCE = 80;

/*
 * Placing a direction in the sky: the sidereal turn, then the skybox offset.
 *
 * Buffer positions are unit vectors for a right ascension read straight off a catalogue, so rotating the whole
 * sky by -GMST about the pole puts every one over the longitude it is actually above.
 *
 * Adding `cameraPosition` puts every point at a fixed distance from wherever the eye is, so orbiting sweeps
 * the sky and travelling never slides it. Here rather than from the render loop, so neither layer needs a hook
 * in a loop that is deliberately asleep whenever nothing is moving.
 *
 * Declared with its uniforms so the two shaders cannot disagree about their names.
 */
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
