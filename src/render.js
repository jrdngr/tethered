// All canvas drawing: arena, rope, ball, enemies, coins, HUD, game-over overlay.
window.Tethered = window.Tethered || {};

(function (S) {
  S.drawGame = function (ctx, game) {
    const T = S.TUNING;
    const b = game.ball;
    const w = game.width;
    const h = game.height;

    // Background + arena border.
    ctx.fillStyle = '#0d0e14';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2a2d3a';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    // Rope (cursor anchor -> ball), brighter the more it's stretched.
    if (game.tether.active) {
      const tension = Math.min(game.tether.stretch / 200, 1);
      ctx.strokeStyle = `rgba(255, ${Math.round(230 - 130 * tension)}, ${Math.round(230 - 200 * tension)}, 0.9)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(game.mouse.x, game.mouse.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // Anchor ring at the cursor.
      ctx.beginPath();
      ctx.arc(game.mouse.x, game.mouse.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    } else if (game.state === 'playing') {
      // Grab hint when hovering near the ball.
      const d = Math.hypot(game.mouse.x - b.x, game.mouse.y - b.y);
      if (d <= b.r + T.GRAB_RADIUS) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + T.GRAB_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Coins: spinning gold discs, fading out at the end of their life.
    // Health pickups share the array: a green disc with a white cross.
    for (const c of game.coins) {
      ctx.globalAlpha = Math.min((T.COIN_LIFETIME - c.age) / 1.5, 1);
      if (c.heal) {
        ctx.fillStyle = '#46a758';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8f5ec';
        const arm = c.r * 0.55; // cross half-length
        const thick = c.r * 0.3;
        ctx.fillRect(c.x - thick / 2, c.y - arm, thick, arm * 2);
        ctx.fillRect(c.x - arm, c.y - thick / 2, arm * 2, thick);
      } else {
        const wobble = Math.abs(Math.sin(c.spin + game.time * 6)); // fake 3D spin
        ctx.fillStyle = '#ffc53d';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.r * (0.25 + 0.75 * wobble), c.r, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Spark bursts (green heal sparks by default; the player death burst
    // overrides color and size), shrinking and fading as they die.
    for (const p of game.particles) {
      const t = p.age / p.life;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color || '#6fdc8c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, (p.size || 1) * (1 + 2.5 * (1 - t)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Enemies: chasers red, tanks purple; flash white when a hit doesn't
    // kill. Tanks at full HP wear an armor ring that breaks off with the
    // first hit.
    for (const e of game.enemies) {
      ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.tank ? '#b558f6' : '#e5484d';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
      if (e.tank && e.hp > 1) {
        ctx.strokeStyle = '#d8b4fe';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Death pops: an expanding, fading ring where an enemy was smashed.
    for (const p of game.pops) {
      const t = p.t / T.POP_DURATION;
      const ease = 1 - (1 - t) * (1 - t); // ease-out: fast burst, slow settle
      ctx.strokeStyle = `rgba(229, 72, 77, ${1 - t})`;
      ctx.lineWidth = 1 + 3 * (1 - t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + (T.POP_SCALE - 1) * ease), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Player death pop: staggered white-hot shockwave rings, far bigger and
    // longer than an enemy pop, with a screen flash at the moment of death.
    if (game.playerPop) {
      const p = game.playerPop;
      for (let i = 0; i < T.PLAYER_POP_RINGS; i++) {
        const t = (p.t - i * T.PLAYER_POP_RING_LAG) / T.PLAYER_POP_DURATION;
        if (t < 0 || t >= 1) continue;
        const ease = 1 - (1 - t) * (1 - t);
        ctx.strokeStyle = `rgba(174, 244, 255, ${1 - t})`;
        ctx.lineWidth = 2 + 6 * (1 - t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, T.BALL_RADIUS * (1 + (T.PLAYER_POP_SCALE - 1) * ease), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (p.t < T.PLAYER_POP_FLASH) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * (1 - p.t / T.PLAYER_POP_FLASH)})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // Ball color tracks speed (tethered or not): dark blue while slow, a
    // gradient that brightens (with growing glow) toward SPEED_COLOR_MAX
    // while fast. Just above the threshold it flashes the vulnerable dark
    // blue as an "about to drop out" warning. The glow is cyan when free
    // and tether-red while held (a smash still works but costs the combo).
    // Flash during i-frames. Once it pops, there's no ball to draw.
    if (game.state !== 'dying' && game.state !== 'gameover') {
      const speed = S.ballSpeed(b);
      const nearThreshold = speed < T.SPEED_THRESHOLD + T.SPEED_FLASH_WINDOW;
      const flashDark = nearThreshold && Math.sin(game.time * 25) > 0;
      ctx.save();
      if (b.iframes > 0 && Math.sin(game.time * 30) > 0) ctx.globalAlpha = 0.35;
      if (speed > T.SPEED_THRESHOLD && !flashDark) {
        const f = Math.min(
          (speed - T.SPEED_THRESHOLD) / (T.SPEED_COLOR_MAX - T.SPEED_THRESHOLD), 1);
        ctx.fillStyle = lerpColor([86, 140, 200], [174, 244, 255], f);
        ctx.shadowColor = game.tether.active ? '#ff641e' : '#56e8ff';
        ctx.shadowBlur = 10 + 22 * f;
      } else {
        ctx.fillStyle = '#33557a'; // vulnerable dark blue (also the warning flash)
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawHud(ctx, game);
    if (game.state === 'levelup') drawLevelUp(ctx, game);
    if (game.state === 'gameover') drawGameOver(ctx, game);
  };

  function lerpColor(a, b, t) {
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  function drawHud(ctx, game) {
    const T = S.TUNING;
    const b = game.ball;

    ctx.font = '16px monospace';
    ctx.textBaseline = 'top';

    // Combo, top-left.
    ctx.textAlign = 'left';
    ctx.fillStyle = game.combo > 1 ? '#56e8ff' : '#6b6f80';
    ctx.fillText(`COMBO x${game.combo}`, 16, 14);

    // HP bar below.
    const hpW = 160;
    const hpH = 10;
    ctx.fillStyle = '#33212a';
    ctx.fillRect(16, 42, hpW, hpH);
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(16, 42, hpW * Math.max(b.hp / game.stats.maxHp, 0), hpH);
    ctx.strokeStyle = '#2a2d3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(15.5, 41.5, hpW + 1, hpH + 1);

    // Level + coin progress bar, top center.
    const barW = 260;
    const barH = 8;
    const bx = (game.width - barW) / 2;
    const by = 18;
    const need = S.coinsForLevel(game.level);
    ctx.fillStyle = '#1c1f2a';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = '#ffc53d';
    ctx.fillRect(bx, by, barW * Math.min(game.coinProgress / need, 1), barH);
    ctx.strokeStyle = '#2a2d3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 0.5, by - 0.5, barW + 1, barH + 1);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffc53d';
    ctx.fillText(`LV ${game.level}`, bx - 10, 14);

    // Survival time, top-right.
    const secs = Math.floor(game.time);
    const mm = Math.floor(secs / 60);
    const ss = String(secs % 60).padStart(2, '0');
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8e8f0';
    ctx.fillText(`${mm}:${ss}`, game.width - 16, 14);

    // Speed meter, bottom center: shows how close the ball is to the
    // invincibility threshold (the key feedback for learning the mechanic).
    const meterW = 240;
    const meterH = 10;
    const mx = (game.width - meterW) / 2;
    const my = game.height - 30;
    const maxShown = T.SPEED_THRESHOLD * 1.6;
    const frac = Math.min(S.ballSpeed(b) / maxShown, 1);
    ctx.fillStyle = '#1c1f2a';
    ctx.fillRect(mx, my, meterW, meterH);
    const fast = S.ballSpeed(b) > T.SPEED_THRESHOLD;
    ctx.fillStyle = !fast ? '#6b6f80' : game.tether.active ? '#ff641e' : '#56e8ff';
    ctx.fillRect(mx, my, meterW * frac, meterH);
    // Threshold marker.
    const tx = mx + meterW * (T.SPEED_THRESHOLD / maxShown);
    ctx.fillStyle = '#e8e8f0';
    ctx.fillRect(tx - 1, my - 3, 2, meterH + 6);
  }

  // Level-up pause: three upgrade cards, hover to highlight, click to pick.
  function drawLevelUp(ctx, game) {
    ctx.fillStyle = 'rgba(13, 14, 20, 0.8)';
    ctx.fillRect(0, 0, game.width, game.height);

    const cx = game.width / 2;
    const cy = game.height / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffc53d';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(`LEVEL ${game.level}`, cx, cy - 130);
    ctx.fillStyle = '#e8e8f0';
    ctx.font = '16px monospace';
    ctx.fillText('choose an upgrade', cx, cy - 95);

    const rects = S.upgradeCardRects(game);
    game.upgradeChoices.forEach((u, i) => {
      const r = rects[i];
      const hover = game.mouse.x >= r.x && game.mouse.x <= r.x + r.w &&
        game.mouse.y >= r.y && game.mouse.y <= r.y + r.h;
      ctx.fillStyle = hover ? '#242838' : '#1c1f2a';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = hover ? '#ffc53d' : '#2a2d3a';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#ffc53d';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(u.name, r.x + r.w / 2, r.y + 42);
      ctx.fillStyle = '#9aa0b4';
      ctx.font = '13px monospace';
      ctx.fillText(u.desc(), r.x + r.w / 2, r.y + 76);
    });
  }

  function drawGameOver(ctx, game) {
    ctx.fillStyle = 'rgba(13, 14, 20, 0.8)';
    ctx.fillRect(0, 0, game.width, game.height);

    const cx = game.width / 2;
    const cy = game.height / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e5484d';
    ctx.font = 'bold 48px monospace';
    ctx.fillText('GAME OVER', cx, cy - 60);

    const secs = Math.floor(game.time);
    const mm = Math.floor(secs / 60);
    const ss = String(secs % 60).padStart(2, '0');
    ctx.fillStyle = '#e8e8f0';
    ctx.font = '20px monospace';
    ctx.fillText(`LEVEL ${game.level}`, cx, cy);
    ctx.fillText(`SURVIVED ${mm}:${ss}`, cx, cy + 32);

    ctx.fillStyle = '#6b6f80';
    ctx.font = '16px monospace';
    ctx.fillText('click to restart', cx, cy + 80);
  }
})(Tethered);
