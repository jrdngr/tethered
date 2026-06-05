// All canvas drawing: arena, rope, ball, enemies, HUD, game-over overlay.
window.Swangin = window.Swangin || {};

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

    // Enemies.
    ctx.fillStyle = '#e5484d';
    for (const e of game.enemies) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ball: glow when invincible, flash during i-frames.
    const invincible = S.ballInvincible(game);
    ctx.save();
    if (b.iframes > 0 && Math.sin(game.time * 30) > 0) ctx.globalAlpha = 0.35;
    if (invincible) {
      ctx.shadowColor = '#56e8ff';
      ctx.shadowBlur = 28;
      ctx.fillStyle = '#aef4ff';
    } else {
      ctx.fillStyle = game.tether.active ? '#ffd76a' : '#e8e8f0';
    }
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawHud(ctx, game);
    if (game.state === 'gameover') drawGameOver(ctx, game);
  };

  function drawHud(ctx, game) {
    const T = S.TUNING;
    const b = game.ball;

    ctx.font = '16px monospace';
    ctx.textBaseline = 'top';

    // Score + combo, top-left.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8e8f0';
    ctx.fillText(`SCORE ${game.score}`, 16, 14);
    ctx.fillStyle = game.combo > 1 ? '#56e8ff' : '#6b6f80';
    ctx.fillText(`COMBO x${game.combo}`, 16, 36);

    // HP pips below.
    for (let i = 0; i < T.MAX_HP; i++) {
      ctx.fillStyle = i < b.hp ? '#e5484d' : '#33212a';
      ctx.beginPath();
      ctx.arc(24 + i * 22, 70, 7, 0, Math.PI * 2);
      ctx.fill();
    }

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
    ctx.fillStyle = !fast ? '#6b6f80' : game.tether.active ? '#ffd76a' : '#56e8ff';
    ctx.fillRect(mx, my, meterW * frac, meterH);
    // Threshold marker.
    const tx = mx + meterW * (T.SPEED_THRESHOLD / maxShown);
    ctx.fillStyle = '#e8e8f0';
    ctx.fillRect(tx - 1, my - 3, 2, meterH + 6);
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
    ctx.fillText(`SCORE ${game.score}`, cx, cy);
    ctx.fillText(`SURVIVED ${mm}:${ss}`, cx, cy + 32);

    ctx.fillStyle = '#6b6f80';
    ctx.font = '16px monospace';
    ctx.fillText('click to restart', cx, cy + 80);
  }
})(Swangin);
