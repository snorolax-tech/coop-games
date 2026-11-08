// Sky dome, sun/moon, stars, fog and lighting driven by the time of day.
// time: 0..1 (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset).
import * as THREE from 'three';
import { smoothstep } from '../core/noise.js';

const KEYS = [
  // t,     top,       horizon,   bottom,    hemiSky,   hemiGround, sun colour
  [0.00, '#0b1033', '#1d2552', '#0a0d22', '#3b4a8a', '#1a1630', '#9fb4ff'],
  [0.20, '#0b1033', '#1d2552', '#0a0d22', '#3b4a8a', '#1a1630', '#9fb4ff'],
  [0.26, '#4a6fb5', '#ffb38a', '#6b5b7a', '#ffc9a8', '#6a5a70', '#ffb26b'],
  [0.34, '#3d8ee8', '#bfe6ff', '#8fc1e0', '#d8f0ff', '#7f9a5a', '#fff2d6'],
  [0.66, '#3d8ee8', '#bfe6ff', '#8fc1e0', '#d8f0ff', '#7f9a5a', '#fff2d6'],
  [0.74, '#3b4a9a', '#ff8f6b', '#5a4a6a', '#ffb08f', '#6a4a5a', '#ff9a5a'],
  [0.80, '#0b1033', '#1d2552', '#0a0d22', '#3b4a8a', '#1a1630', '#9fb4ff'],
  [1.00, '#0b1033', '#1d2552', '#0a0d22', '#3b4a8a', '#1a1630', '#9fb4ff'],
].map(([t, ...cols]) => [t, ...cols.map((c) => new THREE.Color(c))]);

function sample(t, idx, out) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const k = (t - a[0]) / (b[0] - a[0] || 1);
      return out.copy(a[idx]).lerp(b[idx], k);
    }
  }
  return out.copy(KEYS[0][idx]);
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.time = 0.3;
    this.night = 0;
    this.sunDir = new THREE.Vector3();

    this.uniforms = {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
      sunDir: { value: this.sunDir }, night: { value: 0 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: /* glsl */`
          varying vec3 vDir;
          void main() {
            vDir = position;
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform float night;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
            float s = max(dot(d, sunDir), 0.0);
            col += vec3(1.0, 0.92, 0.7) * smoothstep(0.9975, 0.999, s) * 1.6 * (1.0 - night);
            col += vec3(1.0, 0.7, 0.4) * pow(s, 10.0) * 0.28 * (1.0 - night);
            float m = max(dot(d, -sunDir), 0.0);
            col += vec3(0.92, 0.95, 1.0) * smoothstep(0.9988, 0.9993, m) * night;
            col += vec3(0.4, 0.5, 0.9) * pow(m, 30.0) * 0.12 * night;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.dome = dome;
    scene.add(dome);

    // stars
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const y = Math.abs(u) * 0.95 + 0.05;
      pos[i * 3] = Math.cos(th) * r * 850; pos[i * 3 + 1] = y * 850; pos[i * 3 + 2] = Math.sin(th) * r * 850;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1.3);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.4;
    scene.add(this.sun, this.sun.target);

    scene.fog = new THREE.Fog(0xbfe6ff, 140, 560);
    this._c = new THREE.Color();
  }

  /** Returns a short label like "7:30 AM". */
  clockText() {
    const mins = Math.floor(this.time * 24 * 60);
    let h = Math.floor(mins / 60), m = mins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${String(Math.floor(m / 10) * 10).padStart(2, '0')} ${ampm}`;
  }

  get isNight() { return this.night > 0.5; }

  update(focus) {
    const t = this.time;
    const th = (t - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(th), Math.sin(th), 0.35).normalize();
    this.night = 1 - smoothstep(-0.12, 0.12, this.sunDir.y);
    this.uniforms.night.value = this.night;
    sample(t, 1, this.uniforms.top.value);
    sample(t, 2, this.uniforms.horizon.value);
    sample(t, 3, this.uniforms.bottom.value);
    this.scene.fog.color.copy(this.uniforms.horizon.value).lerp(this.uniforms.top.value, 0.25);
    sample(t, 4, this.hemi.color);
    sample(t, 5, this.hemi.groundColor);
    this.hemi.intensity = 0.75 + 0.5 * (1 - this.night);

    // one shadow-casting light: the sun by day, the moon by night
    const lightDir = this.sunDir.y > -0.05 ? this.sunDir : this._moon(this.sunDir);
    sample(t, 6, this.sun.color);
    const elev = Math.max(0, lightDir.y);
    this.sun.intensity = this.night > 0.5 ? 0.45 : 2.3 * smoothstep(0.0, 0.25, elev) + 0.2;
    this.sun.position.copy(focus).addScaledVector(lightDir, 150);
    this.sun.target.position.copy(focus);
    this.starMat.opacity = this.night;
    this.dome.position.copy(focus);
    this.stars.position.copy(focus);
  }

  _moon(sunDir) {
    this._moonDir = this._moonDir || new THREE.Vector3();
    return this._moonDir.copy(sunDir).multiplyScalar(-1);
  }
}
