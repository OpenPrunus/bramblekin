// Bramblekin — démo 3D locale (non publiée) : les vraies cartes du jeu en volume, avec three.js.
import * as THREE from 'three';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/jsm/postprocessing/OutputPass.js';

const zones = await (await fetch('zones.json')).json();
const content = await (await fetch('content.json')).json();
const $ = (id) => document.getElementById(id);

// --- ambiances (mêmes couleurs que la version 2D) -----------------------------------------------------------------
const THEMES = {
  1: { g: 0x8ad06e, gd: 0x6fb85a, t: 0x3f9a52, td: 0x2a7340, p: 0xead6a4, w: 0x4fa6e6, sky: 0x9fd3f5 },
  2: { g: 0x96d466, gd: 0x78bb4e, t: 0x47a046, td: 0x2e7633, p: 0xe4cf9a, w: 0x4fa6e6, sky: 0xa6d8f5 },
  3: { g: 0x8ccf8c, gd: 0x6db472, t: 0x3a8f66, td: 0x256a4a, p: 0xeedfb4, w: 0x3f98de, sky: 0xa9d6ef },
  4: { g: 0xb4d466, gd: 0x97ba4d, t: 0x68973c, td: 0x4a722a, p: 0xead09a, w: 0x4fa6e6, sky: 0xb4dcf5 },
  5: { g: 0xb2c294, gd: 0x96a77a, t: 0x66805a, td: 0x485e40, p: 0xd3c3a3, w: 0x4f94c8, sky: 0xb9cfe0 },
  6: { g: 0xa6dc98, gd: 0x88c27c, t: 0x55a676, td: 0x3a7c56, p: 0xefe0b6, w: 0x5ab6ec, sky: 0xa8dcf8 },
  7: { g: 0xeef4f7, gd: 0xd5e2e9, t: 0x5f9690, td: 0x416f6a, p: 0xd4dee6, w: 0x86c9ea, sky: 0xcfe3ee },
  8: { g: 0x7c9c66, gd: 0x638250, t: 0x46663f, td: 0x2f472b, p: 0xb4a681, w: 0x5c8a78, sky: 0x9fb5a8 },
  9: { g: 0x8a8cb4, gd: 0x6f7299, t: 0x4f4c7c, td: 0x36345a, p: 0xb3aac4, w: 0x6476bd, sky: 0x8f8fb8 },
  10: { g: 0xd3e2e8, gd: 0xb7cbd3, t: 0x58867d, td: 0x3c625b, p: 0xe2dccf, w: 0x86c9ea, sky: 0xc9e2ef },
};
const theme = (n) => THEMES[n] ?? THEMES[10];
const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// --- moteur ---------------------------------------------------------------------------------------------------------
// Profil de qualité : téléphone (léger) ou ordinateur. La résolution s'ajuste ensuite toute seule à la fluidité mesurée.
const MOBILE = window.matchMedia?.('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600;
const Q = MOBILE
  ? { maxRatio: Math.min(1.5, window.devicePixelRatio), minRatio: 0.7, fps: 30, shadow: 1024, bloom: false, blades: 9, tex: 48, aa: false, side: 5 }
  : { maxRatio: Math.min(1.75, window.devicePixelRatio), minRatio: 0.8, fps: 60, shadow: 2048, bloom: true, blades: 16, tex: 80, aa: true, side: 8 };
let ratio = MOBILE ? Math.min(1.25, Q.maxRatio) : Q.maxRatio;
const renderer = new THREE.WebGLRenderer({ antialias: Q.aa, powerPreference: MOBILE ? 'low-power' : 'default' });
renderer.setPixelRatio(ratio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;        // les ombres ne sont recalculées que lorsque quelque chose bouge
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
const hemi = new THREE.HemisphereLight(0xdff2ff, 0x5a7a40, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(Q.shadow, Q.shadow);
sun.shadow.camera.left = -18; sun.shadow.camera.right = 18; sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const outdoorRoot = new THREE.Group();
const interiorRoot = new THREE.Group();
scene.add(outdoorRoot, interiorRoot);
const time = { value: 0 };

// halo lumineux discret (lanternes, écrans, reflets)
let composer = null;
if (Q.bloom) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.35, 0.6, 0.86));
  composer.addPass(new OutputPass());
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  composer?.setPixelRatio(ratio);
  composer?.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts });
