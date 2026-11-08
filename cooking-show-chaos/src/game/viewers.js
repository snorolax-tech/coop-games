// Hype "moments", what makes it onto the tape, and the simulated viewers + chat for the posted video.

const USERS = [
  'xX_SoupLord_Xx', 'gordonfan42', 'spatula_queen', 'breadbro', 'chef_diff', 'mom', 'lurker99', 'sauce_boss', 'NotAChicken',
  'kitchen_goblin', 'fryguy', 'whiskers_ok', 'TomatoTim', 'big_lettuce', 'onion_ring_enjoyer', 'raw_patty_rick', 'grillmaster9000',
  'pan_handler', 'saltbae_jr', 'mr_fridge', 'cucumber_cool', 'soup_snake', 'ladle_lad', 'crispy_karen', 'burnt_toast_fan',
  'yeetchef', 'ramsay_but_nice', 'cheesy_pete', 'Mixer_Hater', 'firedept_official', 'peeled_carrot', 'bun_appetit',
];
const COLORS = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#b388eb', '#ff9f1c', '#f15bb5', '#90be6d', '#a0c4ff'];

const LINES = {
  idle: ['first', 'hi chat', 'what are we cooking today', 'is this live?', 'chef vibes', 'love this show', 'hello from brazil',
    'the kitchen looks so clean (for now)', 'mods?', 'whats the recipe', 'cook something!!', 'W stream', 'lets goooo', 'chat is this real',
    'who is the better chef', 'i came here for the chaos', 'my dog is watching too', 'can u say hi to me', '🍳🍳🍳', 'pog'],
  boring: ['boring...', 'zzz', 'show us something!!', 'camera guy wake up', 'point the camera at the action', 'nothing is happening lol',
    'is the stream frozen?', 'i paid for chaos', 'switching to the other channel', 'do a flip', 'set something on fire pls'],
  offcam: ['what happened?? we couldnt see', 'CAMERA GUY WHERE WERE YOU', 'bro missed it', 'turn the camera!!!', 'we heard that but saw nothing',
    'cameraman fired', 'i heard a crash??', 'off camera again 😭'],
  fire: ['LMAO the kitchen is on fire', '🔥🔥🔥', 'call the fire department', 'IS THAT SAFE', 'this is fine 🔥🐶', 'chef diff',
    'thats a lot of fire', 'the smoke alarm is crying', 'hes cooking the stove itself', 'FIRE FIRE FIRE'],
  extinguish: ['HERO', 'saved the kitchen', 'foam party!!', 'firefighter arc', 'W extinguisher', 'clutch'],
  serve_good: ['W chef', 'thats actually beautiful', 'michelin star incoming', 'chef kiss 🤌', 'GG', 'perfect plate!!', 'i want that', 'its giving restaurant',
    'clean', 'ok that looked good'],
  yeet: ['DID HE JUST THROW IT', 'YEET SERVE 😂', 'NBA CHEF', 'hes in the wrong sport', 'NOTHING BUT NET', 'the judges ducked lmao'],
  serve_burnt: ['LMAO BURNT', 'the judges are crying', 'thats charcoal', 'well done... TOO well done', 'gordon would cry', 'they served a fossil', 'call poison control 😭'],
  serve_wrong: ['what is that', 'thats not on the menu lol', 'chef ???', 'the judges look confused', 'creative 💀', 'i would not eat that', 'fusion cuisine'],
  serve_empty: ['an EMPTY plate 💀', 'the audacity', 'invisible food', 'conceptual art', 'minimalism'],
  chop: ['knife skills', 'chop chop', 'ASMR', 'careful with those fingers'],
  quake: ['EARTHQUAKE??', 'everything is falling LMAO', 'the plates!!!', 'shaky cam is real', 'is that in the script?', '🌋🌋'],
  flood: ['the sink is possessed', 'SLIP N SLIDE', 'swimming pool kitchen', 'who left the tap on', 'call a plumber', 'wet floor sign where'],
  slip: ['HE SLIPPED 😂', 'ice skating chef', 'BONK', 'he went sliding', 'triple axel!!', 'LMAOOO the slide'],
  mixer: ['THE MIXER IS ALIVE', 'run!!!', 'mixer uprising', 'terminator mixer', 'its bouncing 😭', 'somebody unplug it'],
  mixer_tamed: ['mixer defeated', 'W unplug', 'beast tamed'],
  lights: ['who turned off the lights', 'i cant see anything lmao', 'horror stream now?', 'spooky kitchen', 'flashlight pls'],
  chicken: ['A CHICKEN????', 'chicken stealing food 😂', 'catch it!!', 'the chicken is the real chef', 'free that chicken', '🐔🐔🐔', 'chicken diff'],
  chicken_caught: ['CAUGHT IT', 'chicken wrangler', 'W catch', 'poor chicken lol'],
  bonk: ['BONK', 'right in the head 😂', 'friendly fire', 'teamwork makes the dream work', 'he threw it at him LMAO', 'headshot'],
  ragdoll: ['RAGDOLL 😂', 'he folded like a lawn chair', 'NOODLE MODE', 'bro is boneless', 'the physics engine said no', 'GET UP CHEF',
    'spaghetti legs', 'thats going in the blooper reel', 'LMAOOO the flop', '10/10 dismount'],
  onfire: ['HES ON FIRE 🔥🔥', 'STOP DROP AND ROLL', 'somebody foam him!!', 'hes literally cooking himself', 'the chef is the dish now',
    'well done chef 💀', 'AAAAAAA', 'run to the water!!'],
  wipeout: ['RIP 💀', 'F in the chat', 'WIPED', 'hes a ghost now 👻', 'respawn speedrun', 'press F', 'thats a wrap for him lol', 'he did not survive the kitchen'],
  saved: ['TEAMWORK 🤝', 'W partner', 'foam hero', 'saved by the foam', 'real ones put you out', 'clutch save'],
  foamed: ['FOAMED 😂', 'face full of foam', 'that was on purpose', 'betrayal', 'hes a snowman now'],
  spill: ['SPILLED IT', 'clean up on aisle 3', 'it was so close', 'NOOO the food'],
  trash3: ['3 POINTER', 'kobe!', 'trash shot of the year', 'NOTHING BUT NET'],
  expired: ['the customer left lol', 'too slow chef', 'they got hungry', 'order cancelled 💀'],
  camera: ['W cameraman', 'great shot', 'cinematography 10/10', 'camera work goated', 'oscar worthy'],
  hype: ['this is the best episode yet', 'CHAT IS GOING CRAZY', 'clip it!!', 'CLIP THAT', 'sending this to my friends', 'subbed', 'legendary'],
  end: ['GG', 'best episode', 'same time next week?', 'W show', 'ending already??', 'that was chaos', 'more pls'],
};

