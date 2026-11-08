// Text chat: Enter opens the input, Enter sends, Esc cancels. Messages show in a log
// (bottom-left) and as speech bubbles above the speaker's rancher.
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export class Chat {
  constructor(root, game) {
    this.game = game;
    this.open = false;
    this.el = h(`
      <div class="chat hidden">
        <div class="chat-log"></div>
        <input class="chat-input hidden" maxlength="120" placeholder="Say something… (Enter to send, Esc to cancel)">
      </div>`);
    root.appendChild(this.el);
    this.log = this.el.querySelector('.chat-log');
    this.input = this.el.querySelector('.chat-input');
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { this.submit(); e.preventDefault(); }
      else if (e.key === 'Escape') { this.close(); e.preventDefault(); }
    });
    this.input.addEventListener('blur', () => { if (this.open) this.close(); });
  }

  show(v) { this.el.classList.toggle('hidden', !v); }

  openInput() {
    this.open = true;
    this.game.input.typing = true;
    this.game.input.keys.clear();
    this.input.classList.remove('hidden');
    this.input.value = '';
    setTimeout(() => this.input.focus(), 0);
  }

  close() {
    this.open = false;
    this.game.input.typing = false;
    this.input.classList.add('hidden');
    this.input.blur();
  }

  submit() {
    const text = this.input.value.trim();
    this.close();
    if (text) this.game.sendChat(text);
  }

  add(name, text, color = '#ffd166', system = false) {
    const line = h(`<div class="chat-line ${system ? 'system' : ''}"></div>`);
    if (system) line.textContent = text;
    else {
      const n = document.createElement('b'); n.textContent = name + ': '; n.style.color = color;
      line.append(n, document.createTextNode(text));
    }
    this.log.appendChild(line);
    while (this.log.children.length > 8) this.log.firstChild.remove();
    setTimeout(() => line.classList.add('old'), 12000);
  }
}
