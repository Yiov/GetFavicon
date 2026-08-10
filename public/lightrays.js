/**
 * LightRays — 动态光束背景
 * 从 OGL + React LightRays 组件转换为 vanilla Three.js 全屏四边形
 * 着色器完全保留原始逻辑
 */

import * as THREE from 'three';

/* ============================================
   Helpers
   ============================================ */

const hexToRgb = hex => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [1, 1, 1];
};

const getAnchorAndDir = (origin, w, h) => {
  const outside = 0.2;
  switch (origin) {
    case 'top-left':
      return { anchor: [0, -outside * h], dir: [0, 1] };
    case 'top-right':
      return { anchor: [w, -outside * h], dir: [0, 1] };
    case 'left':
      return { anchor: [-outside * w, 0.5 * h], dir: [1, 0] };
    case 'right':
      return { anchor: [(1 + outside) * w, 0.5 * h], dir: [-1, 0] };
    case 'bottom-left':
      return { anchor: [0, (1 + outside) * h], dir: [0, -1] };
    case 'bottom-center':
      return { anchor: [0.5 * w, (1 + outside) * h], dir: [0, -1] };
    case 'bottom-right':
      return { anchor: [w, (1 + outside) * h], dir: [0, -1] };
    default: // "top-center"
      return { anchor: [0.5 * w, -outside * h], dir: [0, 1] };
  }
};

/* ============================================
   Shaders — 从 OGL 直译，逻辑完全保留
   ============================================ */

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragmentShader = /* glsl */ `precision highp float;

uniform float iTime;
uniform vec2  iResolution;

uniform vec2  rayPos;
uniform vec2  rayDir;
uniform vec3  raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform float pulsating;
uniform float fadeDistance;
uniform float saturation;
uniform vec2  mousePos;
uniform float mouseInfluence;
uniform float noiseAmount;
uniform float distortion;

varying vec2 vUv;

float noise(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord,
                  float seedA, float seedB, float speed) {
  vec2 sourceToCoord = coord - raySource;
  vec2 dirNorm = normalize(sourceToCoord);
  float cosAngle = dot(dirNorm, rayRefDirection);

  float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;
  
  float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));

  float distance = length(sourceToCoord);
  float screenDiagonal = length(iResolution.xy);
  float maxDistance = screenDiagonal * rayLength;
  float lengthFalloff = clamp((maxDistance - distance) / maxDistance, 0.0, 1.0);
  
  float fadeFalloff = clamp((screenDiagonal * fadeDistance - distance) / (screenDiagonal * fadeDistance), 0.5, 1.0);
  float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;

  float baseStrength = clamp(
    (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +
    (0.3 + 0.2 * cos(-distortedAngle * seedB + iTime * speed)),
    0.0, 1.0
  );

  return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);
  
  vec2 finalRayDir = rayDir;
  if (mouseInfluence > 0.0) {
    vec2 mouseScreenPos = mousePos * iResolution.xy;
    vec2 mouseDirection = normalize(mouseScreenPos - rayPos);
    finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));
  }

  vec4 rays1 = vec4(1.0) *
               rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349,
                           1.5 * raysSpeed);
  vec4 rays2 = vec4(1.0) *
               rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.0234,
                           1.1 * raysSpeed);

  fragColor = rays1 * 0.5 + rays2 * 0.4;

  if (noiseAmount > 0.0) {
    float n = noise(coord * 0.01 + iTime * 0.1);
    fragColor.rgb *= (1.0 - noiseAmount + noiseAmount * n);
  }

  float brightness = 1.0 - (coord.y / iResolution.y);
  fragColor.x *= 0.1 + brightness * 0.8;
  fragColor.y *= 0.3 + brightness * 0.6;
  fragColor.z *= 0.5 + brightness * 0.5;

  if (saturation != 1.0) {
    float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114));
    fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation);
  }

  fragColor.rgb *= raysColor;
}

void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}`;

/* ============================================
   initLightRays — 入口
   ============================================ */

export function initLightRays(canvas, options = {}) {
  const {
    raysOrigin = 'top-center',
    raysColor = '#ffffff',
    raysSpeed = 1,
    lightSpread = 1,
    rayLength = 2,
    pulsating = false,
    fadeDistance = 1.0,
    saturation = 1.0,
    followMouse = true,
    mouseInfluence = 0.1,
    noiseAmount = 0.0,
    distortion = 0.0,
  } = options;

  // ---- Renderer ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);

  // WebGL 上下文容错
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('LightRays: WebGL context lost, pausing');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    console.log('LightRays: WebGL context restored, resuming');
  });

  // ---- Scene & Camera ----
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // ---- Geometry (full-screen quad) ----
  const geometry = new THREE.PlaneGeometry(2, 2);

  // ---- Uniforms ----
  const uniforms = {
    iTime: { value: 0 },
    iResolution: { value: [1, 1] },
    rayPos: { value: [0, 0] },
    rayDir: { value: [0, 1] },
    raysColor: { value: hexToRgb(raysColor) },
    raysSpeed: { value: raysSpeed },
    lightSpread: { value: lightSpread },
    rayLength: { value: rayLength },
    pulsating: { value: pulsating ? 1.0 : 0.0 },
    fadeDistance: { value: fadeDistance },
    saturation: { value: saturation },
    mousePos: { value: [0.5, 0.5] },
    mouseInfluence: { value: mouseInfluence },
    noiseAmount: { value: noiseAmount },
    distortion: { value: distortion },
  };

  // ---- Material ----
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // ---- Mouse tracking ----
  const mouse = { x: 0.5, y: 0.5 };
  const smoothMouse = { x: 0.5, y: 0.5 };

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) / rect.width;
    mouse.y = (e.clientY - rect.top) / rect.height;
  }

  if (followMouse) {
    window.addEventListener('mousemove', onMouseMove);
  }

  // ---- Resize ----
  function updatePlacement() {
    const wCSS = canvas.clientWidth;
    const hCSS = canvas.clientHeight;
    if (wCSS === 0 || hCSS === 0) return;

    const dpr = renderer.getPixelRatio();
    const w = wCSS * dpr;
    const h = hCSS * dpr;

    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(wCSS, hCSS, false);
    }

    uniforms.iResolution.value = [w, h];
    const { anchor, dir } = getAnchorAndDir(raysOrigin, w, h);
    uniforms.rayPos.value = anchor;
    uniforms.rayDir.value = dir;
  }

  // ---- Visibility ----
  let visible = true;
  function onVisibility() {
    visible = !document.hidden;
  }
  document.addEventListener('visibilitychange', onVisibility);

  // ---- Animation Loop ----
  function animate(t) {
    requestAnimationFrame(animate);
    if (!visible) return;

    uniforms.iTime.value = t * 0.001;

    if (followMouse && mouseInfluence > 0) {
      const smoothing = 0.92;
      smoothMouse.x = smoothMouse.x * smoothing + mouse.x * (1 - smoothing);
      smoothMouse.y = smoothMouse.y * smoothing + mouse.y * (1 - smoothing);
      // 仅水平跟随，Y 固定在顶部避免光束下移
      uniforms.mousePos.value = [smoothMouse.x, 0.0];
    }

    renderer.render(scene, camera);
  }

  updatePlacement();
  requestAnimationFrame(animate);

  // ---- Cleanup ----
  function cleanup() {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('resize', updatePlacement);
    renderer.dispose();
    geometry.dispose();
    material.dispose();
  }

  window.addEventListener('resize', updatePlacement);

  return { cleanup };
}