function mesh(geo, material, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

/** Vent : fait onduler un matériau (herbes, feuillage) selon la hauteur du sommet. */
function windy(material, strength) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 base = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 base = vec2(0.0);
      #endif
      float h = max(position.y, 0.0);
      transformed.x += sin(uTime * 1.8 + base.x * 0.9 + base.y * 0.6) * h * h * ${strength.toFixed(3)};
      transformed.z += cos(uTime * 1.3 + base.x * 0.5) * h * h * ${(strength * 0.5).toFixed(3)};`);
  };
  return material;
}

// --- sol peint (herbe, chemins, sable mouillé, parquet) ------------------------------------------------------------
function groundTexture(zone, th) {
  const rows = zone.rows;
  const P = Q.tex;
  const c = document.createElement('canvas');
  c.width = rows[0].length * P; c.height = rows.length * P;
  const g = c.getContext('2d');
  const inside = zone.kind === 'inside' || zone.kind === 'gym';
  if (inside) {
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) {
      if (zone.kind === 'gym') { g.fillStyle = (x + y) % 2 ? '#f2eee4' : '#d9d2c2'; g.fillRect(x * P, y * P, P, P); g.strokeStyle = 'rgba(0,0,0,.08)'; g.strokeRect(x * P, y * P, P, P); continue; }
      for (let k = 0; k < 4; k++) { const q = P / 4; g.fillStyle = ['#c99a6b', '#c08f60', '#d1a576', '#bd8c5c'][(k + y + x * 3) % 4]; g.fillRect(x * P, y * P + k * q, P, q); g.fillStyle = 'rgba(80,45,20,.25)'; g.fillRect(x * P, y * P + k * q + q - 1, P, 1.5); }
    } });
  } else {
    g.fillStyle = hex(th.g); g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < rows.length * rows[0].length * 3; i++) {
      const x = hash(i, 3) * c.width; const y = hash(7, i) * c.height; const r = 10 + hash(i, i) * 30;
      g.fillStyle = hash(i, 9) > 0.5 ? 'rgba(255,255,220,.06)' : 'rgba(0,40,0,.07)';
      g.beginPath(); g.ellipse(x, y, r * 1.4, r, 0, 0, Math.PI * 2); g.fill();
    }
    const isPath = (x, y) => y < 0 || y >= rows.length || x < 0 || x >= rows[0].length || ',D'.includes(rows[y][x]);
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ',' || ch === 'D') {
        const up = isPath(x, y - 1); const dn = isPath(x, y + 1); const lf = isPath(x - 1, y); const rt = isPath(x + 1, y);
        const r = P * 0.34;
        g.fillStyle = hex(th.p);
        g.beginPath(); g.roundRect(x * P - (lf ? 1 : -2), y * P - (up ? 1 : -2), P + (lf ? 1 : -2) + (rt ? 1 : -2), P + (up ? 1 : -2) + (dn ? 1 : -2), [!up && !lf ? r : 0, !up && !rt ? r : 0, !dn && !rt ? r : 0, !dn && !lf ? r : 0]); g.fill();
        for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(120,90,50,.25)'; g.beginPath(); g.ellipse(x * P + hash(x * 3 + k, y) * P, y * P + hash(y * 5 + k, x) * P, 2 + hash(k, x) * 3, 1.5 + hash(x, k) * 2, 0, 0, Math.PI * 2); g.fill(); }
      } else if (ch === '~') {
        g.fillStyle = '#d9c590'; g.fillRect(x * P - 6, y * P - 6, P + 12, P + 12);
      } else if (ch === '"') {
        g.fillStyle = hex(th.gd); g.fillRect(x * P, y * P, P, P);
      }
    } });
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '~') { g.fillStyle = '#2f6fa8'; g.fillRect(x * P, y * P, P, P); } });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

// --- personnages -------------------------------------------------------------------------------------------------
const LOOKS = [0xd6463d, 0x3f7fd6, 0x3ea65a, 0xe6a52c, 0x8c55c9, 0xe46fa8, 0x2fb3b3, 0x6b6b78];
function character({ shirt = 0xd6463d, hair = 0x4a2f22, pants = 0x3b4664, skin = 0xf3c9a1, hat = null } = {}) {
  const g = new THREE.Group();
  const legs = [];
  for (const sx of [-0.09, 0.09]) {
    const leg = new THREE.Group();
    const l = mesh(new THREE.CapsuleGeometry(0.065, 0.18, 4, 10), mat(pants));
    l.position.y = -0.13;
    const shoe = mesh(new THREE.SphereGeometry(0.08, 12, 8), mat(0x3a2b24));
    shoe.scale.set(1, 0.6, 1.4); shoe.position.set(0, -0.26, 0.03);
    leg.add(l, shoe);
    leg.position.set(sx, 0.3, 0);
    g.add(leg); legs.push(leg);
  }
  const body = mesh(new THREE.CapsuleGeometry(0.17, 0.16, 6, 16), mat(shirt, { roughness: 0.6 }));
  body.position.y = 0.48; body.scale.set(1, 1, 0.8);
  g.add(body);
  const arms = [];
  for (const sx of [-0.22, 0.22]) {
    const arm = new THREE.Group();
    const a = mesh(new THREE.CapsuleGeometry(0.05, 0.16, 4, 8), mat(skin));
    a.position.y = -0.1;
    arm.add(a); arm.position.set(sx, 0.56, 0);
    g.add(arm); arms.push(arm);
  }
  const head = mesh(new THREE.SphereGeometry(0.22, 24, 18), mat(skin, { roughness: 0.55 }));
  head.position.y = 0.86;
  g.add(head);
  const hairM = mesh(new THREE.SphereGeometry(0.235, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(hair, { roughness: 0.5 }));
  hairM.position.y = 0.88; hairM.rotation.x = -0.25;
  g.add(hairM);
  for (const sx of [-0.08, 0.08]) {
    const eye = mesh(new THREE.SphereGeometry(0.035, 12, 10), mat(0x22202c, { roughness: 0.2 }), false, false);
    eye.scale.set(0.8, 1.2, 0.5); eye.position.set(sx, 0.86, 0.2);
    const shine = mesh(new THREE.SphereGeometry(0.012, 8, 6), mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 }), false, false);
    shine.position.set(sx - 0.012, 0.875, 0.218);
    g.add(eye, shine);
  }
  if (hat) {
    const h = mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.1, 20), mat(hat));
    h.position.y = 1.06;
    g.add(h);
  }
  g.userData = { legs, arms, body, head };
  return g;
}

function animateWalk(ch, phase, moving) {
  const { legs, arms } = ch.userData;
  const s = moving ? Math.sin(phase) * 0.7 : 0;
  legs[0].rotation.x = s; legs[1].rotation.x = -s;
  arms[0].rotation.x = -s * 0.8; arms[1].rotation.x = s * 0.8;
}

// --- créature compagnon (forme ronde, oreilles, flamme) -------------------------------------------------------------
function creature(color = 0xf07a3e, accent = 0xffc06e) {
  const g = new THREE.Group();
  const m = mat(color, { roughness: 0.35, metalness: 0.0 });
  const body = mesh(new THREE.SphereGeometry(0.26, 32, 24), m);
  body.scale.set(1, 0.9, 0.95); body.position.y = 0.26;
  const belly = mesh(new THREE.SphereGeometry(0.17, 24, 18), mat(accent, { roughness: 0.4 }));
  belly.position.set(0, 0.22, 0.13); belly.scale.set(1, 1, 0.6);
  g.add(body, belly);
  for (const sx of [-0.12, 0.12]) {
    const ear = mesh(new THREE.ConeGeometry(0.07, 0.24, 16), m);
    ear.position.set(sx, 0.52, -0.02); ear.rotation.z = -sx * 1.4;
    const eye = mesh(new THREE.SphereGeometry(0.045, 14, 10), mat(0xffffff, { roughness: 0.2 }), false, false);
    eye.position.set(sx * 0.7, 0.32, 0.22);
    const pupil = mesh(new THREE.SphereGeometry(0.028, 12, 8), mat(0x22202c, { roughness: 0.2 }), false, false);
    pupil.position.set(sx * 0.7, 0.32, 0.255);
    const foot = mesh(new THREE.SphereGeometry(0.07, 12, 8), m);
    foot.scale.set(1, 0.6, 1.3); foot.position.set(sx * 1.1, 0.04, 0.06);
    g.add(ear, eye, pupil, foot);
  }
  const flame = mesh(new THREE.ConeGeometry(0.08, 0.26, 16), mat(0xffd34e, { emissive: 0xff9b2f, emissiveIntensity: 0.9 }));
  flame.position.set(0, 0.6, 0);
  g.add(flame);
  g.userData.flame = flame;
  return g;
}

// --- construction d'une carte ------------------------------------------------------------------------------------
const WALK = new Set(['.', ',', '"', 'f', 'D', '_', 'b', 's', 'm']);
let target = null;      // groupe en cours de construction (morceau de monde ou intérieur)
const roofColor = (z, x, y) => {
  if (z.id === 't1' && y >= 14 && x >= 20) return 0x3fb3a6;
  if (y <= 5 && x >= 4 && x <= 9) return 0xe0525b;
  if (y <= 5 && x >= 20 && x <= 25) return 0x3f86e0;
  if (y <= 4 && x >= 12 && x <= 17) return 0xd4a72c;
  if (y >= 14 && x >= 4 && x <= 9 && z.index >= 2 && z.index <= 9) return [0x5fb84f, 0x3f8fdf, 0xe6b72a, 0x8c7a63, 0x5fb2d8, 0x6fc3d6, 0x9a5cc8, 0x5d579c][z.index - 2];
  return [0xa0614a, 0x6f8f5a, 0x8a5f86, 0x5f7398][((x < 15 ? 0 : 1) + (y > 10 ? 2 : 0) + z.index) % 4];
};

function instanced(geo, material, list, setup, cast = true) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, material, list.length);
  const o = new THREE.Object3D();
  list.forEach((item, i) => { o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); const col = setup(o, item, i); o.updateMatrix(); im.setMatrixAt(i, o.matrix); if (col !== undefined) im.setColorAt(i, new THREE.Color(col)); });
  im.castShadow = cast; im.receiveShadow = true;
  target.add(im);
  return im;
}

function building(z, b) {
  const W = b.w; const D = b.h;
  const cx = b.x + W / 2; const cz = b.y + D / 2;
  const grp = new THREE.Group();
  const wallH = 1.5;
  const walls = mesh(new THREE.BoxGeometry(W - 0.3, wallH, D - 0.6), mat(0xfbf3e4, { roughness: 0.9 }));
  walls.position.set(cx, wallH / 2, cz - 0.15);
  grp.add(walls);
  // colombages et soubassement
  const beam = mat(0x8a5a36, { roughness: 0.8 });
  for (let i = 0; i <= W - 1; i++) {
    const p = mesh(new THREE.BoxGeometry(0.08, wallH, 0.06), beam);
    p.position.set(b.x + 0.15 + i * ((W - 0.3) / (W - 1)), wallH / 2, b.y + D - 0.44);
    grp.add(p);
  }
  const plinth = mesh(new THREE.BoxGeometry(W - 0.2, 0.22, D - 0.5), mat(0xb3a58b, { roughness: 1 }));
  plinth.position.set(cx, 0.11, cz - 0.15);
  grp.add(plinth);
  // toit à deux pans (prisme), débordant
  const rc = roofColor(z, b.x, b.y);
  const shape = new THREE.Shape();
  const half = (D - 0.2) / 2;
  shape.moveTo(-half, 0); shape.lineTo(half, 0); shape.lineTo(0, 1.15); shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: W + 0.2, bevelEnabled: false });
  const roof = mesh(roofGeo, mat(z.theme === 7 || z.theme === 10 ? new THREE.Color(rc).lerp(new THREE.Color(0xffffff), 0.75) : rc, { roughness: 0.55 }));
  roof.rotation.y = Math.PI / 2;
  roof.position.set(b.x - 0.1, wallH, cz - 0.15);
  grp.add(roof);
  const ridge = mesh(new THREE.CylinderGeometry(0.07, 0.07, W + 0.3, 10), mat(new THREE.Color(rc).multiplyScalar(0.7)));
  ridge.rotation.z = Math.PI / 2; ridge.position.set(cx, wallH + 1.15, cz - 0.15);
  grp.add(ridge);
  const chim = mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), mat(0x9b6b52));
  chim.position.set(b.x + W - 1, wallH + 1.0, cz - 0.6);
  grp.add(chim);
  // façade : porte, fenêtres, jardinières, lanterne
  const front = b.y + D - 0.44;
  const doorX = [...Array(W).keys()].find((i) => 'Dd'.includes(z.rows[b.y + D - 1][b.x + i]));
  if (doorX !== undefined) {
    const door = mesh(new THREE.BoxGeometry(0.62, 1.0, 0.08), mat(0x9a6438, { roughness: 0.6 }));
    door.position.set(b.x + doorX + 0.5, 0.52, front + 0.02);
    const knob = mesh(new THREE.SphereGeometry(0.04, 10, 8), mat(0xffd34e, { metalness: 0.8, roughness: 0.3 }));
    knob.position.set(b.x + doorX + 0.72, 0.52, front + 0.08);
    const step = mesh(new THREE.BoxGeometry(0.9, 0.08, 0.35), mat(0xb9a07c));
    step.position.set(b.x + doorX + 0.5, 0.04, front + 0.2);
    const lampM = mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), mat(0xffe08a, { emissive: 0xffc060, emissiveIntensity: 1.2 }), false, false);
    lampM.position.set(b.x + doorX + 0.95, 1.1, front + 0.25);
    grp.add(door, knob, step, lampM);
    if (z.kind === 'town' && b.y <= 5) {
      const sign = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24), mat(0xffffff, { emissive: rc, emissiveIntensity: 0.15 }));
      sign.rotation.x = Math.PI / 2; sign.position.set(b.x + doorX + 0.5, 1.28, front + 0.05);
      const mark = mesh(new THREE.BoxGeometry(0.22, 0.07, 0.03), mat(rc));
      mark.position.set(b.x + doorX + 0.5, 1.28, front + 0.09);
      const mark2 = mark.clone(); mark2.rotation.z = Math.PI / 2;
      grp.add(sign, mark, mark2);
    }
  }
  for (let i = 0; i < W; i++) {
    if (i === doorX || i === 0 || i === W - 1) continue;
    for (const wy of [0.62, 1.15]) {
      if (wy < 1 && Math.abs(i - doorX) < 1) continue;
      const frame = mesh(new THREE.BoxGeometry(0.46, 0.38, 0.06), mat(0x7a5a3a));
      frame.position.set(b.x + i + 0.5, wy, front + 0.02);
      const glass = mesh(new THREE.BoxGeometry(0.38, 0.3, 0.04), mat(0x9ccbee, { roughness: 0.05, metalness: 0.3, emissive: 0x335577, emissiveIntensity: 0.25 }));
      glass.position.set(b.x + i + 0.5, wy, front + 0.04);
      grp.add(frame, glass);
      for (const sx of [-0.3, 0.3]) {
        const shutter = mesh(new THREE.BoxGeometry(0.12, 0.38, 0.04), mat(new THREE.Color(rc).multiplyScalar(0.85)));
        shutter.position.set(b.x + i + 0.5 + sx, wy, front + 0.04);
        grp.add(shutter);
      }
      const box = mesh(new THREE.BoxGeometry(0.5, 0.08, 0.14), mat(0x8a5a36));
      box.position.set(b.x + i + 0.5, wy - 0.24, front + 0.09);
      grp.add(box);
      for (let k = 0; k < 4; k++) {
        const f = mesh(new THREE.SphereGeometry(0.045, 8, 6), mat([0xff6b81, 0xffd34e, 0xffffff, 0xb98cff][(k + i) % 4]), false, false);
        f.position.set(b.x + i + 0.32 + k * 0.12, wy - 0.17, front + 0.11);
        grp.add(f);
      }
    }
  }
  target.add(grp);
}

function findBuildings(rows) {
  const seen = new Set(); const out = [];
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[0].length; x++) {
    if (rows[y][x] !== 'R' || seen.has(`${x},${y}`)) continue;
    let w = 0; while (rows[y][x + w] === 'R') w++;
    let h = 0; while (y + h < rows.length && 'R#Dd'.includes(rows[y + h][x])) h++;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seen.add(`${x + i},${y + j}`);
    out.push({ x, y, w, h });
  }
  return out;
}


// --- le monde continu : villes et routes raccordées du sud (Bourg-Ronce) au nord (Cime-Ronce) ---------------------
const CHAIN = [];
{
  let z0 = 0;
  for (let i = 10; i >= 1; i--) {
    CHAIN.push({ id: `t${i}`, x0: 0, z0, zone: zones[`t${i}`] });
    z0 += zones[`t${i}`].rows.length;
    if (i > 1) { CHAIN.push({ id: `r${i - 1}`, x0: 3, z0, zone: zones[`r${i - 1}`] }); z0 += zones[`r${i - 1}`].rows.length; }
  }
}
const chunkAt = (wz) => CHAIN.findIndex((c) => wz >= c.z0 && wz < c.z0 + c.zone.rows.length);
const chunkOf = (id) => CHAIN.find((c) => c.id === id);
const WALK_OUT = new Set(['.', ',', '"', 'f', 'D', '_', 'b', 's', 'm']);

function tileAt(wx, wz) {
  const i = chunkAt(wz);
  if (i < 0) return 'T';
  const c = CHAIN[i];
  const lx = wx - c.x0; const lz = wz - c.z0;
  return c.zone.rows[lz]?.[lx] ?? 'T';
}

/** Tous les personnages du monde, en coordonnées du monde (les dresseurs peuvent se déplacer). */
const people = [];
const picked = new Set();      // objets déjà ramassés (identifiants)
const beatenIds = new Set();   // dresseurs déjà battus
for (const c of CHAIN) for (const n of c.zone.npcs) {
  if (n.kind === 'guard') continue;
  people.push({ ...n, wx: n.x + c.x0, wz: n.y + c.z0, chunk: c.id, beaten: false, model: null });
}

// --- éléments de décor qui rendent les chemins lisibles -------------------------------------------------------------
function textSign(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#7a4f2a'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#9b6a3e'; g.fillRect(8, 8, 496, 112);
  g.fillStyle = '#fff6dc'; g.font = '700 54px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Arche de bois au-dessus d'une sortie, avec la destination. */
function arch(x, z, text) {
  const g = new THREE.Group();
  const wood = mat(0x8a5a36, { roughness: 0.8 });
  for (const dx of [-1.15, 1.15]) {
    const post = mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.1, 10), wood);
    post.position.set(x + dx, 1.05, z);
    g.add(post);
  }
  const beam = mesh(new THREE.BoxGeometry(2.7, 0.14, 0.16), wood);
  beam.position.set(x, 2.05, z);
  const board = mesh(new THREE.BoxGeometry(2.0, 0.5, 0.06), new THREE.MeshStandardMaterial({ map: textSign(text), roughness: 0.7 }));
  board.position.set(x, 1.7, z + 0.09);
  g.add(beam, board);
  for (const dx of [-1.15, 1.15]) {
    const lamp = mesh(new THREE.SphereGeometry(0.1, 12, 8), mat(0xffe08a, { emissive: 0xffb84d, emissiveIntensity: 1.6 }));
    lamp.position.set(x + dx, 2.2, z);
    g.add(lamp);
  }
  return g;
}

function lantern(x, z) {
  const g = new THREE.Group();
  const post = mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 8), mat(0x3a3340));
  post.position.set(x, 0.65, z);
  const head = mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), mat(0xffe08a, { emissive: 0xffb84d, emissiveIntensity: 1.4 }));
  head.position.set(x, 1.38, z);
  const cap = mesh(new THREE.ConeGeometry(0.14, 0.12, 4), mat(0x3a3340));
  cap.position.set(x, 1.54, z); cap.rotation.y = Math.PI / 4;
  g.add(post, head, cap);
  return g;
}

// --- construction d'un morceau de monde (ville ou route), décalé à sa place -------------------------------------
function buildChunk(c) {
  const z = c.zone;
  const th = theme(z.theme);
  const rows = z.rows;
  const Wd = rows[0].length; const Ht = rows.length;
  const group = new THREE.Group();
  group.position.set(c.x0, 0, c.z0);
  target = group;
  const ground = mesh(new THREE.PlaneGeometry(Wd, Ht), new THREE.MeshStandardMaterial({ map: groundTexture(z, th), roughness: 0.95 }), false, true);
  ground.rotation.x = -Math.PI / 2; ground.position.set(Wd / 2, 0, Ht / 2);
  group.add(ground);
  const at = (ch) => { const l = []; rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === ch) l.push([x, y]); }); return l; };
  // près d'un chemin, des buissons bas plutôt que de grands arbres : on voit où l'on peut passer
  const nearWalk = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (WALK_OUT.has(rows[y + dy]?.[x + dx] ?? 'T') && (rows[y + dy]?.[x + dx] ?? 'T') !== 'T') return true; return false; };
  const trees = []; const shrubs = [];
  for (const [x, y] of at('T')) (nearWalk(x, y) ? shrubs : trees).push([x, y]);
  // forêt sur les côtés (hors du morceau), sur toute la largeur du monde
  const far = [];
  for (let x = -c.x0 - Q.side; x < 30 - c.x0 + Q.side; x++) for (let y = 0; y < Ht; y++) if ((x < 0 || x >= Wd) && (x + y) % 2 === 0 && hash(x + 60 + c.z0, y + 60) > 0.3) far.push([x, y]);
  instanced(new THREE.CylinderGeometry(0.1, 0.16, 0.8, 6), mat(0x6d4626), trees, (o, [x, y]) => { o.position.set(x + 0.5, 0.4, y + 0.5); });
  const leaves = windy(mat(0xffffff, { roughness: 0.8 }), 0.02);
  // forêt de fond : une seule masse par arbre, sans tronc ni ombre portée (on ne la voit que de loin)
  instanced(new THREE.IcosahedronGeometry(1, 1), leaves, far, (o, [x, y]) => {
    const r = hash(x * 3 + c.z0, y * 7);
    o.position.set(x + 0.5, 0.95 + r * 0.3, y + 0.5);
    o.scale.set(0.75, 0.95 + r * 0.3, 0.75);
    return new THREE.Color(th.t).lerp(new THREE.Color(th.td), hash(y, x) * 0.7);
  }, false);
  const blobs = [];
  for (const [x, y] of trees) for (const [dx, dy, dz, s] of [[0, 1.15, 0, 0.55], [-0.22, 0.9, 0.1, 0.42], [0.24, 0.92, -0.05, 0.42]]) blobs.push([x, y, dx, dy, dz, s]);
  instanced(new THREE.IcosahedronGeometry(1, 1), leaves, blobs, (o, [x, y, dx, dy, dz, s]) => {
    const r = hash(x * 3 + c.z0, y * 7);
    o.position.set(x + 0.5 + dx, dy + r * 0.25, y + 0.5 + dz);
    o.scale.setScalar(s * (0.85 + r * 0.35));
    o.rotation.set(r * 3, r * 5, 0);
    return new THREE.Color(th.t).lerp(new THREE.Color(th.td), hash(y, x) * 0.6).offsetHSL(0, 0, (r - 0.5) * 0.08);
  });
  instanced(new THREE.IcosahedronGeometry(1, 1), mat(0xffffff, { roughness: 0.85 }), shrubs, (o, [x, y]) => {
    const r = hash(x * 5, y * 3 + c.z0);
    o.position.set(x + 0.5, 0.32, y + 0.5);
    o.scale.set(0.52 + r * 0.08, 0.38 + r * 0.1, 0.52);
    return new THREE.Color(th.td).offsetHSL(0, 0.05, 0.02 + r * 0.05);
  });
  const cold = z.theme === 7 || z.theme === 10;
  if (cold) {
    instanced(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.35), mat(0xffffff, { roughness: 0.6 }), trees, (o, [x, y]) => {
      const r = hash(x * 3 + c.z0, y * 7);
      o.position.set(x + 0.5, 1.2 + r * 0.25, y + 0.5);
      o.scale.setScalar(0.55 * (0.85 + r * 0.35));
    });
  }
  // hautes herbes, fleurs, rochers, buissons taillables, eau
  const grassMat2 = windy(new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 }), 0.35);
  const bladeGeo = new THREE.ConeGeometry(0.075, 0.62, 3, 1);
  bladeGeo.translate(0, 0.31, 0);
  const blades = [];
  for (const [x, y] of at('"')) for (let k = 0; k < Q.blades; k++) blades.push([x, y, k]);
  instanced(bladeGeo, grassMat2, blades, (o, [x, y, k]) => {
    const r = hash(x * 13 + k, y * 7 - k + c.z0);
    o.position.set(x + hash(k, x * 3 + y), 0, y + hash(y * 3 + k, k));
    o.scale.set(1, 0.7 + r * 0.6, 1);
    o.rotation.set((r - 0.5) * 0.3, r * 6, (hash(k, r) - 0.5) * 0.3);
    return new THREE.Color(th.t).offsetHSL(0, 0, -0.05 + r * 0.12);
  }, false);
  const flowers = [];
  for (const [x, y] of at('f')) for (let k = 0; k < 5; k++) flowers.push([x, y, k]);
  instanced(new THREE.SphereGeometry(0.06, 6, 4), mat(0xffffff, { roughness: 0.5 }), flowers, (o, [x, y, k]) => {
    o.position.set(x + 0.15 + hash(x + k, y) * 0.7, 0.12, y + 0.15 + hash(y + k, x) * 0.7);
    return [0xff6b81, 0xffd34e, 0xffffff, 0xb98cff, 0xff9f43][Math.floor(hash(x * k, y) * 5)];
  }, false);
  instanced(new THREE.IcosahedronGeometry(0.38, 0), mat(0x9a948c, { roughness: 0.9, flatShading: true }), at('r'), (o, [x, y]) => { o.position.set(x + 0.5, 0.25, y + 0.5); o.scale.set(1, 0.75, 1); o.rotation.y = hash(x, y) * 3; });
  instanced(new THREE.IcosahedronGeometry(0.4, 2), mat(0x5fb04a), at('x'), (o, [x, y]) => { o.position.set(x + 0.5, 0.35, y + 0.5); o.scale.set(1, 0.85, 1); });
  const water = at('~');
  if (water.length) {
    const wm = new THREE.MeshStandardMaterial({ color: th.w, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.82 });
    wm.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(position, 1.0);
        transformed.y += sin(uTime * 1.6 + wp.x * 2.2 + wp.z * 1.7) * 0.025;`);
    };
    const wmesh = instanced(new THREE.PlaneGeometry(1, 1, 2, 2).rotateX(-Math.PI / 2), wm, water, (o, [x, y]) => { o.position.set(x + 0.5, 0.06, y + 0.5); });
    if (wmesh) wmesh.castShadow = false;
  }
  for (const b of findBuildings(rows)) building(z, b);
  // sorties de ville : arches avec la destination ; lanternes le long du chemin
  if (z.kind === 'town') {
    const i = z.index;
    if (i < 10) group.add(arch(15, 1.6, `Route ${i} ↑`));
    if (i > 1) group.add(arch(15, Ht - 1.4, `Route ${i - 1} ↓`));
    for (let y = 3; y < Ht - 2; y += 5) group.add(lantern(13.6, y + 0.5));
  } else {
    // route : une lanterne toutes les quelques cases de chemin, sur le bord herbeux
    let k = 0;
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) {
      if (r[x] !== ',' || r[x - 1] === ',' ) continue;
      if (++k % 7 !== 0) continue;
      if (WALK_OUT.has(r[x - 1] ?? 'T') && r[x - 1] !== ',') group.add(lantern(x - 0.3, y + 0.5));
    } });
  }
  // personnages
  const entries = [];
  for (const p of people.filter((q) => q.chunk === c.id)) {
    const m = personModel(p);
    if (!m) continue;
    m.position.set(p.wx - c.x0 + 0.5, m.position.y, p.wz - c.z0 + 0.5);
    group.add(m);
    p.model = m;
    entries.push(p);
  }
  target = null;
  return { group, entries };
}

