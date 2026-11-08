import './style.css';
import { Game, BUILD_ID } from './game/game.js';
import { MainMenu } from './ui/menu.js';
import { hasSave } from './save/save.js';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');

// let the loading screen paint before the (synchronous) world build starts
requestAnimationFrame(() => setTimeout(() => {
  const game = new Game(canvas, ui);
  const menu = new MainMenu(ui, {
    hasSave,
    version: BUILD_ID,
    onSolo: (opts) => { menu.show(false); game.start(opts); },
    onHost: (profile) => { menu.show(false); game.startHost(profile).catch(() => {}); },
    onJoin: async (code, profile) => {
      await game.joinRanch(code, profile);
      menu.show(false);
    },
    onClick: () => { game.audio.unlock(); game.audio.play('ui'); },
  });
  game.onStateChange = (s, reason) => {
    if (s !== 'menu') return;
    menu.show(true, hasSave());
    if (reason) menu.status(reason, 'bad');
  };
  const loading = document.getElementById('loading');
  loading.style.transition = 'opacity .5s';
  loading.style.opacity = 0;
  setTimeout(() => loading.remove(), 600);

  // handy for testing from the browser console
  window.game = game;
}, 30));
