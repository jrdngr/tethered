// Arena rooms: every room is a sealed combat arena. Entering a room that
// still holds enemies drops energy gates across its corridor mouths; clearing
// the last enemy in the room raises them for good. The exit room holds no
// enemies, so it never seals — reach it and leave.
//
// Gates are duck-typed obstacle shapes (a capsule `part`, no wrap pegs), so
// the same circle-vs-part collision the freestanding pillars use applies to
// the ball (ball.js) and to enemies (enemies.js wall pass). Only the gates of
// the room the player is currently locked in are live (game.gates).
window.Tethered = window.Tethered || {};

(function (S) {
  // A gate across one corridor mouth of `room`, facing `neighbor`. The
  // corridor leaves the room heading straight at the neighbor's center (the
  // carve converges at both mouths), so a capsule perpendicular to that
  // direction, sitting just outside the room disc, plugs the neck — its ends
  // reach into the walls flanking the corridor.
  function addMouthGate(room, neighbor) {
    const T = S.TUNING;
    if (room.isExit) return; // the exit room never seals
    const dx = neighbor.cx - room.cx;
    const dy = neighbor.cy - room.cy;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const mx = room.cx + ux * (room.r + T.GATE_DIST); // mouth point in the neck
    const my = room.cy + uy * (room.r + T.GATE_DIST);
    const px = -uy; // tangential — the gate spans across the corridor
    const py = ux;
    const hl = T.GATE_HALF_LEN;
    room.gates.push({
      parts: [{
        type: 'capsule',
        x1: mx - px * hl, y1: my - py * hl,
        x2: mx + px * hl, y2: my + py * hl,
        r: T.GATE_THICKNESS,
      }],
      pegs: [], // never wrappable — a temporary barrier, not a slingshot pivot
    });
  }

  // Build per-room arena state for the freshly generated map. Called from
  // setupMap after the enemies are placed (they carry their room index).
  S.buildRooms = function (game) {
    const T = S.TUNING;
    const ts = T.TILE_SIZE;
    const rooms = game.map.chambers.map((ch, idx) => ({
      idx,
      ch,
      cx: ch.cx * ts,
      cy: ch.cy * ts,
      r: ch.r * ts,
      isExit: ch.reserved === 'exit',
      cleared: false,
      locked: false,
      alive: 0,
      gates: [],
    }));
    // Each corridor seals both the rooms it joins, at the mouth facing the
    // other end.
    for (const e of (game.map.corridorEdges || [])) {
      addMouthGate(rooms[e.i], rooms[e.j]);
      addMouthGate(rooms[e.j], rooms[e.i]);
    }
    game.rooms = rooms;
    game.gates = [];
    game.currentRoom = -1;

    // Seed the live counts, then lock the start room straight away: the player
    // spawns inside it and must clear it before any corridor opens.
    countAlive(game);
    const start = rooms.find((rm) => rm.ch.reserved === 'spawn');
    if (start) enterRoom(game, start.idx);
  };

  function countAlive(game) {
    for (const rm of game.rooms) rm.alive = 0;
    for (const e of game.enemies) {
      const rm = game.rooms[e.room];
      if (rm) rm.alive++;
    }
  }

  // The room whose disc the point sits in (nearest center within the lock
  // radius), or null when the point is out in a corridor.
  function roomAt(game, x, y) {
    const T = S.TUNING;
    let best = null;
    let bestD = Infinity;
    for (const rm of game.rooms) {
      const d = Math.hypot(x - rm.cx, y - rm.cy);
      if (d < rm.r * T.ROOM_FOOT_MULT && d < bestD) { bestD = d; best = rm; }
    }
    return best;
  }

  // Become "in" room idx. If it still holds enemies, seal it (its gates go
  // live); otherwise (cleared, empty, or the exit room) the corridors stay open.
  function enterRoom(game, idx) {
    const rm = game.rooms[idx];
    game.currentRoom = idx;
    if (!rm.cleared && !rm.isExit && rm.alive > 0) {
      if (!rm.locked) S.audio.play('bounce'); // the gates slam shut
      rm.locked = true;
      game.gates = rm.gates;
    } else {
      game.gates = [];
    }
  }

  // Run every step (after the enemies update, so this step's kills count).
  // Clears the locked room when its garrison is gone, otherwise tracks which
  // room the ball is in and seals a freshly entered one.
  S.updateArena = function (game) {
    if (!game.rooms) return;
    countAlive(game);
    const cur = game.currentRoom >= 0 ? game.rooms[game.currentRoom] : null;

    if (cur && cur.locked) {
      if (cur.alive === 0) { // room cleared — open it for good
        cur.locked = false;
        cur.cleared = true;
        game.gates = [];
        S.audio.play('smash');
      }
      return; // stay sealed in until cleared — no re-evaluation while locked
    }

    const rm = roomAt(game, game.ball.x, game.ball.y);
    if (rm) enterRoom(game, rm.idx);
    else { game.currentRoom = -1; game.gates = []; }
  };

  // Ball vs the live gates — same position-correct-and-reflect as the pillars
  // (ELASTICITY restitution applies), so a closed gate is a slingshot wall.
  // No combo credit: bouncing a temporary barrier shouldn't farm the streak.
  S.collideBallGates = function (game) {
    const gates = game.gates;
    if (!gates || !gates.length) return false;
    const b = game.ball;
    let bounced = false;
    for (const g of gates) {
      const hit = S.obstacleHit(g, b.x, b.y, b.r);
      if (!hit) continue;
      b.x += hit.nx * hit.overlap;
      b.y += hit.ny * hit.overlap;
      const into = b.vx * hit.nx + b.vy * hit.ny;
      if (into < 0) {
        const rest = game.stats.wallRestitution;
        b.vx -= (1 + rest) * into * hit.nx;
        b.vy -= (1 + rest) * into * hit.ny;
        bounced = true;
      }
    }
    return bounced;
  };
})(Tethered);