function personModel(n) {
  if (n.kind === 'item' || n.kind === 'starter') {
    const orb = new THREE.Group();
    const top = mesh(new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe84a4a, { roughness: 0.25 }));
    const bot = mesh(new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xf4f4f4, { roughness: 0.25 }));
    const band = mesh(new THREE.TorusGeometry(0.16, 0.015, 8, 32), mat(0x2b2a3a));
    band.rotation.x = Math.PI / 2;
    orb.add(top, bot, band);
    orb.position.y = n.kind === 'starter' ? 0.92 : 0.18;
    orb.userData.spin = true;
    return orb;
  }
  if (n.kind === 'sign') {
    const g = new THREE.Group();
    const post = mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), mat(0x6b4a2f)); post.position.y = 0.3;
    const board = mesh(new THREE.BoxGeometry(0.7, 0.4, 0.06), mat(0xc99a5b)); board.position.y = 0.65;
    g.add(post, board);
    return g;
  }
  if (n.kind === 'pc') {
    const g = new THREE.Group();
    const pc = mesh(new THREE.BoxGeometry(0.6, 1.0, 0.5), mat(0xc8ccd6)); pc.position.y = 0.5;
    const screen = mesh(new THREE.BoxGeometry(0.02, 0.3, 0.45), mat(0x5fd3a5, { emissive: 0x3fae85, emissiveIntensity: 0.9 })); screen.position.set(-0.31, 0.72, 0);
    g.add(pc, screen);
    return g;
  }
  const opts = {
    nurse: { shirt: 0xffffff, hair: 0xe98bb3, pants: 0xf2a7c4, hat: 0xffffff },
    shop: { shirt: 0x3f7fd6, hair: 0x5a3b2a, hat: 0x3f86e0 },
    prof: { shirt: 0xf4f4f4, hair: 0xc9c9c9, pants: 0x6f5c48 },
  }[n.kind] ?? { shirt: [0xc0392b, 0x8e44ad, 0x16a085, 0xd35400, 0x2c3e50, 0x27ae60, 0xe67e22, 0x2980b9][n.sprite % 8], hair: [0x4a2f22, 0x1f1d24, 0xd4a03a, 0xa3482a][n.sprite % 4] };
  const ch = character(opts);
  ch.rotation.y = ROT[n.d] ?? 0;
  return ch;
}