const pick = (a) => a[(Math.random() * a.length) | 0];

// ---------------------------------------------------------------------------------------------
// During the episode (host): decides whether a moment made it onto the TAPE.
// Nothing is live — moments are logged into the recording and turned into views when you post it.
// ---------------------------------------------------------------------------------------------
export class ViewerSystem {
  constructor(game) { this.game = game; this.hintT = {}; }
  hint(key, text) {
    const g = this.game;
    if ((this.hintT[key] || -99) > g.time - 10) return;
    this.hintT[key] = g.time;
    g.fx('toast', { text, kind: 'bad' });
  }
  // value = base hype, pos = THREE.Vector3 or null (global — counts if the camera is rolling at all)
  moment(kind, pos, value, label) {
    const g = this.game, st = g.state;
    const cam = g.cameraInfo();
    if (!cam) return 0;
    const seen = pos ? g.isOnCamera(pos) : true;
    if (!seen) { if (value >= 30 && st.rec) this.hint('offcam', '🙈 Off camera! That one won\'t be in the video'); return 0; }
    if (!st.rec) { if (value >= 30) this.hint('norec', '😱 That was in frame but you\'re NOT recording! (hold camera + R)'); return 0; }
    g.fx('captured', { k: kind, v: Math.round(value * cam.mult), l: label });
    g.fx('moment', { label, gain: 0 });
    st.clips = (st.clips || 0) + 1;
    return 1;
  }
}

// ---------------------------------------------------------------------------------------------
// After the episode: "post" the tape. Walks the recorded frames and produces a timeline of
// viewer counts + chat reactions synced to what the camera captured.
// ---------------------------------------------------------------------------------------------
export function simulateViews(frames, start = 40) {
  const out = { samples: [], chat: [], moments: [], peak: start, best: null, end: 0 };
  if (!frames.length) return out;
  let viewers = start, peak = start, boredT = 0, chatT = 0.6, queue = [];
  const recent = {};
  const react = (kind, n) => {
    const lines = LINES[kind] || LINES.idle;
    for (let i = 0; i < n; i++) queue.push({ m: pick(lines), h: kind !== 'idle' && kind !== 'boring' ? 1 : 0 });
    if (queue.length > 14) queue.splice(0, queue.length - 14);
  };
  react('idle', 2);
  let prevT = frames[0].rt, sampleT = -1;
  for (const f of frames) {
    const t = f.rt;
    let dt = t - prevT; prevT = t;
    if (dt < 0 || dt > 0.3) dt = 0.05; // jump cut between recording takes
    for (const [n, d] of f.fx || []) {
      if (n !== 'captured') continue;
      // diminishing returns: the same kind of moment over and over gets old fast
      const times = (recent[d.k] || []).filter((x) => t - x < 25);
      const dim = Math.pow(0.5, times.length);
      times.push(t); recent[d.k] = times;
      let gain = d.v * (1 + Math.min(viewers, 4000) / 450) * (0.85 + Math.random() * 0.3) * dim;
      gain = Math.round(Math.min(gain, 500 + viewers * 0.3));
      if (gain < 2) continue;
      viewers += gain;
      out.moments.push([t, d.l, gain]);
      if (!out.best || gain > out.best.gain) out.best = { label: d.l, gain };
      react(d.k, 2 + Math.min(4, (gain / 60) | 0));
      if (gain > 150) react('hype', 1);
      if (Math.random() < 0.25) react('camera', 1);
      boredT = 0;
    }
    const interest = f.st?.int || 0;
    if (interest > 0.25) {
      viewers += interest * 1.4 * dt * (1 + Math.min(viewers, 4000) / 700);
      boredT = Math.max(0, boredT - dt);
    } else {
      viewers -= viewers * 0.03 * dt;
      boredT += dt;
      if (boredT > 8) { boredT = 0; react('boring', 2); }
    }
    viewers = Math.max(12, viewers);
    if (viewers > peak) peak = viewers;
    chatT -= dt;
    if (chatT <= 0) {
      const item = queue.length ? queue.shift() : { m: pick(LINES.idle), h: 0 };
      out.chat.push([+t.toFixed(2), pick(USERS), pick(COLORS), item.m, item.h]);
      chatT = (queue.length ? 0.35 : Math.max(0.5, 3 - viewers / 250)) * (0.6 + Math.random() * 0.8);
    }
    if (t - sampleT >= 0.2) { out.samples.push([+t.toFixed(2), Math.round(viewers)]); sampleT = t; }
  }
  for (let i = 0; i < 4; i++) out.chat.push([+(prevT + 0.3 + i * 0.4).toFixed(2), pick(USERS), pick(COLORS), pick(LINES.end), 1]);
  out.peak = Math.round(peak); out.end = prevT;
  return out;
}
