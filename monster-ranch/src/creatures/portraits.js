// Renders a small portrait image of each species (for the Dex) using an offscreen renderer.
import * as THREE from 'three';
import { buildCreatureModel } from './model.js';
import { SPECIES_BY_ID } from '../data/creatures.js';

let renderer, scene, camera;
const cache = new Map();

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(192, 192);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a9a, 2.2));
  const d = new THREE.DirectionalLight(0xffffff, 2.2);
  d.position.set(2, 4, 5);
  scene.add(d);
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
}

/** Returns a data URL for the species portrait (cached). */
export function portrait(speciesId, shiny = false) {
  const key = speciesId + (shiny ? '*' : '');
  if (cache.has(key)) return cache.get(key);
  if (!renderer) setup();
  const sp = SPECIES_BY_ID[speciesId];
  const m = buildCreatureModel(sp, { shiny });
  m.update(0.016, {});
  m.root.rotation.y = 0.55;
  scene.add(m.root);
  const box = new THREE.Box3().setFromObject(m.root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const dist = Math.max(size.y, size.x, size.z) / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 1.25;
  camera.position.set(center.x, center.y + size.y * 0.15, center.z + dist);
  camera.lookAt(center);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(m.root);
  cache.set(key, url);
  return url;
}