// --- chargement progressif autour du joueur ----------------------------------------------------------------------
const loaded = new Map();
let currentChunk = -1;
function dispose(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) { m.map?.dispose?.(); m.dispose?.(); }
  });
}
function stream(index) {
  // le morceau courant, et un voisin seulement quand on s'approche de la jonction (moins de géométrie affichée)
  const c0 = CHAIN[index];
  const near = [index];
  if (me.y - c0.z0 < 26) near.push(index - 1);
  if (c0.z0 + c0.zone.rows.length - me.y < 26) near.push(index + 1);
  const want = new Set(near.filter((i) => i >= 0 && i < CHAIN.length));
  if (want.size === loaded.size && [...want].every((i) => loaded.has(i))) return;
  for (const [i, ch] of loaded) if (!want.has(i)) { outdoorRoot.remove(ch.group); dispose(ch.group); for (const p of ch.entries) p.model = null; loaded.delete(i); }
  const add = (i) => { if (loaded.has(i) || !wantNow.has(i)) return; const ch = buildChunk(CHAIN[i]); outdoorRoot.add(ch.group); loaded.set(i, ch); shadowDirty = true; };
  wantNow = want;
  add(index);                                                       // le morceau où l'on est : tout de suite
  [...want].filter((i) => i !== index).forEach((i, k) => setTimeout(() => add(i), 60 + k * 120));   // les voisins : juste après
}
let wantNow = new Set();
let shadowDirty = true;

// --- intérieurs (bâtiments) : la seule « autre carte », avec un fondu -------------------------------------------
let inside = null;            // zone intérieure courante, ou null dehors
let insidePeople = [];
function buildInterior(z) {
  interiorRoot.clear();
  dispose(interiorRoot);
  target = interiorRoot;
  const rows = z.rows; const Wd = rows[0].length; const Ht = rows.length;
  const ground = mesh(new THREE.PlaneGeometry(Wd, Ht), new THREE.MeshStandardMaterial({ map: groundTexture(z, theme(10)), roughness: 0.9 }), false, true);
  ground.rotation.x = -Math.PI / 2; ground.position.set(Wd / 2, 0, Ht / 2);
  interiorRoot.add(ground);
  const wallMat = mat(z.kind === 'gym' ? 0x5c5066 : 0xf3e3c3, { roughness: 0.95 });
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) {
    const ch = r[x];
    const add = (geo, m, px, py, pz) => { const o = mesh(geo, m); o.position.set(px, py, pz); interiorRoot.add(o); return o; };
    if (ch === 'W') { const h = y === Ht - 1 ? 0.25 : y === 0 ? 2.2 : 1.2; add(new THREE.BoxGeometry(1, h, 1), wallMat, x + 0.5, h / 2, y + 0.5); }
    if (ch === 'C') { add(new THREE.BoxGeometry(1, 0.8, 0.8), mat(0x9a6438, { roughness: 0.6 }), x + 0.5, 0.4, y + 0.5); add(new THREE.BoxGeometry(1.02, 0.06, 0.9), mat(0xf4ead8, { roughness: 0.3 }), x + 0.5, 0.83, y + 0.5); }
    if (ch === 'S') {
      add(new THREE.BoxGeometry(0.95, 1.6, 0.5), mat(0x8a5a36), x + 0.5, 0.8, y + 0.4);
      for (let s = 0; s < 3; s++) for (let k = 0; k < 5; k++) add(new THREE.BoxGeometry(0.13, 0.32, 0.3), mat([0xe85d75, 0x4fa6e6, 0xffd34e, 0x7bd389, 0xb98cff][(k + s + x) % 5]), x + 0.15 + k * 0.17, 0.35 + s * 0.48, y + 0.55);
    }
    if (ch === 'p') { add(new THREE.CylinderGeometry(0.2, 0.15, 0.35, 16), mat(0xc0633f), x + 0.5, 0.18, y + 0.5); add(new THREE.IcosahedronGeometry(0.35, 2), mat(0x3f9a52), x + 0.5, 0.65, y + 0.5); }
    if (ch === 'k') add(new THREE.BoxGeometry(0.85, 0.45, 0.7), mat(0x4a7fc0, { roughness: 0.5 }), x + 0.5, 0.22, y + 0.5);
    if (ch === 'Q') add(new THREE.BoxGeometry(0.9, 0.45, 1), mat(y === 1 ? 0xffffff : 0xe57373, { roughness: 0.8 }), x + 0.5, 0.22, y + 0.5);
    if (ch === 'B') add(new THREE.BoxGeometry(1, 0.08, 0.8), mat(0xc08552, { roughness: 0.5 }), x + 0.5, 0.7, y + 0.5);
    if (ch === 'm') { const rug = add(new THREE.BoxGeometry(0.9, 0.02, 0.8), mat(0xc0475e), x + 0.5, 0.01, y + 0.5); rug.castShadow = false; }
    if (ch === 'r') { add(new THREE.CylinderGeometry(0.25, 0.3, 1.8, 20), mat(0xeeeae0, { roughness: 0.4 }), x + 0.5, 0.9, y + 0.5); add(new THREE.SphereGeometry(0.2, 16, 12), mat(0xd4af37, { metalness: 0.8, roughness: 0.3 }), x + 0.5, 1.95, y + 0.5); }
  } });
  insidePeople = z.npcs.filter((n) => n.kind !== 'guard' && !picked.has(n.id)).map((n) => ({ ...n, wx: n.x, wz: n.y, beaten: beatenIds.has(n.id), model: null }));
  for (const p of insidePeople) { const m = personModel(p); if (!m) continue; m.position.set(p.wx + 0.5, m.position.y, p.wz + 0.5); interiorRoot.add(m); p.model = m; }
  target = null;
}

// --- joueur et compagnon ------------------------------------------------------------------------------------------
const ROT = { d: 0, u: Math.PI, l: -Math.PI / 2, r: Math.PI / 2 };
const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
const player = character({ shirt: LOOKS[0] });
const buddy = creature();
scene.add(player, buddy);
const me = { x: 0, y: 0, d: 'u', fromX: 0, fromY: 0, t: 1, phase: 0 };
const pal = { x: 0, y: 0, fromX: 0, fromY: 0 };
const held = [];
const STEP = 0.2;
let busy = false;

const activePeople = () => (inside ? insidePeople : people.filter((p) => p.model));
function personAt(x, y) { return activePeople().find((p) => Math.round(p.wx) === x && Math.round(p.wz) === y && p.kind !== 'guard'); }

function solidAt(x, y) {
  if (inside) { const t = inside.rows[y]?.[x] ?? 'W'; return !WALK_OUT.has(t); }
  return !WALK_OUT.has(tileAt(x, y));
}
function blocked(x, y) { return solidAt(x, y) || !!personAt(x, y); }

function place(x, y, d = me.d) {
  Object.assign(me, { x, y, fromX: x, fromY: y, t: 1, d });
  const by = blocked(x, y + 1) ? y : y + 1;
  Object.assign(pal, { x, y: by, fromX: x, fromY: by });
  snapCamera = true;
}

let region = '';
function setRegion(name) {
  if (name === region) return;
  region = name;
  $('zone').textContent = name;
  const b = $('banner');
  b.textContent = name; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}

function fade(fn) {
  busy = true;
  const f = $('fade');
  f.classList.add('on');
  setTimeout(() => { fn(); f.classList.remove('on'); setTimeout(() => { busy = false; }, 250); }, 260);
}

function goInside(id, x, y) {
  fade(() => {
    inside = zones[id];
    outdoorRoot.visible = false;
    interiorRoot.visible = true;
    buildInterior(inside);
    scene.background = new THREE.Color(0x2a2230); scene.fog = null;
    hemi.color.set(0xffe6c8); hemi.groundColor.set(0x6a4a30); hemi.intensity = 1.9; sun.intensity = 1.4;
    place(x, y, 'u');
    shadowDirty = true;
    setRegion(inside.name.fr);
  });
}

function goOutside(wx, wz) {
  fade(() => {
    inside = null;
    interiorRoot.visible = false; outdoorRoot.visible = true;
    interiorRoot.clear();
    place(wx, wz, 'd');
    shadowDirty = true;
    currentChunk = -1;
    updateOutdoor();
  });
}

function updateOutdoor() {
  const i = chunkAt(me.y);
  if (i < 0) return;
  stream(i);
  if (i === currentChunk) return;
  currentChunk = i;
  const c = CHAIN[i];
  const th = theme(c.zone.theme);
  scene.background = new THREE.Color(th.sky);
  scene.fog = new THREE.Fog(th.sky, 22, 46);
  hemi.color.set(0xdff2ff); hemi.groundColor.set(0x5a7a40); hemi.intensity = 1.15; sun.intensity = 2.4;
  setRegion(c.zone.name.fr);
  snowOn(c.zone.theme === 7 || c.zone.theme === 10);
}

let snow = null;
function snowOn(on) {
  if (snow) { scene.remove(snow); snow.geometry.dispose(); snow = null; }
  if (!on) return;
  const n = 1500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = hash(i, 1) * 30; pos[i * 3 + 1] = hash(2, i) * 9; pos[i * 3 + 2] = hash(i, 3) * 30; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.9, depthWrite: false }));
  scene.add(snow);
}

/** Les portes mènent dans les bâtiments ; dedans, la porte du bas ramène devant le bâtiment, dans le monde. */
function arrive() {
  if (inside) {
    const w = inside.warps.find(([x, y]) => x === me.x && y === me.y);
    if (!w) return checkSight();
    const c = chunkOf(w[2]);
    if (c) return goOutside(w[3] + c.x0, w[4] + c.z0);
    return goInside(w[2], w[3], w[4]);
  }
  const i = chunkAt(me.y);
  const c = CHAIN[i];
  const w = c?.zone.warps.find(([x, y, to]) => x + c.x0 === me.x && y + c.z0 === me.y && !/^[tr]\d/.test(to));
  if (w) return goInside(w[2], w[3], w[4]);
  updateOutdoor();
  checkSight();
  if (!event && tileAt(me.x, me.y) === '"' && Math.random() < 0.14) {
    const table = c.zone.wild ?? [];
    let roll = Math.random() * table.reduce((a, e) => a + e[3], 0);
    const pick = table.find((e) => (roll -= e[3]) <= 0) ?? table[0];
    if (pick) {
      held.length = 0;
      busy = true;
      startBattle({ kind: 'wild', team: [makeKin(pick[0], pick[1] + Math.floor(Math.random() * (pick[2] - pick[1] + 1)))], onEnd: () => { busy = false; changed(); } });
    }
  }
}

function tryStep() {
  const d = held.at(-1);
  if (!d || me.t < 1 || busy) return;
  me.d = d;
  const [dx, dy] = DIRS[d];
  if (blocked(me.x + dx, me.y + dy)) return;
  Object.assign(pal, { fromX: pal.x, fromY: pal.y, x: me.x, y: me.y });
  Object.assign(me, { fromX: me.x, fromY: me.y, x: me.x + dx, y: me.y + dy, t: 0 });
}

