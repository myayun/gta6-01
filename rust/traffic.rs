// traffic.rs — the traffic integrator for Solmar Bay, compiled to WebAssembly.
// One job: step every traffic car one tick. State is a flat f32 array, 8
// floats per car: x, z, heading, speed, targetSpeed, targetX, targetZ,
// arrivedFlag. Forward is (sin(heading), cos(heading)).
// The JS twin of this exact math lives in src/traffic-wasm.js and runs when
// the wasm file cannot load, so the game never depends on this module.

use std::alloc::{alloc, Layout};

#[no_mangle]
pub extern "C" fn alloc_bytes(n: usize) -> *mut u8 {
    unsafe { alloc(Layout::from_size_align(n, 4).unwrap_or(Layout::from_size_align(4, 4).unwrap())) }
}

#[no_mangle]
pub extern "C" fn traffic_step(ptr: *mut f32, count: usize, dt: f32) {
    if ptr.is_null() || count == 0 || dt <= 0.0 {
        return;
    }
    let cars = unsafe { std::slice::from_raw_parts_mut(ptr, count * 8) };
    for i in 0..count {
        let b = i * 8;
        let mut x = cars[b];
        let mut z = cars[b + 1];
        let mut heading = cars[b + 2];
        let mut speed = cars[b + 3];
        let target_speed = cars[b + 4];
        let tx = cars[b + 5];
        let tz = cars[b + 6];
        let dx = tx - x;
        let dz = tz - z;
        let dist = (dx * dx + dz * dz).sqrt();
        if dist < 4.0 {
            cars[b + 7] = 1.0;
            cars[b + 3] = 0.0;
            continue;
        }
        cars[b + 7] = 0.0;
        // steer toward the target, at most 2.8 rad/s
        let want = dx.atan2(dz);
        let mut dh = want - heading;
        while dh > core::f32::consts::PI {
            dh -= 2.0 * core::f32::consts::PI;
        }
        while dh < -core::f32::consts::PI {
            dh += 2.0 * core::f32::consts::PI;
        }
        let max_turn = 2.8 * dt;
        heading += dh.clamp(-max_turn, max_turn);
        // follow the car ahead: slow down, stop if it is very close
        let mut cap = target_speed;
        let fx = heading.sin();
        let fz = heading.cos();
        for j in 0..count {
            if j == i {
                continue;
            }
            let jb = j * 8;
            let jx = cars[jb] - x;
            let jz = cars[jb + 1] - z;
            let jd = (jx * jx + jz * jz).sqrt();
            if jd < 12.0 && jd > 0.01 {
                let ahead = (jx * fx + jz * fz) / jd;
                if ahead > 0.7 {
                    if jd < 5.0 {
                        cap = 0.0;
                    } else if cars[jb + 3] < cap {
                        cap = cars[jb + 3];
                    }
                }
            }
        }
        // accelerate toward the capped speed (6 up, 14 braking)
        let accel = if cap > speed { 6.0 } else { 14.0 };
        if speed < cap {
            speed = (speed + accel * dt).min(cap);
        } else if speed > cap {
            speed = (speed - accel * dt).max(cap);
        }
        x += fx * speed * dt;
        z += fz * speed * dt;
        cars[b] = x;
        cars[b + 1] = z;
        cars[b + 2] = heading;
        cars[b + 3] = speed;
    }
}
