import * as THREE from 'three';
import { PALETTE } from './Palette.js';

/**
 * Shared material library. The game uses no textures at all -- every surface
 * is flat colour plus light. That is an art-direction choice first (brutalist
 * forms read better untextured) and an engineering one second (zero asset
 * pipeline, instant load, works offline, the whole build is <1 MB).
 *
 * Materials are cached and shared aggressively so Three.js can batch.
 */
const cache = new Map();

function std(key, params) {
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial(params));
  return cache.get(key);
}

export const MAT = {
  floor:   () => std('floor',   { color: PALETTE.graphite, roughness: 0.92, metalness: 0.04 }),
  wall:    () => std('wall',    { color: PALETTE.slate,    roughness: 0.85, metalness: 0.05 }),
  pillar:  () => std('pillar',  { color: PALETTE.ceramic,  roughness: 0.6,  metalness: 0.02 }),
  bone:    () => std('bone',    { color: PALETTE.bone,     roughness: 0.55, metalness: 0.02 }),
  ash:     () => std('ash',     { color: PALETTE.ash,      roughness: 0.8,  metalness: 0.05 }),
  // Metalness is kept low on purpose. There is no environment map in this
  // game (no assets, by design), and a high-metalness surface with nothing to
  // reflect renders as a black hole. Brushed-brass numbers read as brass;
  // physically-correct ones read as a bug.
  brass:   () => std('brass',   { color: PALETTE.brass,    roughness: 0.42, metalness: 0.28 }),
  dark:    () => std('dark',    { color: PALETTE.void,     roughness: 0.95, metalness: 0.0  }),

  /** Anything the player owns glows cyan. */
  flux: () => {
    if (!cache.has('flux')) cache.set('flux', new THREE.MeshBasicMaterial({
      color: PALETTE.flux, toneMapped: false,
    }));
    return cache.get('flux');
  },

  /** Anything hostile glows oxide. */
  oxide: (intensity = 1) => std('oxide' + intensity, {
    color: PALETTE.oxide, emissive: PALETTE.oxide,
    emissiveIntensity: intensity, roughness: 0.5, metalness: 0.1,
  }),

  gold: () => {
    if (!cache.has('gold')) cache.set('gold', new THREE.MeshBasicMaterial({
      color: PALETTE.gold, toneMapped: false,
    }));
    return cache.get('gold');
  },
};

/**
 * The Echo material.
 *
 * The echo has to satisfy three contradictory requirements at once:
 *  1. Instantly distinguishable from you and from enemies (colour: violet).
 *  2. Clearly *not solid* -- it is a replay, it does not block you.
 *  3. Still readable at 60 m across a bright arena.
 *
 * Solid transparency fails (3); pure wireframe fails (3) too. The answer is
 * additive fresnel: the silhouette edge blazes, the interior stays open, and
 * a scrolling scanline sells "recording" without costing legibility. A slow
 * vertical wipe marks the moment the echo is about to catch up to a SHIFT
 * point, so you can time a crossfire by eye rather than by HUD.
 */
export function makeEchoMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime:    { value: 0 },
      uColor:   { value: new THREE.Color(PALETTE.echo) },
      uOpacity: { value: 1.0 },
      uHurt:    { value: 0.0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vPosW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3  uColor;
      uniform float uOpacity;
      uniform float uHurt;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vPosW;
      void main() {
        // Fresnel: edges bright, interior open. This is what makes the
        // silhouette readable at range without occluding the fight.
        float fres = pow(1.0 - clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0), 2.2);

        // Scanlines in world space so they stay put as the echo moves --
        // it reads as a projection of a recording, not as painted-on texture.
        float scan = 0.5 + 0.5 * sin(vPosW.y * 42.0 - uTime * 5.0);
        scan = mix(0.72, 1.0, scan);

        // Rare horizontal dropout band: the tape glitching.
        float band = smoothstep(0.985, 1.0, sin(vPosW.y * 3.1 - uTime * 1.7));

        vec3 col = uColor * (0.34 + fres * 1.55) * scan;
        col = mix(col, vec3(1.0, 0.42, 0.22), uHurt);
        float a = (0.20 + fres * 0.78) * uOpacity * (1.0 - band * 0.65);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
}
