// The handheld TV camera: on-camera visibility tests (host) and picture-in-picture rendering (everyone).
import * as THREE from 'three';

export const CAM_FOV = [58, 72, 88];
export const CAM_MULT = [1.0, 1.2, 1.45];

export class ShowCam {
  constructor() {
    this.cam = new THREE.PerspectiveCamera(58, 16 / 9, 0.12, 60);
    this.cam.layers.enable(1);
    this._v = new THREE.Vector3();
    this._local = new THREE.Vector3();
    this.flash = 0;
  }
  // Copy the pose of the camera item mesh (lens points along the mesh's local -Z).
  updateFrom(itemMesh, fov) {
    itemMesh.updateMatrixWorld();
    itemMesh.getWorldPosition(this.cam.position);
    itemMesh.getWorldQuaternion(this.cam.quaternion);
    this.cam.translateZ(-0.32);
    if (this.cam.fov !== fov) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    this.cam.updateMatrixWorld();
  }
  isVisible(pos, maxDist = 13) {
    this._local.copy(pos);
    this.cam.worldToLocal(this._local);
    if (this._local.z > -0.2) return false; // behind the camera
    if (-this._local.z > maxDist) return false;
    this._v.copy(pos).project(this.cam);
    return Math.abs(this._v.x) < 1.08 && Math.abs(this._v.y) < 1.1;
  }
  // Render into a corner of the main canvas using scissor test.
  renderPIP(renderer, scene, rect) {
    const size = renderer.getSize(new THREE.Vector2());
    const y = size.y - rect.y - rect.h; // scissor origin is bottom-left
    renderer.setScissorTest(true);
    renderer.setScissor(rect.x, y, rect.w, rect.h);
    renderer.setViewport(rect.x, y, rect.w, rect.h);
    this.cam.aspect = rect.w / rect.h; this.cam.updateProjectionMatrix();
    renderer.render(scene, this.cam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
  }
}
