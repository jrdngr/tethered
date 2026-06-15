// Smoothed-follow camera: the viewport's top-left corner in world
// coordinates. Eases toward keeping the ball centered, clamped to the
// world so the view never shows past the border. The ease runs on scaled
// step time deliberately — a bash slow-mo holds the frame cinematically
// instead of the camera sliding on through it.
window.Tethered = window.Tethered || {};

(function (S) {
  function clampAxis(cam, world, view) {
    // A world narrower than the viewport centers instead of clamping.
    if (world <= view) return (world - view) / 2;
    return Math.max(0, Math.min(cam, world - view));
  }

  function target(game) {
    return {
      x: game.ball.x - game.width / 2,
      y: game.ball.y - game.height / 2,
    };
  }

  S.createCamera = function (game) {
    const t = target(game);
    return {
      x: clampAxis(t.x, game.world.w, game.width),
      y: clampAxis(t.y, game.world.h, game.height),
    };
  };

  // dt = 0 is a pure re-clamp (called on resize, when the viewport changes
  // under a paused game).
  S.updateCamera = function (game, dt) {
    const c = game.camera;
    const t = target(game);
    const k = 1 - Math.exp(-S.TUNING.CAM_LERP * dt);
    c.x = clampAxis(c.x + (t.x - c.x) * k, game.world.w, game.width);
    c.y = clampAxis(c.y + (t.y - c.y) * k, game.world.h, game.height);
  };
})(Tethered);
