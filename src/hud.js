// hud.js — one job: everything drawn over the game.
// Health, cash, wanted stars, clock, the persistent mission panel (current
// objective + mission list), the weapon bar, the SBPD dispatch panel, the
// Dante dialogue box, rank/RP, vehicle + radio, speed, crosshair, toasts,
// damage flash, and the minimap (a live top-down canvas of the city).

import { WORLD, MISSIONS, LOCATIONS, RANKS, RADIO } from './config.js';

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
      <div id="hud-rank" style="position:absolute;top:52px;right:16px;text-align:right;">
        <div id="hud-rank-name" style="font-size:14px;font-weight:bold;color:#ffd23f;text-shadow:0 2px 4px rgba(0,0,0,.8)">ROOKIE</div>
        <div id="hud-rank-rp" style="font-size:12px;text-shadow:0 2px 4px rgba(0,0,0,.8)">0 RP</div>
        <div style="margin-top:3px;width:150px;height:6px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.4);margin-left:auto;">
          <div id="hud-rank-bar" style="height:100%;width:0%;background:#ffd23f;"></div>
        </div>
      </div>
      <div id="hud-leftcol" style="position:absolute;top:108px;left:16px;width:320px;display:flex;flex-direction:column;gap:10px;">
        <div id="hud-mission" style="background:rgba(0,0,0,.66);border-left:4px solid #ffd23f;border-radius:4px;padding:10px 12px;">
          <div id="hud-m-head" style="font-size:13px;font-weight:bold;color:#ffd23f;letter-spacing:1px;">MISSION 1/3 · FIRST WHEELS</div>
          <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
            <span id="hud-m-step" style="font-size:12px;color:#dfe6ee;">STEP 1/2</span>
            <span style="flex:1;height:6px;background:rgba(255,255,255,.18);border-radius:3px;overflow:hidden;">
              <span id="hud-m-stepbar" style="display:block;height:100%;width:50%;background:#ffd23f;"></span>
            </span>
          </div>
          <div id="hud-m-obj" style="margin-top:8px;font-size:16px;font-weight:bold;line-height:1.35;text-shadow:0 2px 4px rgba(0,0,0,.8)"></div>
          <div id="hud-m-next" style="margin-top:5px;font-size:13px;color:#ffd23f;"></div>
          <div id="hud-m-dist" style="margin-top:4px;font-size:13px;color:#dfe6ee;"></div>
          <div id="hud-m-list" style="margin-top:9px;padding-top:8px;border-top:1px solid rgba(255,255,255,.22);font-size:12.5px;line-height:1.7;"></div>
        </div>
        <div id="hud-dispatch" style="background:rgba(0,0,0,.66);border-left:4px solid #ff5252;border-radius:4px;padding:10px 12px;display:none;">
          <div style="font-size:13px;font-weight:bold;color:#ff8a80;letter-spacing:1px;">SBPD DISPATCH</div>
          <div id="hud-d-rows" style="margin-top:6px;font-size:13px;line-height:1.65;"></div>
        </div>
      </div>
      <div id="hud-weapons" style="position:absolute;bottom:96px;right:18px;display:flex;gap:8px;">
        <div id="hud-w-fists" style="min-width:78px;text-align:center;background:rgba(0,0,0,.6);border:2px solid rgba(255,255,255,.35);border-radius:4px;padding:6px 8px;">
          <div style="font-size:11px;color:#bbb;">1</div>
          <div style="font-size:13px;font-weight:bold;">FISTS</div>
          <div style="font-size:12px;color:#bbb;">∞</div>
        </div>
        <div id="hud-w-pistol" style="min-width:78px;text-align:center;background:rgba(0,0,0,.6);border:2px solid #ffd23f;border-radius:4px;padding:6px 8px;">
          <div style="font-size:11px;color:#bbb;">2</div>
          <div style="font-size:13px;font-weight:bold;">PISTOL</div>
          <div style="font-size:12px;color:#ffd23f;">∞</div>
        </div>
      </div>
      <div id="hud-speedwrap" style="position:absolute;bottom:16px;right:18px;text-align:right;">
        <div id="hud-veh" style="font-size:16px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,.8)"></div>
        <div id="hud-cond" style="font-size:12.5px;text-shadow:0 2px 4px rgba(0,0,0,.8)"></div>
        <div id="hud-speed" style="font-size:26px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,.8)"></div>
        <div id="hud-radio" style="font-size:12px;color:#9fd8ff;text-shadow:0 2px 4px rgba(0,0,0,.8)">♪ ${RADIO}</div>
      </div>
      <div id="hud-toast" style="position:absolute;top:86px;left:50%;transform:translateX(-50%);max-width:560px;text-align:center;font-size:14px;line-height:1.45;background:rgba(0,0,0,.62);padding:10px 14px;border-radius:6px;display:none;"></div>
      <div id="hud-dialogue" style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);width:580px;max-width:92vw;background:rgba(0,0,0,.8);border:1px solid rgba(255,255,255,.35);border-radius:6px;padding:12px 14px;display:none;pointer-events:auto;cursor:pointer;">
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <div id="hud-d-portrait" style="flex:none;width:48px;height:48px;border-radius:4px;background:#8a6b4a;color:#fff;font-weight:bold;font-size:19px;display:flex;align-items:center;justify-content:center;">DR</div>
          <div style="flex:1;">
            <div id="hud-d-name" style="font-size:13px;font-weight:bold;color:#ffd23f;">DANTE REYES · FIXER</div>
            <div id="hud-d-line" style="margin-top:4px;font-size:15px;line-height:1.5;"></div>
            <div style="margin-top:7px;font-size:11px;color:#bbb;text-align:right;">CLICK • NEXT</div>
          </div>
        </div>
      </div>
      <div id="hud-cross" style="position:absolute;top:50%;left:50%;width:26px;height:26px;margin:-13px 0 0 -13px;display:none;">
        <div style="position:absolute;left:12px;top:0;width:2px;height:26px;background:#fff;box-shadow:0 0 3px #000;"></div>
        <div style="position:absolute;top:12px;left:0;width:26px;height:2px;background:#fff;box-shadow:0 0 3px #000;"></div>
        <div style="position:absolute;left:11px;top:11px;width:4px;height:4px;border-radius:50%;background:#ffd23f;"></div>
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
    this.rankNameEl = root.querySelector('#hud-rank-name');
    this.rankRpEl = root.querySelector('#hud-rank-rp');
    this.rankBarEl = root.querySelector('#hud-rank-bar');
    this.mHeadEl = root.querySelector('#hud-m-head');
    this.mStepEl = root.querySelector('#hud-m-step');
    this.mStepBarEl = root.querySelector('#hud-m-stepbar');
    this.mObjEl = root.querySelector('#hud-m-obj');
    this.mNextEl = root.querySelector('#hud-m-next');
    this.mDistEl = root.querySelector('#hud-m-dist');
    this.mListEl = root.querySelector('#hud-m-list');
    this.dispatchEl = root.querySelector('#hud-dispatch');
    this.dispatchRowsEl = root.querySelector('#hud-d-rows');
    this.wFistsEl = root.querySelector('#hud-w-fists');
    this.wPistolEl = root.querySelector('#hud-w-pistol');
    this.vehEl = root.querySelector('#hud-veh');
    this.condEl = root.querySelector('#hud-cond');
    this.speedEl = root.querySelector('#hud-speed');
    this.toastEl = root.querySelector('#hud-toast');
    this.dialogueEl = root.querySelector('#hud-dialogue');
    this.dPortraitEl = root.querySelector('#hud-d-portrait');
    this.dNameEl = root.querySelector('#hud-d-name');
    this.dLineEl = root.querySelector('#hud-d-line');
    this.crossEl = root.querySelector('#hud-cross');
    this.flashEl = root.querySelector('#hud-flash');
    this.wastedEl = root.querySelector('#hud-wasted');
    this.wastedTitleEl = root.querySelector('#hud-wasted-title');
    this.toastTimer = 0;
    this.flashValue = 0;
    this.dialogueTimer = 0;
    this.dialogueQueue = [];
    this.dialogueEl.addEventListener('click', () => this.hideDialogue());
  }

  toast(text, seconds) {
    this.toastEl.textContent = text;
    this.toastEl.style.display = 'block';
    this.toastTimer = seconds || 4;
  }

  // Dante (or another speaker) talks: a persistent box the player reads,
  // dismissed by clicking it or after 9 seconds. If a line is already
  // showing, the new one queues behind it instead of overwriting it.
  showDialogue(speaker, role, line) {
    if (this.dialogueEl.style.display === 'block') {
      this.dialogueQueue.push({ speaker, role, line });
      return;
    }
    this._displayDialogue(speaker, role, line);
  }

  _displayDialogue(speaker, role, line) {
    const initials = speaker.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    this.dPortraitEl.textContent = initials;
    this.dNameEl.textContent = `${speaker.toUpperCase()} · ${role.toUpperCase()}`;
    this.dLineEl.textContent = line;
    this.dialogueEl.style.display = 'block';
    this.dialogueTimer = 9;
  }

  hideDialogue() {
    this.dialogueEl.style.display = 'none';
    this.dialogueTimer = 0;
    if (this.dialogueQueue.length > 0) {
      const next = this.dialogueQueue.shift();
      this._displayDialogue(next.speaker, next.role, next.line);
    }
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

  _rankFor(rp) {
    let rank = RANKS[0];
    let next = null;
    for (let i = 0; i < RANKS.length; i++) {
      if (rp >= RANKS[i].min) rank = RANKS[i];
      else { next = RANKS[i]; break; }
    }
    return { rank, next };
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
    // rank / RP
    const { rank, next } = this._rankFor(game.rp || 0);
    this.rankNameEl.textContent = rank.name;
    this.rankRpEl.textContent = next ? `${(game.rp || 0).toLocaleString()} / ${next.min.toLocaleString()} RP` : `${(game.rp || 0).toLocaleString()} RP · MAX`;
    this.rankBarEl.style.width = next ? `${Math.min(100, ((game.rp || 0) - rank.min) / (next.min - rank.min) * 100)}%` : '100%';
    // mission panel
    const ms = game.missions;
    if (ms.state === 'done') {
      this.mHeadEl.textContent = 'ALL MISSIONS DONE';
      this.mStepEl.textContent = '3/3';
      this.mStepBarEl.style.width = '100%';
      this.mObjEl.textContent = 'Free roam — Solmar Bay is yours';
      this.mNextEl.textContent = '';
      this.mDistEl.textContent = '';
    } else {
      const m = ms.current();
      const step = ms.currentStep();
      this.mHeadEl.textContent = `MISSION ${ms.index + 1}/${MISSIONS.length} · ${m.title.toUpperCase()}`;
      this.mStepEl.textContent = `STEP ${ms.step + 1}/${m.steps.length}`;
      this.mStepBarEl.style.width = `${((ms.step + 1) / m.steps.length) * 100}%`;
      const obj = ms.objective(game);
      this.mObjEl.textContent = obj.text;
      const nextStep = m.steps[ms.step + 1];
      this.mNextEl.textContent = nextStep ? `NEXT: ${nextStep.text}` : 'NEXT: Complete the mission';
      this.mDistEl.textContent = obj.distance > 0 ? `${Math.round(obj.distance)} m to target` : '';
    }
    // mission list: DONE / ACTIVE / LOCKED
    let listHtml = '';
    for (let i = 0; i < MISSIONS.length; i++) {
      const state = ms.state === 'done' || i < ms.index ? 'DONE' : (i === ms.index ? 'ACTIVE' : 'LOCKED');
      const color = state === 'DONE' ? '#27ae60' : (state === 'ACTIVE' ? '#ffd23f' : '#999');
      listHtml += `<div><span style="color:${color};font-weight:bold;">${state === 'DONE' ? '✓' : (state === 'ACTIVE' ? '▶' : '○')}</span> ${i + 1}. ${MISSIONS[i].title} <span style="color:${color};">— ${state}</span></div>`;
    }
    this.mListEl.innerHTML = listHtml;
    // SBPD dispatch: named units with distance + behaviour
    const focus = p.inCar ? p.inCar : p;
    const rows = [];
    game.police.cops.forEach((cop, i) => {
      const d = Math.round(Math.hypot(cop.vehicle.x - focus.x, cop.vehicle.z - focus.z));
      rows.push(`<div>SBPD-${i + 1} · ${d} m · <span style="color:#ff8a80;">${cop.interceptor ? 'ROADBLOCK' : 'PURSUE'}</span></div>`);
    });
    game.police.footCops.forEach((cop, i) => {
      const d = Math.round(Math.hypot(cop.x - focus.x, cop.z - focus.z));
      rows.push(`<div>SBPD-F${i + 1} · ${d} m · <span style="color:#ff8a80;">ON FOOT</span></div>`);
    });
    if (rows.length > 0) {
      this.dispatchEl.style.display = 'block';
      this.dispatchRowsEl.innerHTML = rows.slice(0, 5).join('');
    } else {
      this.dispatchEl.style.display = 'none';
    }
    // weapon bar
    const armed = p.weapon === 'pistol';
    this.wPistolEl.style.borderColor = armed ? '#ffd23f' : 'rgba(255,255,255,.35)';
    this.wPistolEl.style.background = armed ? 'rgba(255,210,63,.22)' : 'rgba(0,0,0,.6)';
    this.wFistsEl.style.borderColor = !armed ? '#ffd23f' : 'rgba(255,255,255,.35)';
    this.wFistsEl.style.background = !armed ? 'rgba(255,210,63,.22)' : 'rgba(0,0,0,.6)';
    // vehicle + speed + radio
    const speed = p.inCar ? Math.abs(p.inCar.speed) * 3.6 : Math.abs(p.speed) * 3.6;
    if (p.inCar) {
      this.vehEl.textContent = p.inCar.spec.name;
      this.condEl.textContent = `CONDITION ${Math.round((1 - p.inCar.damage) * 100)}%`;
      this.speedEl.textContent = `${Math.round(speed)} km/h`;
    } else {
      this.vehEl.textContent = '';
      this.condEl.textContent = '';
      this.speedEl.textContent = '';
    }
    this.crossEl.style.display = !p.inCar && game.state === 'play' && p.weapon === 'pistol' ? 'block' : 'none';
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.style.display = 'none';
    }
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.hideDialogue();
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
    // mission waypoint (pulse driven by game time, so screenshots stay deterministic)
    const step = game.missions.currentStep();
    if (step && game.missions.state !== 'done') {
      const target = step.type === 'steal' ? LOCATIONS.vientoParked : (step.target ? LOCATIONS[step.target] : null);
      if (target) {
        const pulse = 5 + Math.sin(game.elapsed * 3.3) * 2;
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