// --- les dresseurs repèrent le joueur qui passe devant eux, viennent à lui et imposent le combat ---------------------
const SIGHT = 4;
let event = null;
const CLS = { youngster: 'Gamin', lass: 'Fillette', hiker: 'Montagnard', fisher: 'Pêcheur', birder: 'Ornithologue', scientist: 'Scientifique', camper: 'Campeur', picnicker: 'Pique-niqueuse', ranger: 'Garde forestier', ace: 'As du combat', apprentice: 'Apprenti', leader: 'Champion d\'arène', elite: 'Conseil', champion: 'Maître' };

function checkSight() {
  if (event) return;
  for (const p of activePeople()) {
    if (p.beaten || !['trainer', 'leader', 'champion'].includes(p.kind) || p.kind !== 'trainer') continue;
    const [dx, dy] = DIRS[p.d];
    for (let k = 1; k <= SIGHT; k++) {
      const tx = p.wx + dx * k; const ty = p.wz + dy * k;
      if (tx === me.x && ty === me.y) { spotted(p); return; }
      if (solidAt(tx, ty) || personAt(tx, ty)) break;
    }
  }
}

function bubble() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 56, 46, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(52, 96); g.lineTo(64, 124); g.lineTo(76, 96); g.fill();
  g.fillStyle = '#ff3b4e'; g.font = '900 72px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 64, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.set(0.55, 0.55, 1);
  return s;
}

function spotted(p) {
  busy = true;
  held.length = 0;
  const b = bubble();
  b.position.set(0, 1.45, 0);
  p.model.add(b);
  event = { p, phase: 'alert', t: 0, b };
}

function stepEvent(dt) {
  if (!event) return;
  const e = event; const p = e.p;
  e.t += dt;
  if (e.phase === 'alert' && e.t > 0.8) { p.model.remove(e.b); e.phase = 'walk'; e.t = 0; e.from = [p.wx, p.wz]; }
  if (e.phase === 'walk') {
    const dist = Math.abs(p.wx - me.x) + Math.abs(p.wz - me.y);
    if (!e.moving && dist > 1) {
      const [dx, dy] = DIRS[p.d];
      e.moving = { fx: p.wx, fz: p.wz, tx: p.wx + dx, tz: p.wz + dy, t: 0 };
    }
    if (e.moving) {
      e.moving.t = Math.min(1, e.moving.t + dt / 0.26);
      const m = e.moving;
      const off = p.model.parent === interiorRoot ? [0, 0] : [CHAIN.find((c) => c.id === p.chunk).x0, CHAIN.find((c) => c.id === p.chunk).z0];
      p.model.position.set(m.fx + (m.tx - m.fx) * m.t - off[0] + 0.5, 0, m.fz + (m.tz - m.fz) * m.t - off[1] + 0.5);
      animateWalk(p.model, e.t * 16, true);
      if (m.t === 1) { p.wx = m.tx; p.wz = m.tz; e.moving = null; }
    } else if (dist <= 1) {
      animateWalk(p.model, 0, false);
      // le joueur se tourne vers le dresseur
      me.d = Object.keys(DIRS).find((d) => DIRS[d][0] === Math.sign(p.wx - me.x) && DIRS[d][1] === Math.sign(p.wz - me.y)) ?? me.d;
      e.phase = 'talk'; e.t = 0; e.talkAt = performance.now();
      const box = $('duel');
      box.querySelector('.who').textContent = `${CLS[p.cls] ?? 'Dresseur'} ${p.name ?? ''}`;
      box.querySelector('.team').textContent = `${(p.team ?? []).length} créature(s) · niveau ${Math.max(...(p.team ?? [[0, 1]]).map((m) => m[1]))}`;
      box.hidden = false;
    }
  }
}

function endDuel() {
  if (!event || event.phase !== 'talk' || performance.now() - event.talkAt < 350) return;
  const p = event.p;
  $('duel').hidden = true;
  event = null;
  startBattle({
    kind: 'trainer', name: `${CLS[p.cls] ?? 'Dresseur'} ${p.name ?? ''}`,
    team: (p.team ?? []).map(([sp, lv]) => makeKin(sp, lv)),
    onEnd: (won) => { p.beaten = won; if (won) beatenIds.add(p.id); busy = false; changed(); },
  });
}


// --- combats en 3D : contre un dresseur ou une créature sauvage -------------------------------------------------------
const TYPE_COL = {
  normal: [0xcdb89a, 0xf1e5d0], flame: [0xf07a3e, 0xffc06e], tide: [0x4f9fe2, 0xa6d8ff], leaf: [0x62bf5c, 0xb4ea92], volt: [0xf2cf3c, 0xfff495],
  stone: [0xa9977e, 0xd8cab1], gust: [0x9dd3ea, 0xe6f7ff], frost: [0xaee8f2, 0xf4ffff], venom: [0xa86fd4, 0xdbb0f7], spirit: [0x7570b2, 0xb2adec],
};
const TYPE_FR = { normal: 'Normal', flame: 'Flamme', tide: 'Eau', leaf: 'Plante', volt: 'Volt', stone: 'Roche', gust: 'Vent', frost: 'Givre', venom: 'Venin', spirit: 'Esprit' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const statOf = (sp, lv, k) => { const v = Math.floor((2 * sp.base[k] * lv) / 100); return k === 'hp' ? v + lv + 10 : v + 5; };
function makeKin(id, lv) {
  const sp = content.species[id - 1];
  const max = statOf(sp, lv, 'hp');
  return { sp, lv, max, hp: max, xp: 0, moves: sp.learnset.filter(([l]) => l <= lv).map(([, m]) => m).slice(-4) };
}
const party = [makeKin(4, 9)];           // ton compagnon : Braisillon

/** Modèle 3D d'une créature d'après son type, son stade et sa lignée (formes variées : oreilles, cornes, crête). */
function kinModel(sp) {
  const [c1, c2] = TYPE_COL[sp.types[0]];
  const acc = TYPE_COL[sp.types[1] ?? sp.types[0]][0];
  const g = new THREE.Group();
  const r = hash(sp.line * 13 + 5, 77);
  const size = [0.8, 1.0, 1.25][Math.min(2, sp.stage - 1)] * (sp.tier === 10 ? 1.2 : 1);
  const m = mat(c1, { roughness: 0.35 });
  const body = mesh(new THREE.SphereGeometry(0.3, 28, 20), m);
  body.scale.set(1, 0.85 + r * 0.35, 0.95); body.position.y = 0.3;
  const belly = mesh(new THREE.SphereGeometry(0.2, 20, 14), mat(c2, { roughness: 0.4 }));
  belly.position.set(0, 0.25, 0.15); belly.scale.set(1, 1, 0.6);
  g.add(body, belly);
  const earKind = Math.floor(hash(sp.line, 3) * 3);
  for (const sx of [-0.14, 0.14]) {
    const ear = earKind === 0 ? mesh(new THREE.ConeGeometry(0.08, 0.28, 12), m) : earKind === 1 ? mesh(new THREE.SphereGeometry(0.1, 12, 10), m) : mesh(new THREE.CapsuleGeometry(0.05, 0.24, 4, 8), m);
    ear.position.set(sx, 0.58 + r * 0.1, -0.02); ear.rotation.z = -sx * 1.6;
    const eye = mesh(new THREE.SphereGeometry(0.055, 12, 10), mat(0xffffff, { roughness: 0.2 }), false, false);
    eye.position.set(sx * 0.75, 0.38, 0.25);
    const pupil = mesh(new THREE.SphereGeometry(0.033, 10, 8), mat(0x22202c, { roughness: 0.2 }), false, false);
    pupil.position.set(sx * 0.75, 0.38, 0.293);
    const foot = mesh(new THREE.SphereGeometry(0.08, 10, 8), m);
    foot.scale.set(1, 0.6, 1.3); foot.position.set(sx * 1.1, 0.05, 0.08);
    g.add(ear, eye, pupil, foot);
  }
  // ornement du type, en couleur du second type s'il y en a un
  const t = sp.types[0];
  const orn = mat(t === 'flame' ? 0xffd34e : acc, t === 'flame' || t === 'volt' ? { emissive: t === 'flame' ? 0xff9b2f : 0xffe066, emissiveIntensity: 0.8 } : { roughness: 0.4 });
  const top = t === 'stone' ? mesh(new THREE.IcosahedronGeometry(0.11, 0), orn) : t === 'leaf' ? mesh(new THREE.SphereGeometry(0.11, 10, 8), orn) : mesh(new THREE.ConeGeometry(0.08, 0.26, 10), orn);
  top.position.set(0, 0.68 + r * 0.1, 0); if (t === 'leaf') top.scale.set(1.6, 0.4, 1);
  g.add(top);
  if (sp.stage >= 2) for (const sx of [-0.3, 0.3]) { const wing = mesh(new THREE.ConeGeometry(0.07, 0.3, 8), mat(acc, { roughness: 0.4 })); wing.position.set(sx, 0.36, -0.05); wing.rotation.z = -Math.sign(sx) * 1.9; g.add(wing); }
  if (sp.stage >= 3) { const tail = mesh(new THREE.ConeGeometry(0.09, 0.4, 10), m); tail.position.set(0, 0.22, -0.34); tail.rotation.x = -1.9; g.add(tail); }
  g.scale.setScalar(size * 1.5);
  return g;
}

const battleRoot = new THREE.Group();
battleRoot.position.set(4000, 0, 4000);
battleRoot.visible = false;
scene.add(battleRoot);
{
  const ground = mesh(new THREE.CircleGeometry(30, 40), mat(0x8ad06e, { roughness: 1 }), false, true);
  ground.rotation.x = -Math.PI / 2;
  battleRoot.add(ground);
  for (const [x, z] of [[-1.7, 1.3], [1.7, -1.3]]) {
    const p = mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.14, 36), mat(0xa8e08a, { roughness: 0.9 }));
    p.position.set(x, 0.07, z);
    battleRoot.add(p);
  }
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2; const d = 9 + hash(i, 5) * 4;
    const tree = mesh(new THREE.IcosahedronGeometry(1.1 + hash(i, 2), 1), mat(new THREE.Color(0x3f9a52).offsetHSL(0, 0, (hash(i, 9) - 0.5) * 0.1), { roughness: 0.85 }));
    tree.position.set(Math.cos(a) * d, 1.2, Math.sin(a) * d);
    battleRoot.add(tree);
  }
}
let battle = null;

function setBar(side, kin) {
  const box = $(side === 0 ? 'b-mine' : 'b-foe');
  box.querySelector('b').textContent = kin.sp.name;
  box.querySelector('.lv').textContent = `N.${kin.lv}`;
  const p = Math.max(0, kin.hp / kin.max);
  const bar = box.querySelector('i');
  bar.style.width = `${p * 100}%`;
  bar.style.background = p > 0.5 ? '#2fb866' : p > 0.2 ? '#f0a92a' : '#e0483c';
  if (side === 0) box.querySelector('.num').textContent = `${Math.max(0, kin.hp)} / ${kin.max}`;
}
const bmsg = async (text, ms = 1100) => { $('b-msg').textContent = text; await sleep(ms); };

function startBattle({ kind, name = '', team, onEnd }) {
  for (const k of party) if (k.hp <= 0) k.hp = k.max;
  battle = { kind, name, team, fi: 0, onEnd, models: [null, null], anim: [{ dx: 0, flash: 0, sink: 0 }, { dx: 0, flash: 0, sink: 0 }], locked: true };
  $('fade').classList.add('on');
  setTimeout(async () => {
    outdoorRoot.visible = false; interiorRoot.visible = false; player.visible = false; buddy.visible = false;
    battleRoot.visible = true;
    scene.background = new THREE.Color(0x9fd3f5); scene.fog = new THREE.Fog(0x9fd3f5, 18, 40);
    hemi.color.set(0xdff2ff); hemi.groundColor.set(0x5a7a40); hemi.intensity = 1.15; sun.intensity = 2.4;
    spawn(0, party[0]); spawn(1, team[0]);
    $('battle').hidden = false;
    document.body.classList.add('in-battle');
    $('b-menu').innerHTML = '';
    $('fade').classList.remove('on');
    await bmsg(kind === 'wild' ? `Un ${team[0].sp.name} sauvage apparaît !` : `${name} veut se battre !`, 1400);
    if (kind !== 'wild') await bmsg(`${name} envoie ${team[0].sp.name} !`);
    await bmsg(`À toi, ${party[0].sp.name} !`, 800);
    menu();
  }, 280);
}

