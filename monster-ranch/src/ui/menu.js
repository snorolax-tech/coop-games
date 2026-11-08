// Main menu: name + hat colour, solo play, Host Ranch (shows a room code), Join Ranch (enter code).
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export const RANCHER_COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f3722c'];

export class MainMenu {
  /** handlers: { hasSave, onSolo({fresh, profile}), onHost(profile) => Promise, onJoin(code, profile) => Promise } */
  constructor(root, handlers) {
    this.handlers = handlers;
    const saved = JSON.parse(localStorage.getItem('mr-profile') || '{}');
    this.profile = { name: saved.name || 'Rancher', color: saved.color || RANCHER_COLORS[0] };
    this.el = h(`
      <div class="menu">
        <div class="menu-card">
          <h1 class="logo"><span>Monster</span><span>Ranch</span></h1>
          <p class="tagline">Befriend wild creatures. Raise a ranch. Together.</p>
          <label class="field">Your name<input class="name" maxlength="14" value=""></label>
          <div class="field">Hat colour<div class="swatches"></div></div>
          <div class="menu-main menu-buttons">
            <div class="row">
              <button class="btn primary big" data-a="host">🏠 Host Ranch</button>
              <button class="btn primary big" data-a="join">🔑 Join Ranch</button>
            </div>
            <div class="row">
              <button class="btn" data-a="continue">▶ Continue Solo</button>
              <button class="btn" data-a="new">🌱 New Ranch</button>
            </div>
            <button class="btn" data-a="howto">📖 How to Play</button>
            <p class="hint">Host uses your saved ranch (or starts a new one) and gives you a code for your friend.</p>
          </div>
          <div class="menu-join menu-buttons hidden">
            <label class="field">Room code from your friend<input class="code" maxlength="5" placeholder="ABCDE" autocomplete="off" spellcheck="false"></label>
            <div class="row">
              <button class="btn" data-a="back">← Back</button>
              <button class="btn primary" data-a="connect">Connect</button>
            </div>
          </div>
          <div class="menu-status hidden"></div>
          <div class="version">Version <b class="ver"></b> — you and your friend should see the same number. If not, press Ctrl+F5.</div>
          <div class="controls">
            <b>WASD</b> move · <b>Mouse</b> look · <b>Space</b> jump · <b>Shift</b> sprint · <b>E</b> interact<br>
            <b>Left click</b> use item · <b>Right click</b> aim · <b>1-5 / wheel</b> switch item · <b>Tab</b> inventory · <b>Enter</b> chat · <b>Esc</b> pause
          </div>
        </div>
      </div>`);
    root.appendChild(this.el);
    const $ = (s) => this.el.querySelector(s);
    this.$ = $;
    $('.ver').textContent = handlers.version || 'dev';
    // any click in the menu wakes up the audio (browsers need a click first) and plays a tick
    this.el.addEventListener('click', (e) => { if (e.target.closest('button')) handlers.onClick?.(); });
    this.howto = h(`<div class="howto hidden"><div class="howto-card">
      <h2>📖 How to Play</h2>
      <div class="howto-grid">
        <section><h3>🌱 Getting started</h3><p>Pick a starter partner. Explore <b>Zone 1 · Breezy Meadow</b> through the north gate. Look at creatures to fill your <b>Dex</b> (Tab). Gather berries, wood and stone — sell them at the <b>Shop</b>.</p></section>
        <section><h3>⚔️ Battles</h3><p>Select your <b>Partner (6)</b>, aim at a wild creature and click. Pick moves with the mouse or <b>1-4</b>. Type matchups matter (see the Dex type chart). Your whole party earns XP.</p></section>
        <section><h3>🔵 Befriending</h3><p>Weaken a creature, then press <b>Throw Bond Orb (C)</b> in battle — or sneak up and throw from behind. Calm it with a treat first for a bonus. Rare creatures need <b>both</b> ranchers working together!</p></section>
        <section><h3>🏡 Your ranch</h3><p>Press <b>B</b> on the ranch to build pens, troughs, decorations, fences and more. Send creatures to the ranch at the <b>Barn</b>. Feed (tap E), pet (hold E) and brush them — happy creatures produce resources.</p></section>
        <section><h3>🥚 Breeding & evolution</h3><p>Two happy creatures of the same or a combo type in a <b>Breeding Pen</b> lay an egg — carry it to an <b>Incubator</b>. Creatures evolve by level or happiness.</p></section>
        <section><h3>⭐ Ranch Rating</h3><p>Fill the Dex, befriend creatures, find landmarks, build and complete <b>Notice Board</b> requests to raise your rating. Higher ratings open Zones 2-4 — and calm the four <b>Zone Guardians</b>!</p></section>
        <section><h3>🤝 Playing together</h3><p>One player clicks <b>Host Ranch</b> and shares the 5-letter code; the other clicks <b>Join Ranch</b>. Team battles unlock <b>combo attacks</b>. Aim your partner at your friend for a <b>friendly battle</b>.</p></section>
        <section><h3>🎮 Keys</h3><p><b>WASD</b> move · <b>Space</b> jump · <b>Shift</b> sprint · <b>E</b> interact · <b>1-6</b> items · <b>F</b> walk with partner · <b>Q</b> next partner · <b>B</b> build · <b>M</b> map · <b>Tab</b> inventory · <b>Enter</b> chat · <b>Esc</b> pause</p></section>
      </div>
      <button class="btn primary" data-a="closehow">Got it!</button>
    </div></div>`);
    root.appendChild(this.howto);
    $('[data-a=howto]').onclick = () => this.howto.classList.remove('hidden');
    this.howto.querySelector('[data-a=closehow]').onclick = () => this.howto.classList.add('hidden');
    const name = $('.name');
    name.value = this.profile.name;
    name.addEventListener('input', () => { this.profile.name = name.value.trim() || 'Rancher'; this._persist(); });
    const sw = $('.swatches');
    for (const c of RANCHER_COLORS) {
      const b = h(`<button class="swatch" style="background:${c}"></button>`);
      b.dataset.color = c;
      b.onclick = () => { this.profile.color = c; this._persist(); this._paint(); };
      sw.appendChild(b);
    }
    this._paint();

    $('[data-a=continue]').onclick = () => handlers.onSolo({ fresh: false, profile: this.profile });
    $('[data-a=new]').onclick = () => {
      if (handlers.hasSave() && !confirm('Start a new ranch? Your current save will be replaced.')) return;
      handlers.onSolo({ fresh: true, profile: this.profile });
    };
    $('[data-a=host]').onclick = () => {
      this.status('');
      handlers.onHost(this.profile);
    };
    $('[data-a=join]').onclick = () => { this._mode('join'); setTimeout(() => $('.code').focus(), 0); };
    $('[data-a=back]').onclick = () => { this._mode('main'); this.status(''); };
    const code = $('.code');
    code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-a=connect]').click(); e.stopPropagation(); });
    name.addEventListener('keydown', (e) => e.stopPropagation());
    $('[data-a=connect]').onclick = async () => {
      if (code.value.length < 5) { this.status('Enter the 5-letter room code.', 'bad'); return; }
      const btn = $('[data-a=connect]');
      btn.disabled = true;
      this.status('Connecting to your friend\'s ranch…');
      try {
        await handlers.onJoin(code.value, this.profile);
        this.status('');
        this._mode('main');
      } catch (e) {
        this.status(e.message || 'Could not connect.', 'bad');
      } finally {
        btn.disabled = false;
      }
    };
    this.show(true, handlers.hasSave());
  }

  _mode(m) {
    this.$('.menu-main').classList.toggle('hidden', m !== 'main');
    this.$('.menu-join').classList.toggle('hidden', m !== 'join');
  }

  status(msg, kind = '') {
    const s = this.$('.menu-status');
    s.textContent = msg;
    s.className = `menu-status ${kind} ${msg ? '' : 'hidden'}`;
  }

  _persist() { localStorage.setItem('mr-profile', JSON.stringify(this.profile)); }
  _paint() { this.el.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.color === this.profile.color)); }

  show(v, hasSave) {
    this.el.classList.toggle('hidden', !v);
    if (v) this.$('[data-a=continue]').style.display = hasSave ? '' : 'none';
  }
}
