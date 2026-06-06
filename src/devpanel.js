// Dev panel: a key-toggled debug column on the right edge of the canvas —
// pause, heal, invincibility, per-type enemy spawners, and per-upgrade
// grants. Drawn and hit-tested in raw canvas coordinates; the arena shrinks
// to S.arenaWidth while it's open. Dev state lives here, not on game, so it
// survives resets.
window.Tethered = window.Tethered || {};

(function (S) {
  S.dev = {
    open: false,
    paused: false,     // freezes the physics accumulator; rendering continues
    invincible: false, // damageBall no-ops while set
    hover: -1,         // devItems index under the cursor, -1 = none
  };

  S.devPanelWidth = function () {
    return S.dev.open ? S.TUNING.DEV_PANEL_WIDTH : 0;
  };

  // The arena is the canvas minus the open panel's column.
  S.arenaWidth = function (canvasWidth) {
    return canvasWidth - S.devPanelWidth();
  };

  // Pure layout, local like upgradeCardRects' card sizes.
  const PAD = 10;    // panel inner padding
  const ROW_H = 26;  // button row height
  const ROW_GAP = 3;
  const HEADER_H = 22;

  // A mini fake enemy for the spawn buttons: render.js's enemy pass at glyph
  // scale — type-colored disc (proportionate, so a tank reads bigger than a
  // runner), the type's decoration (tank armor ring), and splitter seams.
  function drawMiniEnemy(ctx, type, x, y) {
    const def = S.ENEMY_TYPES[type];
    const r = def.stats(S.TUNING).r * 0.45;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (def.draw) def.draw(ctx, { x, y, r, hp: 2 }); // hp 2: armor intact
    if (def.splitCount) {
      const seams = def.splitCount / 2;
      ctx.strokeStyle = '#0d0e14';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k < seams; k++) {
        const a = Math.PI / 2 + (k * Math.PI) / seams;
        ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.lineTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
      }
      ctx.stroke();
    }
  }

  // The full item list — section headers and buttons — with rects in raw
  // canvas coordinates, shared by drawing and hit-testing (the same pattern
  // as upgradeCardRects). Rebuilt per use (~20 items) so labels, toggle
  // states, and upgrade levels stay live.
  S.devItems = function (game, canvasWidth) {
    const T = S.TUNING;
    const x = canvasWidth - T.DEV_PANEL_WIDTH + PAD;
    const w = T.DEV_PANEL_WIDTH - PAD * 2;
    const items = [];
    let y = PAD;

    const header = (label) => {
      items.push({ header: true, label, x, y, w, h: HEADER_H });
      y += HEADER_H;
    };
    const button = (b) => {
      items.push({ ...b, x, y, w, h: ROW_H });
      y += ROW_H + ROW_GAP;
    };

    header('CONTROLS');
    button({
      label: S.dev.paused ? 'RESUME' : 'PAUSE',
      on: S.dev.paused,
      action: () => { S.dev.paused = !S.dev.paused; },
    });
    button({
      label: 'HEAL',
      action: () => { game.ball.hp = game.stats.maxHp; },
    });
    button({
      label: 'INVINCIBLE',
      on: S.dev.invincible,
      action: () => { S.dev.invincible = !S.dev.invincible; },
    });

    header('SPAWN');
    for (const type in S.ENEMY_TYPES) {
      button({
        label: type.toUpperCase(),
        icon: (ctx, cx, cy) => drawMiniEnemy(ctx, type, cx, cy),
        action: () => S.spawnEnemy(game, type),
      });
    }

    header('UPGRADES');
    for (const u of S.UPGRADES) {
      const lvl = S.upgradeLevel(game, u);
      const maxed = lvl >= T.UPGRADE_LEVEL_MAX;
      button({
        label: u.name,
        icon: (ctx, cx, cy) => u.icon(ctx, cx, cy, 18),
        levelText: `${lvl}/${T.UPGRADE_LEVEL_MAX}`,
        maxed,
        disabled: maxed,
        action: () => S.grantUpgrade(game, u),
      });
    }
    return items;
  };

  // The clickable button index under a raw canvas point, or -1.
  function buttonIndexAt(game, canvasWidth, cx, cy) {
    if (!S.dev.open) return -1;
    const items = S.devItems(game, canvasWidth);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.header) continue;
      if (cx >= it.x && cx <= it.x + it.w && cy >= it.y && cy <= it.y + it.h) return i;
    }
    return -1;
  }

  S.devHover = function (game, canvasWidth, cx, cy) {
    S.dev.hover = buttonIndexAt(game, canvasWidth, cx, cy);
  };

  // Run the button under a panel click, if any. The caller already routed
  // the click here (it's inside the panel column), so it never reaches the
  // game either way.
  S.devClick = function (game, canvasWidth, cx, cy) {
    const i = buttonIndexAt(game, canvasWidth, cx, cy);
    if (i < 0) return;
    const it = S.devItems(game, canvasWidth)[i];
    if (!it.disabled) it.action();
  };

  S.drawDevPanel = function (ctx, game) {
    if (!S.dev.open) return;
    const T = S.TUNING;
    const canvasWidth = ctx.canvas.width;
    const px = canvasWidth - T.DEV_PANEL_WIDTH;

    // Column backdrop + divider; tiles exactly against the arena fill.
    ctx.fillStyle = '#12131b';
    ctx.fillRect(px, 0, T.DEV_PANEL_WIDTH, ctx.canvas.height);
    ctx.fillStyle = '#2a2d3a';
    ctx.fillRect(px, 0, 1, ctx.canvas.height);

    ctx.font = '10px monospace';
    ctx.textBaseline = 'middle';
    S.devItems(game, canvasWidth).forEach((it, i) => {
      if (it.header) {
        ctx.fillStyle = '#6b6f80';
        ctx.textAlign = 'left';
        ctx.fillText(it.label, it.x, it.y + it.h / 2 + 2);
        return;
      }
      // Button chrome matches the level-up cards' idle/hover treatment;
      // engaged toggles (pause, invincibility) go warm + gold.
      const hover = i === S.dev.hover;
      ctx.fillStyle = it.on ? '#3a2f12' : hover ? '#242838' : '#1c1f2a';
      ctx.fillRect(it.x, it.y, it.w, it.h);
      ctx.strokeStyle = it.on || hover ? '#ffc53d' : '#2a2d3a';
      ctx.lineWidth = 1;
      ctx.strokeRect(it.x + 0.5, it.y + 0.5, it.w - 1, it.h - 1);
      ctx.globalAlpha = it.disabled ? 0.35 : 1;
      if (it.icon) {
        ctx.save(); // icons set their own colors/joins/alpha
        it.icon(ctx, it.x + 15, it.y + it.h / 2);
        ctx.restore();
      }
      ctx.fillStyle = '#e8e8f0';
      ctx.textAlign = 'left';
      ctx.fillText(it.label, it.x + (it.icon ? 30 : 10), it.y + it.h / 2 + 1);
      if (it.levelText) {
        ctx.fillStyle = it.maxed ? '#ffc53d' : '#6b6f80';
        ctx.textAlign = 'right';
        ctx.fillText(it.levelText, it.x + it.w - 6, it.y + it.h / 2 + 1);
      }
      ctx.globalAlpha = 1;
    });
  };
})(Tethered);