function spawn(side, kin) {
  if (battle.models[side]) battleRoot.remove(battle.models[side]);
  const m = kinModel(kin.sp);
  m.position.set(side === 0 ? -1.7 : 1.7, 0.14, side === 0 ? 1.3 : -1.3);
  m.rotation.y = side === 0 ? 2.2 : -0.9;
  battleRoot.add(m);
  battle.models[side] = m;
  battle.anim[side] = { dx: 0, flash: 0, sink: 0 };
  setBar(side, kin);
}

function menu() {
  const b = battle; const mine = party[0];
  b.locked = false;
  $('b-msg').textContent = `Que doit faire ${mine.sp.name} ?`;
  const el = $('b-menu');
  el.innerHTML = '';
  for (const id of mine.moves) {
    const mv = content.moves[id];
    const btn = document.createElement('button');
    btn.innerHTML = `<b>${mv.name.fr}</b><small>${TYPE_FR[mv.type]} · ${mv.power || '—'}</small>`;
    btn.style.setProperty('--tc', `#${TYPE_COL[mv.type][0].toString(16).padStart(6, '0')}`);
    btn.addEventListener('click', () => turn(id));
    el.append(btn);
  }
  const run = document.createElement('button');
  run.className = 'run';
  run.textContent = b.kind === 'wild' ? 'Fuite' : 'Fuite impossible';
  run.disabled = b.kind !== 'wild';
  run.addEventListener('click', async () => { if (b.locked) return; b.locked = true; el.innerHTML = ''; await bmsg('Tu prends la fuite sans encombre.'); endBattle(false); });
  el.append(run);
}

function damage(att, def, mv) {
  let eff = 1;
  for (const ty of def.sp.types) eff *= content.chart[mv.type]?.[ty] ?? 1;
  const stab = att.sp.types.includes(mv.type) ? 1.5 : 1;
  const crit = Math.random() < 1 / 16;
  const base = Math.floor(Math.floor((2 * att.lv / 5 + 2) * mv.power * statOf(att.sp, att.lv, 'atk') / statOf(def.sp, def.lv, 'def')) / 50) + 2;
  return { dmg: eff === 0 ? 0 : Math.max(1, Math.floor(base * stab * eff * (crit ? 1.5 : 1) * (0.85 + Math.random() * 0.15))), eff, crit };
}

async function attack(side, id) {
  const b = battle;
  const att = side === 0 ? party[0] : b.team[b.fi];
  const def = side === 0 ? b.team[b.fi] : party[0];
  const mv = content.moves[id];
  const who = (s, k) => (s === 0 ? k.sp.name : b.kind === 'wild' ? `${k.sp.name} sauvage` : `${k.sp.name} adverse`);
  await bmsg(`${who(side, att)} utilise ${mv.name.fr} !`, 700);
  for (let i = 0; i <= 8; i++) { b.anim[side].dx = Math.sin((i / 8) * Math.PI) * 0.7; await sleep(24); }
  b.anim[side].dx = 0;
  if (!mv.power) { await bmsg('Mais l\'effet reste discret dans cette démo…', 900); return; }
  if (Math.random() * 100 > mv.acc) { await bmsg('Mais ça rate !'); return; }
  const { dmg, eff, crit } = damage(att, def, mv);
  if (eff === 0) { await bmsg(`Ça n'affecte pas ${who(1 - side, def)}…`); return; }
  for (let i = 0; i < 4; i++) { b.anim[1 - side].flash = i % 2 ? 0 : 1; await sleep(70); }
  b.anim[1 - side].flash = 0;
  const from = def.hp;
  for (let i = 1; i <= 10; i++) { def.hp = Math.max(0, Math.round(from - dmg * (i / 10))); setBar(1 - side, def); await sleep(25); }
  if (crit) await bmsg('Coup critique !', 700);
  if (eff >= 2) await bmsg('C\'est super efficace !', 800);
  else if (eff < 1) await bmsg('Ce n\'est pas très efficace…', 800);
}

async function turn(id) {
  const b = battle;
  if (!b || b.locked) return;
  b.locked = true;
  $('b-menu').innerHTML = '';
  const mine = party[0]; const foe = b.team[b.fi];
  const foeMoves = foe.moves.filter((m) => content.moves[m].power > 0);
  const foeMove = (foeMoves.length ? foeMoves : foe.moves)[Math.floor(Math.random() * (foeMoves.length || foe.moves.length))];
  const first = statOf(mine.sp, mine.lv, 'spd') >= statOf(foe.sp, foe.lv, 'spd') ? 0 : 1;
  for (const side of [first, 1 - first]) {
    if (mine.hp <= 0 || foe.hp <= 0) break;
    await attack(side, side === 0 ? id : foeMove);
  }
  if (foe.hp <= 0) {
    for (let i = 0; i <= 10; i++) { b.anim[1].sink = i / 10; await sleep(35); }
    await bmsg(`${b.kind === 'wild' ? `${foe.sp.name} sauvage` : `${foe.sp.name} adverse`} est K.-O. !`);
    const gain = Math.floor((foe.sp.xp * foe.lv) / 7 * (b.kind === 'trainer' ? 1.5 : 1));
    mine.xp += gain;
    await bmsg(`${mine.sp.name} gagne ${gain} points d'expérience.`, 900);
    while (mine.lv ** 3 + mine.xp >= (mine.lv + 1) ** 3) {
      mine.xp -= (mine.lv + 1) ** 3 - mine.lv ** 3;
      const lost = mine.max - mine.hp;
      mine.lv++; mine.max = statOf(mine.sp, mine.lv, 'hp'); mine.hp = mine.max - lost;
      mine.moves = mine.sp.learnset.filter(([l]) => l <= mine.lv).map(([, m]) => m).slice(-4);
      setBar(0, mine);
      await bmsg(`${mine.sp.name} passe au niveau ${mine.lv} !`);
    }
    if (b.fi + 1 < b.team.length) {
      b.fi++;
      spawn(1, b.team[b.fi]);
      await bmsg(`${b.name} envoie ${b.team[b.fi].sp.name} !`);
      return menu();
    }
    await bmsg(b.kind === 'wild' ? 'Combat gagné !' : `Tu as battu ${b.name} !`, 1300);
    return endBattle(true);
  }
  if (mine.hp <= 0) {
    for (let i = 0; i <= 10; i++) { b.anim[0].sink = i / 10; await sleep(35); }
    await bmsg(`${mine.sp.name} est K.-O. !`);
    await bmsg('Tu as perdu… Ton compagnon est soigné, retente ta chance !', 1600);
    mine.hp = mine.max;
    return endBattle(false);
  }
  menu();
}

function endBattle(won) {
  const b = battle;
  $('fade').classList.add('on');
  setTimeout(() => {
    $('battle').hidden = true;
    document.body.classList.remove('in-battle');
    battleRoot.visible = false;
    for (const m of b.models) if (m) { battleRoot.remove(m); dispose(m); }
    player.visible = true; buddy.visible = true;
    battle = null;
    if (inside) { interiorRoot.visible = true; scene.background = new THREE.Color(0x2a2230); scene.fog = null; hemi.color.set(0xffe6c8); hemi.groundColor.set(0x6a4a30); hemi.intensity = 1.9; sun.intensity = 1.4; }
    else { outdoorRoot.visible = true; const i = currentChunk; currentChunk = -1; if (i >= 0) updateOutdoor(); }
    snapCamera = true; shadowDirty = true;
    $('fade').classList.remove('on');
    b.onEnd?.(won);
  }, 280);
}

function battleFrame(dt) {
  const b = battle;
  const portrait = camera.aspect < 1;
  camera.position.set(4000 + (portrait ? -1.0 : -3.0), portrait ? 6.2 : 4.2, 4000 + (portrait ? 10.5 : 8.0));
  camera.lookAt(4000 + 0.3, portrait ? -1.2 : -0.9, 4000 + 0.4);
  sun.position.set(4000 - 6, 12, 4000 + 6);
  sun.target.position.set(4000, 0, 4000);
  b.models.forEach((m, side) => {
    if (!m) return;
    const a = b.anim[side];
    const dir = side === 0 ? 1 : -1;
    m.position.set((side === 0 ? -1.7 : 1.7) + a.dx * dir, 0.14 + Math.abs(Math.sin(time.value * 3 + side)) * 0.03 - a.sink * 0.9, (side === 0 ? 1.3 : -1.3) - a.dx * dir * 0.75);
    m.visible = !(a.flash) && a.sink < 1;
  });
}

// --- commandes ----------------------------------------------------------------------------------------------------
const KEYS = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', KeyW: 'u', KeyS: 'd', KeyA: 'l', KeyD: 'r', KeyZ: 'u', KeyQ: 'l' };
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;     // on tape un code de sauvegarde
  const d = KEYS[e.code];
  if (battle) return;
  if (!$('say').hidden) { closeSay(); return; }
  if (event?.phase === 'talk') { endDuel(); return; }
  if (d) { e.preventDefault(); if (!held.includes(d)) held.push(d); }
  if (['Enter', 'Space', 'KeyE'].includes(e.code)) { e.preventDefault(); interact(); }
});
$('btn-a').addEventListener('click', () => { if (battle) return; if (!$('say').hidden) return closeSay(); if (event?.phase === 'talk') return endDuel(); interact(); });
$('say').addEventListener('click', () => closeSay());

