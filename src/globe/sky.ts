/*
 * What the two sky layers agree about: how far away the sky is, and how it is turned.
 *
 * The stars and the constellation figures are the same sky drawn twice, so a line that ended up at a
 * different distance or a different rotation than the star it points at would be a line pointing at
 * nothing. Both read from here, which is the only way to be sure they cannot drift apart.
 */

/*
 * Far enough that everything real is in front of it, near enough that the camera's far plane never clips.
 *
 * The camera orbits between roughly one and four units out and the globe is a unit sphere, so almost
 * anything clears those. The moon is what sets this: at apogee it reaches 64 radii from the origin and so
 * up to 68 from the eye, and a star nearer than that draws in front of it. Sixty did, until there was a
 * moon to be in front of. Eighty clears it with room, and the far plane of 100 with more.
 *
 * The exact value sets no scale a viewer can see, because the sky is placed relative to the eye.
 */
export const SKY_DISTANCE = 80;

/*
 * Placing a direction in the sky: the sidereal turn, then the skybox offset.
 *
 * **The turn.** Buffer positions are unit vectors for a right ascension read straight off a catalogue,
 * which is where that point stands when Greenwich sidereal time is zero. Rotating the whole sky by -GMST
 * about the pole puts every one of them over the longitude it is actually above.
 *
 * **The offset.** Adding `cameraPosition` puts every point at a fixed distance from wherever the eye is,
 * so orbiting sweeps the sky and travelling never slides it - which is the tell that gives a fake sky
 * away. Doing it here rather than by chasing the camera from the render loop means neither layer needs a
 * hook in a loop that is deliberately asleep whenever nothing is moving.
 *
 * Declared with its uniforms so the two shaders cannot disagree about their names or their meaning.
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
