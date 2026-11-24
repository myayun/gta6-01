// traffic-wasm.js — one job: the Rust traffic integrator (or its JS twin).
// The wasm module owns a Float32Array of traffic-car state (8 floats per
// car: x, z, heading, speed, targetSpeed, targetX, targetZ, arrivedFlag)
// and steps it: steer toward the target, accelerate, follow the car ahead.
// If the wasm file fails to load, the identical math runs in JS, so the
// game never depends on the module.

export const TRAFFIC_STRIDE = 8;

export function jsTrafficStep(state, count, dt) {
  for (let i = 0; i < count; i++) {
    const b = i * TRAFFIC_STRIDE;
    let x = state[b]; let z = state[b + 1];
    let heading = state[b + 2]; let speed = state[b + 3];
    const targetSpeed = state[b + 4];
    const tx = state[b + 5]; const tz = state[b + 6];
    const dx = tx - x; const dz = tz - z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) { state[b + 7] = 1; state[b + 3] = 0; continue; }
    state[b + 7] = 0;
    // steer toward target, max turn 2.8 rad/s
    const want = Math.atan2(dx, dz);
    let dh = want - heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const maxTurn = 2.8 * dt;
    heading += Math.max(-maxTurn, Math.min(maxTurn, dh));
    // car following: slow for the car ahead
    let cap = targetSpeed;
    for (let j = 0; j < count; j++) {
      if (j === i) continue;
      const jb = j * TRAFFIC_STRIDE;
      const jx = state[jb] - x; const jz = state[jb + 1] - z;
      const jd = Math.hypot(jx, jz);
      if (jd < 12 && jd > 0.01) {
        const ahead = (jx * Math.sin(heading) + jz * Math.cos(heading)) / jd;
        if (ahead > 0.7) {
          if (jd < 5) cap = 0;
          else cap = Math.min(cap, state[jb + 3]);
        }
      }
    }
    // accelerate / brake toward the capped speed
    const accel = cap > speed ? 6 : 14;
    if (speed < cap) speed = Math.min(cap, speed + accel * dt);
    else if (speed > cap) speed = Math.max(cap, speed - accel * dt);
    x += Math.sin(heading) * speed * dt;
    z += Math.cos(heading) * speed * dt;
    state[b] = x; state[b + 1] = z; state[b + 2] = heading; state[b + 3] = speed;
  }
}

export async function loadTrafficWasm() {
  try {
    const response = await fetch('vendor/traffic.wasm');
    if (!response.ok) return null;
    const { instance } = await WebAssembly.instantiateStreaming(response, {});
    const memory = instance.exports.memory;
    const alloc = instance.exports.alloc_bytes;
    const step = instance.exports.traffic_step;
    if (!memory || !alloc || !step) return null;
    return {
      kind: 'wasm',
      memory,
      alloc,
      step,
      makeState(count) {
        const ptr = alloc(count * TRAFFIC_STRIDE * 4);
        return { ptr, view: new Float32Array(memory.buffer, ptr, count * TRAFFIC_STRIDE) };
      },
    };
  } catch (err) {
    return null;
  }
}
