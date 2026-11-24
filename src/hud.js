// hud.js — one job: everything drawn over the game.
// Health, cash, wanted stars, clock, objective, speed, crosshair, toasts,
// damage flash, and the minimap (a live top-down canvas of the city).

import { WORLD, MISSIONS, LOCATIONS } from './config.js';

export class HUD {
  constructor() {
    const root = document.createElement('div');
    root.id = 'hud';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:Verdana,Arial,sans-serif;color:#fff;z-index:5;';
    root.innerHTML = `
      <div id="hud-tl" style="position:absolute;top:14px;left:16px;">
        <div style="font-weight:bold;font-size:18px;text-shadow:0 2px 4px rgba(0,0,0,.7)">MARA VOSS</div>
        <div style="margin-top:6px;width:190px;height:14px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.5);">
          <div id="hud-hp" style="height:100%;width:100%;background:#e74c3c;"></div>
        </div>
        <div id="hud-cash" style="margin-top:6px;font-size:17px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,.7)">$250</div>
        <div id="hud-clock" style="font-size:13px;text-shadow:0 2px 4px rgba(0,0,0,.7)">17:20</div>
      </div>
      <div id="hud-stars" style="position:absolute;top:14px;right:16px;font-size:26px;letter-spacing:2px;text-shadow:0 2px 6px rgba(0,0,0,.8)">☆☆☆☆☆</div>
      <div id="hud-obj" style="position:absolute;top:14px;left:50%;transform:translateX(-50%);text-align:center;max-width:520px;">
        <div id="hud-obj-text" style="font-size:15px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,.8)"></div>
        <div id="hud-obj-dist" style="font-size:13px;text-shadow:0 2px 4px rgba(0,0,0,.8)"></div>
      </div>
      <div id="hud-speed" style="position:absolute;bottom:16px;right:18px;font-size:26px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,.8)"></div>
      <div id="hud-toast" style="position:absolute;top:86px;left:50%;transform:translateX(-50%);max-width:560px;text-align:center;font-size:14px;line-height:1.45;background:rgba(0,0,0,.62);padding:10px 14px;border-radius:6px;display:none;"></div>
      <div id="hud-cross" style="position:absolute;top:50%;left:50%;width:22px;height:22px;margin:-11px 0 0 -11px;display:none;">
        <div style="position:absolute;left:10px;top:0;width:2px;height:22px;background:#fff;"></div>
        <div style="position:absolute;top:10px;left:0;width:22px;height:2px;background:#fff;"></div>
      </div>
      <div id="hud-flash" style="position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(200,0,0,.55) 100%);opacity:0;"></div>
      <div id="hud-wasted" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,.45);">
        <div id="hud-wasted-title" style="font-size:64px;font-weight:bold;letter-spacing:8px;text-shadow:0 4px 12px rgba(0,0,0,.9)">WASTED</div>
        <div style="margin-top:10px;font-size:15px;">Press R to get back on your feet</div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;

    const mapWrap = document.createElement('div');
    mapWrap.style.cssText = 'position:absolute;bottom:16px;left:16px;border:2px solid rgba(255,255,255,.65);border-radius:4px;background:rgba(0,0,0,.35);';
    const canvas = document.createElement('canvas');
    canvas.width = 210; canvas.height = 210;
    mapWrap.appendChild(canvas);
    root.appendChild(mapWrap);
    this.map = canvas;
    this.mapCtx = canvas.getContext('2d');

    this.hpEl = root.querySelector('#hud-hp');
    this.cashEl = root.querySelector('#hud-cash');
    this.clockEl = root.querySelector('#hud-clock');
    this.starsEl = root.querySelector('#hud-stars');
    this.objTextEl = root.querySelector('#hud-obj-text');
    this.objDistEl = root.querySelector('#hud-obj-dist');
    this.speedEl = root.querySelector('#hud-speed');
    this.toastEl = root.querySelector('#hud-toast');
    this.crossEl = root.querySelector('#hud-cross');
    this.flashEl = root.querySelector('#hud-flash');
    this.wastedEl = root.querySelector('#hud-wasted');
    this.wastedTitleEl = root.querySelector('#hud-wasted-title');
    this.toastTimer = 0;
    this.flashValue = 0;
  }

  toast(text, seconds) {
    this.toastEl.textContent = text;
    this.toastEl.style.display = 'block';
    this.toastTimer = seconds || 4;
  }

  flashDamage() {
    this.flashValue = 1;
  }

  showWasted(kind) {
    this.wastedTitleEl.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    this.wastedEl.style.display = 'flex';
  }

  hideWasted() {
    this.wastedEl.style.display = 'none';
  }

  update(game, dt) {
    const p = game.player;
    this.hpEl.style.width = `${Math.max(0, p.hp)}%`;
    this.hpEl.style.background = p.hp > 50 ? '#27ae60' : p.hp > 25 ? '#f39c12' : '#e74c3c';
    this.cashEl.textContent = `$${game.cash.toLocaleString()}`;
    const hh = String(Math.floor(game.clockMinutes / 60) % 24).padStart(2, '0');
    const mm = String(Math.floor(game.clockMinutes % 60)).padStart(2, '0');
    this.clockEl.textContent = `${hh}:${mm}`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < game.wanted ? '★' : '☆';
    this.starsEl.textContent = stars;
    this.starsEl.style.color = game.wanted > 0 ? '#ffd23f' : '#ffffff';
    const obj = game.missions.objective(game);
    this.objTextEl.textContent = obj.text;
    this.objDistEl.textContent = obj.distance > 0 ? `${Math.round(obj.distance)} m` : '';
    const speed = p.inCar ? Math.abs(p.inCar.speed) * 3.6 : Math.abs(p.speed) * 3.6;
    this.speedEl.textContent = p.inCar ? `${Math.round(speed)} km/h` : '';
    this.crossEl.style.display = !p.inCar && game.state === 'play' ? 'block' : 'none';
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.style.display = 'none';
    }
    if (this.flashValue > 0) {
      this.flashValue = Math.max(0, this.flashValue - dt * 1.8);
      this.flashEl.style.opacity = String(this.flashValue);
    }
    this._drawMinimap(game);
  }

  _drawMinimap(game) {
    const ctx = this.mapCtx;
    const S = 210;
    const scale = S / 760;
    const ox = 10 * scale;
    const oy = 10 * scale;
    ctx.clearRect(0, 0, S, S);
    // ocean + sand
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#e6cf9e';
    ctx.fillRect(0, (640 - 10) * scale + oy, S, 90 * scale);
    // blocks
    ctx.fillStyle = '#8d8f83';
    ctx.fillRect(0, 0, S, 650 * scale);
    // roads
    ctx.strokeStyle = '#3a3f44';
    ctx.lineWidth = 16 * scale;
    for (const c of game.world.streetCoords) {
      ctx.beginPath(); ctx.moveTo(c * scale + ox, 0); ctx.lineTo(c * scale + ox, 640 * scale + oy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, c * scale + oy); ctx.lineTo(640 * scale + ox, c * scale + oy); ctx.stroke();
    }
    const dot = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x * scale + ox, z * scale + oy, r, 0, Math.PI * 2);
      ctx.fill();
    };
    // mission waypoint
    const step = game.missions.currentStep();
    if (step && game.missions.state !== 'done') {
      const target = step.type === 'steal' ? LOCATIONS.vientoParked : (step.target ? LOCATIONS[step.target] : null);
      if (target) {
        const pulse = 5 + Math.sin(performance.now() / 300) * 2;
        dot(target.x, target.z, '#ffd23f', pulse);
      }
    }
    for (const car of game.traffic.cars) dot(car.x, car.z, '#cccccc', 2);
    for (const cop of game.police.cops) dot(cop.vehicle.x, cop.vehicle.z, '#ff3333', 3);
    // player arrow
    const p = game.player.inCar ? game.player.inCar : game.player;
    const px = p.x * scale + ox;
    const pz = p.z * scale + oy;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.PI - p.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
