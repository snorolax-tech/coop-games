// Simple pooled particles: dust puffs, splashes, water streams, sparkles.
import * as THREE from 'three';

const geo = new THREE.IcosahedronGeometry(0.08, 0);

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
  }

  _spawn(pos, vel, color, life, size = 1, gravity = 9) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(pos);
    m.scale.setScalar(size);
    this.scene.add(m);
    this.parts.push({ m, vel, life, max: life, gravity, size });
  }

  puff(pos, color = 0xffffff, n = 10) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
      this._spawn(pos, v, color, 0.5 + Math.random() * 0.3, 1.5 + Math.random(), 8);
    }
  }

  splash(pos) {
    for (let i = 0; i < 14; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 4 + 2, (Math.random() - 0.5) * 3);
      this._spawn(pos, v, 0x9fe3ff, 0.7, 1.2, 14);
    }
  }

  water(origin, dir) {
    for (let i = 0; i < 18; i++) {
      const v = dir.clone().multiplyScalar(2.5 + Math.random() * 1.5).add(new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.5, (Math.random() - 0.5)));
      setTimeout(() => this._spawn(origin, v, 0x6fd3ff, 0.8, 0.8, 12), i * 20);
    }
  }

  sparkle(pos, color = 0xffe066, n = 16) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3);
      this._spawn(pos, v, color, 0.9, 1, 1);
    }
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.m); p.m.material.dispose();
        this.parts.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.m.position.addScaledVector(p.vel, dt);
      const k = p.life / p.max;
      p.m.material.opacity = k;
      p.m.scale.setScalar(p.size * (0.5 + k * 0.5));
    }
  }
}
