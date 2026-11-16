// The dummy's brain. When the page runs inside claude.ai and the viewer allows it, Claude decides
// what the dummy does and says, using the `sample` capability. Calls happen only in response to
// something the player did (a hit, a grab, a throw, walking up, talking to it), at most one at a
// time and with a cooldown, so it never runs on a timer. Without it the scripted personality runs.
import { ACTIONS } from './dummy.js';

const MOODS = ['cheerful', 'cocky', 'scared', 'annoyed', 'smug'];

export class DummyBrain {
  constructor(dummy, getState) {
    this.d = dummy; this.getState = getState;
    this.sample = null; this.enabled = false; this.busy = false; this.last = 0;
    this.events = []; this.said = []; this.status = 'off'; // off | ready | thinking | declined | unavailable
    this.onStatus = null;
    dummy.onEvent = (text) => this.event(text);
  }

  async init() {
    try { this.sample = window.claude && window.claude.use ? await window.claude.use('sample') : null; } catch (e) { this.sample = null; }
    this._set(this.sample ? 'off' : 'unavailable');
    return !!this.sample;
  }

  // Turn on from a click (the first call asks the viewer for permission).
  enable(on) {
    if (!this.sample) { this._set('unavailable'); return false; }
    this.enabled = on; this.d.brainOn = on;
    this._set(on ? 'ready' : 'off');
    if (on) this.ask(null, 'The player just started the game and is looking at you.');
    return true;
  }

  event(text) {
    this.events.push({ t: performance.now(), text });
    if (this.events.length > 8) this.events.shift();
    if (this.enabled && performance.now() - this.last > 6000) this.ask(null);
  }

  talk(line) {
    this.events.push({ t: performance.now(), text: `The player said to you: "${line}"` });
    if (this.events.length > 8) this.events.shift();
    if (this.enabled) this.ask(line);
  }

  _set(s) { this.status = s; this.onStatus?.(s); }

  async ask(playerLine, extra) {
    if (!this.enabled || this.busy) return;
    this.busy = true; this.last = performance.now();
    this._set('thinking');
    const st = this.getState();
    const now = performance.now();
    const events = this.events.map((e) => `- ${Math.round((now - e.t) / 1000)}s ago: ${e.text}`).join('\n') || '- nothing yet';
    const prompt = `You are the brain of "Unit 07", a yellow crash-test dummy in a destructible-town sandbox game. The player controls a flying superhero robot called ${st.robot} with charged punches, laser eyes and the ability to grab you and throw you through buildings. You can't really be hurt and you secretly love your job, but you are dramatic, sarcastic and funny. Keep it PG: no swearing.

Decide what you do next.

Game state: ${JSON.stringify(st)}
Recent events (oldest first):
${events}${extra ? `\nAlso: ${extra}` : ''}
Lines you said recently (never repeat them): ${JSON.stringify(this.said.slice(-6))}
${playerLine ? `The player just said to you: "${playerLine.slice(0, 200)}". Answer them directly.` : ''}

Actions you can take: idle, wave, taunt (fists up, bouncing), cower (hide behind your arms), flee (run away from the player), approach (walk up to the player), dance, point (point at the player), shrug, punch (run up and punch them), combo (three-punch combo ending in an uppercut), throw (hurl a big chunk of exploding rubble), volley (three chunks in quick succession), charge (full-speed shoulder tackle), slam (leap onto them and ground-pound with a shockwave), car (pick up the nearest parked car and throw it at them).\nYou are a worthy opponent and fight hard (only if youCanFightBack is true): pick attacks that suit the distance, mix in taunts and trash talk, but stay PG and playful.

Reply with JSON only, no other text:
{"action": "<one action>", "say": "<one short line, at most 10 words, or empty>", "mood": "<cheerful|cocky|scared|annoyed|smug>", "seconds": <1 to 6>}`;
    try {
      const r = await this.sample.json(prompt, { modelTier: 'quick', cache: false });
      if (r && typeof r === 'object') {
        const action = ACTIONS.includes(r.action) ? r.action : 'idle';
        const mood = MOODS.includes(r.mood) ? r.mood : 'cheerful';
        const say = typeof r.say === 'string' ? r.say.trim().slice(0, 90) : '';
        if (this.d.mode === 'stand') this.d.command(action, Number(r.seconds) || 3);
        this.d.brainMood = mood;
        if (say) { this.d.say(say, true); this.said.push(say); if (this.said.length > 12) this.said.shift(); }
      }
      this._set('ready');
    } catch (e) {
      const code = e && e.code;
      if (code === 'not_granted') { this.enabled = false; this.d.brainOn = false; this._set('declined'); }
      else if (code === 'rate_limited') { this.last = performance.now() + 20000; this._set('ready'); }
      else this._set('ready');
    }
    this.busy = false;
  }
}
