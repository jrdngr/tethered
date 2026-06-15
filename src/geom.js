// Shared geometry and particle helpers — the primitives every collidable
// and effect would otherwise re-derive (circle overlap, radial shockwaves,
// segment distance, decaying-velocity particle integration).
window.Tethered = window.Tethered || {};

(function (S) {
  S.geom = {
    // Overlap test between two circles. Returns null when apart; on overlap,
    // the center distance `d`, the unit normal (nx, ny) from circle 1 toward
    // circle 2 (the || 1 guard keeps coincident centers from dividing by
    // zero), and the penetration depth `overlap`.
    circleOverlap(x1, y1, r1, x2, y2, r2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const d = Math.hypot(dx, dy);
      const overlap = r1 + r2 - d;
      if (overlap <= 0) return null;
      return { d, nx: dx / (d || 1), ny: dy / (d || 1), overlap };
    },

    // Radial shockwave: shove everything in `list` within `radius` of (x, y)
    // away, fading linearly with distance. Pass Infinity for a full-strength,
    // arena-wide blast (d/Infinity is 0, so Infinity → full force). vxKey/
    // vyKey name the velocity fields the shove lands on — pickups take it on
    // their velocity, enemies through the decaying knockback (kx/ky).
    radialPush(list, x, y, speed, radius, vxKey = 'vx', vyKey = 'vy') {
      for (const o of list) {
        const dx = o.x - x;
        const dy = o.y - y;
        const d = Math.hypot(dx, dy) || 1;
        if (d >= radius) continue;
        const fade = 1 - d / radius;
        o[vxKey] += (dx / d) * speed * fade;
        o[vyKey] += (dy / d) * speed * fade;
      }
    },

    // Closest point on the segment (x1,y1)-(x2,y2) to (cx,cy).
    segClosest(x1, y1, x2, y2, cx, cy) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((cx - x1) * dx + (cy - y1) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      return { x: x1 + t * dx, y: y1 + t * dy };
    },
  };

  // Random scatter velocity for burst spawns: a uniform angle at
  // maxSpeed × (minFrac..1). Shared by health-pickup and death-particle bursts.
  S.randomVelocity = function (maxSpeed, minFrac) {
    const angle = Math.random() * Math.PI * 2;
    const speed = maxSpeed * (minFrac + (1 - minFrac) * Math.random());
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  };

  // Advance a list of short-lived particles in place: age them (splicing out
  // the expired), apply exponential drag — the standard exp(-rate·dt) idiom,
  // framerate-independent — and integrate position.
  S.advanceParticles = function (list, dt, dragRate) {
    const decay = Math.exp(-dragRate * dt);
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) {
        list.splice(i, 1);
        continue;
      }
      p.vx *= decay;
      p.vy *= decay;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  };
})(Tethered);