// --- touche d'action : ramasser un objet, parler (aussi par-dessus un comptoir) -----------------------------------------
function say(text) { $('say').querySelector('p').textContent = text; $('say').hidden = false; busy = true; held.length = 0; }
function closeSay() { $('say').hidden = true; busy = !!battle || !!event; }
const LINES = {
  talk: 'Belle journée pour explorer, non ? Les hautes herbes grouillent de créatures.',
  gift: 'Tiens, c\'est pour toi ! (Dans le vrai jeu, cet habitant t\'offre un objet.)',
  shop: 'Bienvenue à la boutique ! (La vente arrive avec l\'intégration au vrai jeu.)',
  prof: 'Professeur Aubépine : « Prends bien soin de ton compagnon ! »',
  pc: 'La boîte de stockage ronronne doucement.',
  sign: 'Un panneau indique le chemin.',
  starter: 'Un orbe du professeur. Tu as déjà ton compagnon !',
};
function interact() {
  if (busy || me.t < 1) return;
  const [dx, dy] = DIRS[me.d];
  let tx = me.x + dx; let ty = me.y + dy;
  if (inside && inside.rows[ty]?.[tx] === 'C') { tx += dx; ty += dy; }       // par-dessus le comptoir
  const p = personAt(tx, ty);
  if (!p) return;
  if (p.kind === 'item') {
    p.model?.parent?.remove(p.model);
    const list = inside ? insidePeople : people;
    list.splice(list.indexOf(p), 1);
    picked.add(p.id);
    bag[p.item] = (bag[p.item] ?? 0) + 1;
    changed();
    shadowDirty = true;
    say(`Tu trouves : ${p.item ?? 'un objet'} ! (Sac : ${Object.entries(bag).map(([k, n]) => `${k} ×${n}`).join(', ')})`);
    return;
  }
  if (p.kind === 'nurse') { for (const k of party) k.hp = k.max; changed(); say('Infirmière : « Tes créatures sont en pleine forme ! »'); return; }
  if (p.kind === 'trainer' || p.kind === 'leader' || p.kind === 'champion') {
    if (p.beaten) { say(`${CLS[p.cls] ?? 'Dresseur'} ${p.name ?? ''} : « Bien joué. Je vais m\'entraîner encore ! »`); return; }
    busy = true;
    startBattle({ kind: 'trainer', name: `${CLS[p.cls] ?? 'Dresseur'} ${p.name ?? ''}`, team: (p.team ?? []).map(([sp, lv]) => makeKin(sp, lv)), onEnd: (won) => { p.beaten = won; if (won) beatenIds.add(p.id); busy = false; changed(); } });
    return;
  }
  say(LINES[p.kind] ?? LINES.talk);
}
const bag = {};
window.addEventListener('keyup', (e) => { const d = KEYS[e.code]; if (d) { const i = held.indexOf(d); if (i >= 0) held.splice(i, 1); } });
for (const b of document.querySelectorAll('.pad [data-d]')) {
  const d = b.dataset.d;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (battle) return; if (!$('say').hidden) { closeSay(); return; } if (event?.phase === 'talk') { endDuel(); return; } if (!held.includes(d)) held.push(d); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { const i = held.indexOf(d); if (i >= 0) held.splice(i, 1); });
}
$('duel').addEventListener('click', endDuel);
for (const b of document.querySelectorAll('[data-go]')) b.addEventListener('click', () => {
  const [id, x, y] = b.dataset.go.split(':');
  const c = chunkOf(id);
  if (c) { if (inside) goOutside(Number(x) + c.x0, Number(y) + c.z0); else { place(Number(x) + c.x0, Number(y) + c.z0); updateOutdoor(); } }
  else goInside(id, Number(x), Number(y));
});

// --- boucle ------------------------------------------------------------------------------------------------------
let snapCamera = true;
const camPos = new THREE.Vector3();
let last = performance.now();
let idle = 0;
let slow = 0; let fast = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  // cadence plafonnée ; au repos depuis un moment, on descend encore (moins de chauffe, moins de batterie)
  const cap = idle > 12 ? Math.min(Q.fps, 20) : Q.fps;
  if (now - last < 1000 / cap - 2) return;
  const raw = (now - last) / 1000;
  const dt = Math.min(0.1, raw);
  last = now;
  idle = held.length || me.t < 1 || event || battle ? 0 : idle + dt;
  // résolution adaptative : on baisse si l'appareil peine, on remonte s'il a de la marge
  if (raw > 1.35 / cap) { slow++; fast = 0; } else { fast++; slow = Math.max(0, slow - 1); }
  if (slow > 20 && ratio > Q.minRatio) { ratio = Math.max(Q.minRatio, ratio - 0.15); slow = 0; applyRatio(); }
  if (fast > 600 && ratio < Q.maxRatio) { ratio = Math.min(Q.maxRatio, ratio + 0.1); fast = 0; applyRatio(); }
  time.value += dt;
  tryStep();
  stepEvent(dt);
  if (me.t < 1) {
    me.t = Math.min(1, me.t + dt / STEP);
    me.phase += dt * 16;
    if (me.t === 1) { arrive(); changed(); }
  }
  const px = me.fromX + (me.x - me.fromX) * me.t + 0.5;
  const pz = me.fromY + (me.y - me.fromY) * me.t + 0.5;
  player.position.set(px, Math.abs(Math.sin(me.phase)) * (me.t < 1 ? 0.04 : 0), pz);
  const target2 = ROT[me.d];
  player.rotation.y += Math.atan2(Math.sin(target2 - player.rotation.y), Math.cos(target2 - player.rotation.y)) * Math.min(1, dt * 14);
  animateWalk(player, me.phase, me.t < 1);
  const bx = pal.fromX + (pal.x - pal.fromX) * me.t + 0.5;
  const bz = pal.fromY + (pal.y - pal.fromY) * me.t + 0.5;
  buddy.position.set(bx, Math.abs(Math.sin(time.value * 6)) * 0.06, bz);
  buddy.lookAt(px, 0, pz);
  buddy.userData.flame.scale.y = 1 + Math.sin(time.value * 12) * 0.15;
  for (const p of activePeople()) {
    const m = p.model;
    if (!m) continue;
    if (m.userData.spin) m.rotation.y += dt * 1.2;
    else if (m.userData.body && !(event && event.p === p)) m.userData.body.scale.y = 1 + Math.sin(time.value * 2 + m.position.x) * 0.02;
  }
  if (battle) {
    battleFrame(dt);
  } else {
    const dist = (inside ? 8.5 : 12.5) * (camera.aspect < 1 ? 1.3 : 1);      // en portrait, on recule pour voir plus large
    camPos.set(px, dist * 0.78, pz + dist * 0.95);
    if (snapCamera) { camera.position.copy(camPos); snapCamera = false; }
    camera.position.lerp(camPos, Math.min(1, dt * 6));
    camera.lookAt(camera.position.x, 0.4, camera.position.z - dist * 0.95 - 0.9);
    sun.position.set(px - 6, 14, pz + 5);
    sun.target.position.set(px, 0, pz);
  }
  if (snow) {
    const a = snow.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * (0.6 + (i % 7) * 0.08); if (y < 0) y += 9; a.setY(i, y); }
    a.needsUpdate = true;
    snow.position.set(px - 15, 0, pz - 15);
  }
  if (me.t < 1 || event?.moving || shadowDirty || battle) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
  if (composer) composer.render(); else renderer.render(scene, camera);
  $('perf').textContent = `${Math.round(1 / Math.max(raw, 0.001))} ips · ${MOBILE ? 'mobile' : 'ordinateur'} · résolution ×${ratio.toFixed(2)}`;
}
function applyRatio() { renderer.setPixelRatio(ratio); resize(); shadowDirty = true; }

interiorRoot.visible = false;
// --- sauvegarde : automatique, sur le serveur (sous le hash d'un code secret gardé par le navigateur) et en local -------
const TOKEN_KEY = 'bramblekin.token';
function token() {
  let tok = null;
  try { tok = localStorage.getItem(TOKEN_KEY); } catch { /* stockage indisponible */ }
  if (tok && /^[A-Za-z0-9_-]{24,128}$/.test(tok)) return tok;
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  tok = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try { localStorage.setItem(TOKEN_KEY, tok); } catch { /* ignoré */ }
  return tok;
}
let dirty = false;
let lastSave = 0;
const PIN_KEY = 'bramblekin.pin';
const pinOf = () => { try { return localStorage.getItem(PIN_KEY) ?? ''; } catch { return ''; } };
let serverBlocked = false;     // partie protégée par un PIN qu'on n'a pas : on ne touche pas à la sauvegarde du serveur
function changed() { dirty = true; }
function snapshot() {
  return {
    v: 1, savedAt: Date.now(),
    where: inside ? { inside: inside.id, x: me.x, y: me.y, d: me.d } : { x: me.x, y: me.y, d: me.d },
    party: party.map((k) => ({ id: k.sp.id, lv: k.lv, hp: k.hp, xp: k.xp, moves: k.moves })),
    bag, beaten: [...beatenIds], picked: [...picked],
  };
}
function save(beacon = false) {
  if (battle || busy && !beacon) return;
  const state = snapshot();
  dirty = false;
  lastSave = performance.now();
  try { localStorage.setItem('bramblekin.save', JSON.stringify(state)); } catch { /* ignoré */ }
  if (serverBlocked) { $('save-state').textContent = 'Partie gardée sur cet appareil seulement (code PIN manquant).'; return; }
  const body = JSON.stringify({ token: token(), pin: pinOf(), state });
  if (beacon && navigator.sendBeacon) { navigator.sendBeacon('save.php', new Blob([body], { type: 'application/json' })); return; }
  fetch('save.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
    .then((r) => { $('save-state').textContent = r.ok ? 'Partie sauvegardée ✔' : r.status === 401 || r.status === 423 ? 'Code PIN requis : partie gardée sur cet appareil seulement.' : 'Sauvegarde sur le serveur impossible (copie locale gardée)'; })
    .catch(() => { $('save-state').textContent = 'Hors ligne : partie gardée sur cet appareil'; });
}
setInterval(() => { if (dirty && performance.now() - lastSave > 6000) save(); }, 2000);
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) save(true); });
window.addEventListener('pagehide', () => { if (dirty) save(true); });

async function loadSave() {
  let local = null;
  try { local = JSON.parse(localStorage.getItem('bramblekin.save') ?? 'null'); } catch { /* ignoré */ }
  let remote = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    let r;
    try {
      r = await fetch(`save.php?token=${encodeURIComponent(token())}&pin=${encodeURIComponent(pinOf())}`, { cache: 'no-store' });
    } catch { break; }                                              // hors ligne : on garde la copie locale
    if (r.ok) { remote = await r.json(); break; }
    const err = await r.json().catch(() => ({}));
    if (r.status === 423) { await askPin(`Trop d'essais : cette partie est bloquée encore ${Math.ceil((err.retry ?? 900) / 60)} min.`, true); serverBlocked = true; break; }
    if (r.status !== 401) break;
    const pin = await askPin(attempt === 0 ? 'Cette partie est protégée par un code PIN.' : `Code PIN incorrect (encore ${err.left ?? '?'} essai(s)).`);
    if (pin === null) { serverBlocked = true; break; }
    try { localStorage.setItem(PIN_KEY, pin); } catch { /* ignoré */ }
  }
  if (serverBlocked) local = null;                                  // on ne mélange pas une partie protégée avec une copie locale
  const best = [local, remote].filter((x) => x && x.v === 1).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0];
  if (!best) return null;
  party.length = 0;
  for (const k of best.party ?? []) {
    if (!content.species[k.id - 1]) continue;
    const kin = makeKin(k.id, k.lv);
    kin.hp = Math.max(0, Math.min(kin.max, k.hp ?? kin.max));
    kin.xp = k.xp ?? 0;
    if (Array.isArray(k.moves) && k.moves.every((m) => content.moves[m])) kin.moves = k.moves.slice(0, 4);
    party.push(kin);
  }
  if (!party.length) party.push(makeKin(4, 9));
  Object.assign(bag, best.bag ?? {});
  for (const id of best.beaten ?? []) beatenIds.add(id);
  for (const id of best.picked ?? []) picked.add(id);
  for (let i = people.length - 1; i >= 0; i--) {
    const p = people[i];
    if (picked.has(p.id)) people.splice(i, 1);
    else if (beatenIds.has(p.id)) p.beaten = true;
  }
  return best.where ?? null;
}

/** Demande le code PIN d'une partie protégée ; renvoie le PIN saisi, ou null pour jouer sans cette partie. */
function askPin(message, infoOnly = false) {
  return new Promise((resolve) => {
    const box = $('pin-ask');
    box.querySelector('p').textContent = message;
    box.querySelector('input').hidden = infoOnly;
    box.querySelector('.ok').hidden = infoOnly;
    box.querySelector('input').value = '';
    box.hidden = false;
    if (!infoOnly) box.querySelector('input').focus();
    const done = (v) => { box.hidden = true; box.querySelector('.ok').onclick = null; box.querySelector('.skip').onclick = null; resolve(v); };
    box.querySelector('.ok').onclick = () => { const v = box.querySelector('input').value.trim(); if (/^\d{4,6}$/.test(v)) done(v); };
    box.querySelector('.skip').onclick = () => done(null);
    box.querySelector('input').onkeydown = (e) => { if (e.key === 'Enter') box.querySelector('.ok').click(); };
  });
}

