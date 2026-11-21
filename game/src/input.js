// Keyboard and mouse state, plus the camera rig: a mouse-orbit third-person camera
// on foot and a smoothed chase camera in a car. Screenshot scenes bypass the rig and
// frame their shots directly, so nothing here depends on pointer lock.
import * as THREE from 'three';

export class InputState {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDown = false;
    this.dragDX = 0;
    this.dragDY = 0;
    this.wheel = 0;
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('mousedown', () => { this.mouseDown = true; this.pressed.add('MouseShoot'); });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.mouseDown) { this.dragDX += e.movementX || 0; this.dragDY += e.movementY || 0; }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  /** One-shot: true only on the first frame after the press. Cleared by endFrame(). */
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  endFrame() { this.pressed.clear(); this.dragDX = 0; this.dragDY = 0; this.wheel = 0; }
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI; // behind Rio at spawn, looking toward +x
    this.pitch = 0.32;
    this.dist = 9.5;
    this.smoothPos = new THREE.Vector3(0, 6, -12);
    this.lookTarget = new THREE.Vector3();
  }

  /** Frame `target` (a Vector3 at chest height). mode: 'foot' | 'car'. */
  update(dt, target, mode, input, carAngle = 0) {
    if (input) {
      this.yaw -= input.dragDX * 0.005;
      this.pitch = Math.max(0.06, Math.min(1.1, this.pitch + input.dragDY * 0.004));
      this.dist = Math.max(6, Math.min(17, this.dist + input.wheel * 1.2));
    }
    let desired;
    if (mode === 'car') {
      const back = 10.5, up = 4.2;
      desired = new THREE.Vector3(
        target.x - Math.sin(carAngle) * back,
        target.y + up,
        target.z - Math.cos(carAngle) * back);
      this.yaw = -carAngle + Math.PI;
    } else {
      desired = new THREE.Vector3(
        target.x - Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
        target.y + Math.sin(this.pitch) * this.dist,
        target.z - Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    }
    const k = Math.min(1, dt * (mode === 'car' ? 5.5 : 9));
    this.smoothPos.lerp(desired, k);
    if (this.smoothPos.y < 0.7) this.smoothPos.y = 0.7;
    this.camera.position.copy(this.smoothPos);
    this.lookTarget.lerp(new THREE.Vector3(target.x, target.y + 0.6, target.z), Math.min(1, dt * 12));
    this.camera.lookAt(this.lookTarget);
  }

  /** The horizontal direction the camera faces — Rio walks and shoots toward it. */
  facing() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }
}
