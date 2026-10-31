const { uIOhook, UiohookKey } = require('uiohook-napi');

const TAP_MAX_MS = 300; // Cmd を押してから離すまでの最大時間
const INTERVAL_MAX_MS = 400; // 1回目と2回目のタップの最大間隔

const META_KEYS = new Set([UiohookKey.Meta, UiohookKey.MetaRight]);

// Cmd キー単体の2回押しを検出する。
// 間に他のキーやクリックが入った場合（Cmd+C など）はリセットする。
function startDoubleTapListener(onDoubleTap) {
  let downAt = 0;
  let interrupted = false;
  let lastTapAt = 0;

  uIOhook.on('keydown', (e) => {
    if (META_KEYS.has(e.keycode)) {
      if (downAt) return; // キーリピート
      downAt = Date.now();
      interrupted = false;
    } else {
      interrupted = true;
      lastTapAt = 0;
    }
  });

  uIOhook.on('keyup', (e) => {
    if (!META_KEYS.has(e.keycode)) return;
    const now = Date.now();
    const isTap = !interrupted && downAt && now - downAt <= TAP_MAX_MS;
    downAt = 0;
    if (!isTap) {
      lastTapAt = 0;
      return;
    }
    if (lastTapAt && now - lastTapAt <= INTERVAL_MAX_MS) {
      lastTapAt = 0;
      onDoubleTap();
    } else {
      lastTapAt = now;
    }
  });

  const interrupt = () => {
    interrupted = true;
    lastTapAt = 0;
  };
  uIOhook.on('mousedown', interrupt);
  uIOhook.on('wheel', interrupt);

  uIOhook.start();
  return () => uIOhook.stop();
}

module.exports = { startDoubleTapListener };