async function setPin(newPin) {
  try {
    const r = await fetch('save.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token(), pin: pinOf(), newPin }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { $('pin-state').textContent = d.error === 'format' ? 'Le PIN doit faire 4 à 6 chiffres.' : 'Impossible de changer le PIN (PIN actuel incorrect ?).'; return; }
    try { if (newPin) localStorage.setItem(PIN_KEY, newPin); else localStorage.removeItem(PIN_KEY); } catch { /* ignoré */ }
    $('pin-state').textContent = newPin ? 'Partie protégée par ton code PIN ✔ (retiens-le !)' : 'Code PIN retiré.';
    $('pin-input').value = '';
  } catch { $('pin-state').textContent = 'Pas de réseau.'; }
}
$('pin-set').addEventListener('click', () => setPin($('pin-input').value.trim()));
$('pin-remove').addEventListener('click', () => setPin(''));

// panneau 💾 : code de sauvegarde, reprise sur un autre appareil
$('btn-save').addEventListener('click', () => {
  $('save-panel').hidden = false;
  $('save-code').textContent = token();
  $('pin-state').textContent = pinOf() ? 'Ta partie est protégée par un code PIN.' : 'Pas encore de code PIN.';
  busy = true;
});
$('save-close').addEventListener('click', () => { $('save-panel').hidden = true; busy = !!battle || !!event; });
$('save-now').addEventListener('click', () => { busy = false; save(); setTimeout(() => { $('save-panel').hidden = true; busy = !!battle || !!event; }, 900); });
$('save-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(token()); $('save-copy').textContent = 'Copié ✔'; } catch { /* ignoré */ } });
$('save-restore').addEventListener('click', () => {
  const code = $('save-input').value.trim();
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(code)) { $('save-state').textContent = 'Ce code n\'est pas valable.'; return; }
  try { localStorage.setItem(TOKEN_KEY, code); localStorage.removeItem('bramblekin.save'); localStorage.removeItem(PIN_KEY); } catch { /* ignoré */ }
  location.reload();
});

// --- joueurs en ligne et chat (général + messages privés) -------------------------------------------------------------
const NAME_KEY = 'bramblekin.name';
let myName = '';
try { myName = localStorage.getItem(NAME_KEY) ?? ''; } catch { /* ignoré */ }
let myId = '';
let players = [];
const muted = new Set((() => { try { return JSON.parse(localStorage.getItem('bramblekin.blocked') ?? '[]'); } catch { return []; } })());
const chat = { since: 0, messages: [], tab: 'all', unread: { all: 0 }, names: {} };
const fmtTime = (s) => new Date(s * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

async function presence() {
  try {
    const r = await fetch('online.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token(), name: myName }) });
    if (!r.ok) return;
    const d = await r.json();
    myId = d.me ?? myId;
    if (d.nameTaken && myName) {
      // ce pseudo appartient à quelqu'un d'autre : on en redemande un
      $('chat-note').textContent = `Le pseudo « ${myName} » est déjà pris par un autre joueur. Choisis-en un autre.`;
      myName = '';
      try { localStorage.removeItem(NAME_KEY); } catch { /* ignoré */ }
      $('chat-name').hidden = false;
    }
    players = (d.players ?? []).filter((p) => p.id !== myId);
    for (const p of d.players ?? []) chat.names[p.id] = p.name;
    $('online-n').textContent = d.online === 1 ? '1 en ligne' : `${d.online} en ligne`;
    if (!$('chat').hidden) renderPeople();
  } catch { $('online-n').textContent = 'hors ligne'; }
}
presence();
setInterval(() => { if (!document.hidden) presence(); }, 25000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { presence(); pollChat(); } });

const convOf = (m) => (m.to === null ? 'all' : m.from === myId ? m.to : m.from);
async function pollChat() {
  try {
    const r = await fetch(`chat.php?token=${encodeURIComponent(token())}&since=${chat.since}`, { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    myId = d.me ?? myId;
    for (const m of d.messages ?? []) {
      chat.since = Math.max(chat.since, m.id);
      chat.messages.push(m);
      chat.names[m.from] = m.name;
      if (muted.has(m.from) || m.from === myId) continue;
      const c = convOf(m);
      const open = !$('chat').hidden && chat.tab === c;
      if (!open && chat.loaded) chat.unread[c] = (chat.unread[c] ?? 0) + 1;
    }
    chat.messages = chat.messages.slice(-400);
    chat.loaded = true;
    updateUnread();
    if (!$('chat').hidden) renderChat();
  } catch { /* hors ligne */ }
}
let chatTimer = null;
function scheduleChat() {
  clearTimeout(chatTimer);
  chatTimer = setTimeout(async () => { if (!document.hidden) await pollChat(); scheduleChat(); }, $('chat').hidden ? 10000 : 3000);
}
pollChat(); scheduleChat();

function updateUnread() {
  const n = Object.values(chat.unread).reduce((a, b) => a + b, 0);
  $('chat-unread').hidden = n === 0;
  $('chat-unread').textContent = n > 99 ? '99+' : String(n);
}

function el(tag, attrs = {}, text = '') {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  if (text) e.textContent = text;
  return e;
}

function renderTabs() {
  const tabs = $('chat-tabs');
  tabs.innerHTML = '';
  const convs = ['all', ...new Set(chat.messages.filter((m) => m.to !== null && !muted.has(convOf(m))).map(convOf))];
  if (chat.tab !== 'all' && !convs.includes(chat.tab)) convs.push(chat.tab);
  for (const c of convs) {
    const b = el('button', { type: 'button', className: c === chat.tab ? 'on' : '' }, c === 'all' ? 'Général' : `✉️ ${chat.names[c] ?? '…'}`);
    if (chat.unread[c]) b.append(el('span', { className: 'badge' }, String(chat.unread[c])));
    b.addEventListener('click', () => openConv(c));
    tabs.append(b);
  }
}

function renderChat() {
  renderTabs();
  const list = $('chat-list');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.innerHTML = '';
  const shown = chat.messages.filter((m) => convOf(m) === chat.tab && !muted.has(m.from));
  if (!shown.length) list.append(el('p', { className: 'chat-empty' }, chat.tab === 'all' ? 'Aucun message pour l\'instant. Dis bonjour !' : 'Début de votre conversation privée.'));
  for (const m of shown) {
    const row = el('div', { className: `msg${m.from === myId ? ' mine' : ''}` });
    const who = el('span', { className: 'who', title: m.from === myId ? '' : 'Écrire en privé' }, m.name);
    if (m.from !== myId) who.addEventListener('click', () => openConv(m.from, m.name));
    row.append(who, document.createTextNode(m.text), el('time', {}, fmtTime(m.at)));
    list.append(row);
  }
  if (atBottom || chat.stick) { list.scrollTop = list.scrollHeight; chat.stick = false; }
  renderPeople();
}

function renderPeople() {
  const box = $('chat-people');
  box.innerHTML = '';
  if (chat.tab !== 'all') {
    const other = chat.tab;
    const row = el('div', { className: 'p' });
    row.append(el('span', {}, `Conversation privée avec ${chat.names[other] ?? '…'}`));
    const hide = el('button', { type: 'button' }, muted.has(other) ? 'Réafficher' : '🚫 Masquer');
    hide.addEventListener('click', () => {
      if (muted.has(other)) muted.delete(other); else muted.add(other);
      try { localStorage.setItem('bramblekin.blocked', JSON.stringify([...muted])); } catch { /* ignoré */ }
      if (muted.has(other)) chat.tab = 'all';
      renderChat();
    });
    row.append(hide);
    box.append(row);
    return;
  }
  box.append(el('h4', {}, players.length ? `En ligne (${players.length + 1}) :` : 'Personne d\'autre en ligne avec un pseudo pour l\'instant.'));
  for (const p of players) {
    if (muted.has(p.id)) continue;
    const row = el('div', { className: 'p' });
    row.append(el('span', {}, p.name));
    const dm = el('button', { type: 'button', title: `Écrire à ${p.name} en privé` }, '✉️ Message privé');
    dm.addEventListener('click', () => openConv(p.id, p.name));
    row.append(dm);
    box.append(row);
  }
}

function openConv(c, name) {
  if (name) chat.names[c] = name;
  chat.tab = c;
  chat.unread[c] = 0;
  chat.stick = true;
  updateUnread();
  renderChat();
  $('chat-input').placeholder = c === 'all' ? 'Écris à tout le monde…' : `Message privé à ${chat.names[c] ?? '…'}…`;
  $('chat-input').focus({ preventScroll: true });
}

function openChat() {
  $('chat').hidden = false;
  $('chat-name').hidden = myName.length >= 2;
  held.length = 0;
  openConv(chat.tab);
  pollChat(); scheduleChat();
}
$('btn-chat').addEventListener('click', () => ($('chat').hidden ? openChat() : ($('chat').hidden = true)));
$('btn-online').addEventListener('click', () => { chat.tab = 'all'; openChat(); });
$('chat-close').addEventListener('click', () => { $('chat').hidden = true; scheduleChat(); });
$('chat-name-ok').addEventListener('click', () => {
  const n = $('chat-name-input').value.replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 15);
  if (n.length < 2) { $('chat-note').textContent = 'Le pseudo doit faire au moins 2 caractères.'; return; }
  myName = n;
  try { localStorage.setItem(NAME_KEY, n); } catch { /* ignoré */ }
  $('chat-name').hidden = true;
  $('chat-note').textContent = '';
  presence().then(() => { if (myName) { $('chat-note').textContent = `Pseudo « ${myName} » réservé pour toi ✔`; $('chat-input').focus(); } });
});
$('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('chat-input').value.trim();
  if (!text) return;
  if (myName.length < 2) { $('chat-name').hidden = false; $('chat-name-input').focus(); return; }
  const body = { token: token(), name: myName, text };
  if (chat.tab !== 'all') body.to = chat.tab;
  try {
    const r = await fetch('chat.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (d.error === 'name_taken') {
      $('chat-note').textContent = `Le pseudo « ${myName} » est déjà pris par un autre joueur. Choisis-en un autre.`;
      myName = '';
      try { localStorage.removeItem(NAME_KEY); } catch { /* ignoré */ }
      $('chat-name').hidden = false;
      $('chat-name-input').focus();
      return;
    }
    if (!r.ok) { $('chat-note').textContent = d.error === 'slow' ? 'Doucement : un message toutes les 2 secondes.' : 'Message refusé.'; return; }
    $('chat-input').value = '';
    $('chat-note').textContent = '';
    chat.stick = true;
    pollChat();
  } catch { $('chat-note').textContent = 'Pas de réseau : message non envoyé.'; }
});

const where = await loadSave();
const start = chunkOf('t1');
if (where && !where.inside && Number.isInteger(where.x) && Number.isInteger(where.y) && WALK_OUT.has(tileAt(where.x, where.y))) place(where.x, where.y, where.d ?? 'u');
else place(15 + start.x0, 13 + start.z0);
updateOutdoor();
if (where?.inside && zones[where.inside]) goInside(where.inside, where.x, where.y);
requestAnimationFrame(frame);
window.__demo = { chat, openChat, presence, pollChat, get players() { return players; }, save, snapshot, party, bag, renderer, MOBILE, me, place, goInside, people, chunkOf, updateOutdoor, get event() { return event; } };
