// Renderer, sky dome and the day-night cycle.
// One directional light plays both sun and moon; its colour, the sky
// gradient, fog and window glow all follow the in-game hour, so a staged
// scene only has to name the hour it wants.

import * as THREE from 'three';

const SKY_STOPS = [
  { h: 0.0, top: 0x060a24, horizon: 0x1b2440, sun: 0x8fb2ff, sunI: 0.25, hemiI: 0.31, fog: 0x11182e, glow: 1.0 },
  { h: 5.0, top: 0x0a1030, horizon: 0x2c2a4a, sun: 0x8fb2ff, sunI: 0.22, hemiI: 0.31, fog: 0x181c36, glow: 1.0 },
  { h: 6.5, top: 0x3a5a9c, horizon: 0xff9e5e, sun: 0xffb37a, sunI: 1.5, hemiI: 0.5, fog: 0xc7a58e, glow: 0.55 },
  { h: 9.0, top: 0x4f9fd8, horizon: 0xbfe3f2, sun: 0xfff2d8, sunI: 2.6, hemiI: 0.85, fog: 0xcfe4ee, glow: 0.0 },
  { h: 13.0, top: 0x3f8fd2, horizon: 0xcfeaf5, sun: 0xfff6e0, sunI: 2.9, hemiI: 0.95, fog: 0xd6ecf2, glow: 0.0 },
  { h: 17.0, top: 0x4a86c8, horizon: 0xf5d9a8, sun: 0xffe3ae, sunI: 2.4, hemiI: 0.8, fog: 0xe3d3ae, glow: 0.1 },
  { h: 18.6, top: 0x2c3a6e, horizon: 0xff7e47, sun: 0xff9a55, sunI: 1.6, hemiI: 0.68, fog: 0xcf9a76, glow: 0.6 },
  { h: 19.6, top: 0x131a3d, horizon: 0x53355e, sun: 0xd88a6a, sunI: 0.5, hemiI: 0.4, fog: 0x3c2c48, glow: 1.0 },
  { h: 21.5, top: 0x060a24, horizon: 0x1b2440, sun: 0x8fb2ff, sunI: 0.25, hemiI: 0.31, fog: 0x11182e, glow: 1.0 },
  { h: 24.0, top: 0x060a24, horizon: 0x1b2440, sun: 0x8fb2ff, sunI: 0.25, hemiI: 0.31, fog: 0x11182e, glow: 1.0 },
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(a, b, t, out) {
  out.setHex(a);
  out.lerp(new THREE.Color(b), t);
  return out;
}

export function makeCanvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe4ee, 180, 900);

  const camera = new THREE.PerspectiveCamera(58, container.clientWidth / container.clientHeight, 0.1, 2400);
  camera.position.set(0, 6, -14);

  // Sky dome with a repaintable vertical gradient.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 512;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -10;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xbfdcff, 0x8a7a5a, 0.8);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const stage = {
    renderer,
    scene,
    camera,
    sun,
    hemi,
    sky,
    skyTex,
    skyCanvas,
    focus: new THREE.Vector3(),
    hour: 10,
    windowGlow: 0,
    streetLightsOn: false,

    setHour(hour) {
      this.hour = ((hour % 24) + 24) % 24;
      const stops = SKY_STOPS;
      let a = stops[stops.length - 1];
      let b = stops[0];
      for (let i = 0; i < stops.length - 1; i++) {
        if (this.hour >= stops[i].h && this.hour <= stops[i + 1].h) {
          a = stops[i];
          b = stops[i + 1];
          break;
        }
      }
      const span = Math.max(0.0001, b.h - a.h);
      const t = Math.min(1, Math.max(0, (this.hour - a.h) / span));

      const ctx = this.skyCanvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      const top = lerpColor(a.top, b.top, t, new THREE.Color());
      const horizon = lerpColor(a.horizon, b.horizon, t, new THREE.Color());
      grad.addColorStop(0, `#${top.getHexString()}`);
      grad.addColorStop(0.55, `#${horizon.getHexString()}`);
      grad.addColorStop(0.72, `#${horizon.getHexString()}`);
      grad.addColorStop(1, `#${top.clone().multiplyScalar(0.7).getHexString()}`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 4, 512);
      this.skyTex.needsUpdate = true;

      const sunColor = lerpColor(a.sun, b.sun, t, new THREE.Color());
      this.sun.color.copy(sunColor);
      this.sun.intensity = lerp(a.sunI, b.sunI, t);
      this.hemi.intensity = lerp(a.hemiI, b.hemiI, t);
      const fog = lerpColor(a.fog, b.fog, t, new THREE.Color());
      this.scene.fog.color.copy(fog);
      this.windowGlow = lerp(a.glow, b.glow, t);
      this.streetLightsOn = this.windowGlow > 0.35;

      // Sun path: rises east, sets west; at night the light becomes the moon.
      const dayT = (this.hour - 6) / 12; // 0 at 06:00, 1 at 18:00
      const ang = Math.PI * Math.min(1, Math.max(0, dayT));
      const elev = Math.sin(ang);
      // The elevation floor keeps the ground readable at dawn and dusk:
      // a grazing sun would leave every road and lawn unlit.
      const sunDir = new THREE.Vector3(Math.cos(ang) * 0.9, Math.max(0.34, elev), 0.45).normalize();
      if (this.hour < 5.5 || this.hour > 19) {
        sunDir.set(-0.4, 0.65, -0.55).normalize(); // moon
      }
      this.sunDir = sunDir;
    },

    updateSunTarget() {
      const d = this.sunDir || new THREE.Vector3(0.5, 0.8, 0.3);
      this.sun.position.copy(this.focus).addScaledVector(d, 190);
      this.sun.target.position.copy(this.focus);
      this.sky.position.copy(this.camera.position);
    },

    resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    },

    render() {
      this.updateSunTarget();
      this.renderer.render(this.scene, this.camera);
    },
  };

  stage.setHour(10);
  window.addEventListener('resize', () => stage.resize());
  return stage;
}
