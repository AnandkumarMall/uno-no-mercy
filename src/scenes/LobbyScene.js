// src/scenes/LobbyScene.js
// Room creation / joining UI — built with a pure HTML overlay over the canvas.

import Phaser from 'phaser';
import { net } from '../network.js';

const PLAYER_COLORS = ['#FF7043','#448AFF','#66BB6A','#FFCA28','#69F0AE','#37474F'];

export default class LobbyScene extends Phaser.Scene {
  constructor() { super('Lobby'); }

  create() {
    this.players = {};
    this.rulesConfig = this.getDefaultRulesConfig();
    this._buildBackground();
    this._buildLobbyDOM();
    this._wireNetwork();
  }

  shutdown() {
    // Remove all lobby DOM on scene shutdown
    document.getElementById('lobby-root')?.remove();
  }

  getDefaultRulesConfig() {
    return {
      official: {
        challengeWildDrawFour: true,
        mustCallUno: true,
        reshuffleDiscard: true,
        reverseIsSkipWithTwo: true,
        drawTwoOnFirstTurn: true
      },
      variants: {
        stacking: { enabled: true, allowDraw2OnDraw2: true, allowWild4OnWild4: true, allowMixed: false },
        jumpIn: { enabled: true, requireExactMatch: true },
        sevenZero: { enabled: true, sevenSwapsHand: true, zeroRotatesHands: true, preserveCardOrder: true },
        unoChallengeWindow: { type: 'nextPlayerAction' },
        drawUntilPlayable: { enabled: true, maxReshuffles: 3 },
        progressiveStacking: { enabled: false, increment: 2 },
        maxCardsElimination: { enabled: false, maxCards: 25 }
      }
    };
  }

  // ── Phaser canvas background ─────────────────────────────

  _buildBackground() {
    const W = this.scale.width, H = this.scale.height;
    const gfx = this.add.graphics();
    // Voxel background (light blue)
    gfx.fillGradientStyle(0xE8F0FE, 0xE8F0FE, 0xD1E4FF, 0xD1E4FF, 1);
    gfx.fillRect(0, 0, W, H);

    // Decorative floating isometric tiles (squares)
    const positions = [
      [0.1, 0.2, 80], [0.9, 0.1, 60], [0.05, 0.8, 100],
      [0.95, 0.75, 70], [0.5, 0.95, 90],
    ];
    for (const [rx, ry, r] of positions) {
      gfx.fillStyle(0xFF7043, 0.15); // Lava Orange faint
      this.add.rectangle(W * rx, H * ry, r, r, 0xFF7043, 0.1);
    }

    // UNO title on canvas
    this.add.text(W / 2, 80, 'UNO', {
      fontFamily: 'Nunito', fontSize: '90px', fontStyle: '900',
      color: '#FF7043', stroke: '#5D4037', strokeThickness: 8,
    }).setOrigin(0.5);

    this.add.text(W / 2, 155, 'P2P • Gamified • Voxel', {
      fontFamily: 'Nunito Sans', fontSize: '18px', fontStyle: '800', color: '#8D6E63',
      letterSpacing: 2,
    }).setOrigin(0.5);
  }

  // ── Pure HTML overlay ────────────────────────────────────

  _buildLobbyDOM() {
    const root = document.createElement('div');
    root.id = 'lobby-root';
    root.style.cssText = `
      position:fixed; inset:0; display:flex; flex-direction:column;
      align-items:center; justify-content:center; pointer-events:none;
      z-index:50; padding-top:160px;
    `;

    root.innerHTML = `
      <div id="lobby-card" style="
        pointer-events:all; width:440px; max-width:96vw; max-height: 85vh; overflow-y: auto;
        background:#ffffff; 
        border:2px solid #5D4037; border-radius:16px;
        padding:28px 28px 24px; box-shadow:0 12px 0px rgba(93, 64, 55, 0.15);
        color:#5D4037;
      ">
        <label style="display:block;font-family:Nunito;font-size:13px;color:#8D6E63;font-weight:900;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Your Name</label>
        <input id="inp-name" type="text" placeholder="Enter your name…" maxlength="20" style="
          width:100%;height:48px;background:#E8F0FE;border:2px solid rgba(93,64,55,0.2);
          border-radius:10px;color:#5D4037;font-family:Nunito,sans-serif;font-size:16px;
          font-weight:800;padding:0 14px;outline:none;box-sizing:border-box;margin-bottom:16px;
          transition:border-color 0.2s, box-shadow 0.2s;
        " />

        <label style="display:block;font-family:Nunito;font-size:13px;color:#8D6E63;font-weight:900;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Room Code</label>
        <input id="inp-room" type="text" placeholder="6-letter code…" maxlength="6" style="
          width:100%;height:48px;background:#E8F0FE;border:2px solid rgba(93,64,55,0.2);
          border-radius:10px;color:#5D4037;font-family:Nunito,sans-serif;font-size:18px;
          font-weight:900;padding:0 14px;outline:none;box-sizing:border-box;margin-bottom:20px;
          letter-spacing:4px; text-transform:uppercase; transition:border-color 0.2s, box-shadow 0.2s;
        " />

        <!-- Game Mode Presets -->
        <div style="margin-bottom: 15px; display: flex; gap: 8px; justify-content: space-between;">
          <button id="btn-mode-classic" class="mode-btn" style="flex:1; padding: 10px; border-radius: 8px; background: #E8F0FE; color: #5D4037; border: 2px solid #448AFF; cursor: pointer; font-family: Nunito; font-weight:800; box-shadow:0 4px 0px rgba(0,0,0,0.1);">Classic UNO</button>
          <button id="btn-mode-mercy" class="mode-btn" style="flex:1; padding: 10px; border-radius: 8px; background: #E8F0FE; color: #5D4037; border: 2px solid transparent; cursor: pointer; font-family: Nunito; font-weight:800; box-shadow:0 4px 0px rgba(0,0,0,0.1);">No Mercy</button>
        </div>

        <!-- Rules Section -->
        <div id="rules-section" style="margin: 20px 0; padding: 15px; background: #E8F0FE; border: 2px solid rgba(93,64,55,0.1); border-radius: 12px; max-height: 250px; overflow-y: auto;">
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px;">
            <!-- Official Rules -->
            <div>
              <div style="font-weight: bold; margin-bottom: 10px;">Official Rules</div>
              <label style="display: block; margin: 5px 0;">
                <input type="checkbox" data-rule="official.challengeWildDrawFour" checked>
                Allow Wild Draw Four Challenge
              </label>
              <label style="display: block; margin: 5px 0;">
                <input type="checkbox" data-rule="official.mustCallUno" checked>
                Must Call UNO
              </label>
              <label style="display: block; margin: 5px 0;">
                <input type="checkbox" data-rule="official.reshuffleDiscard" checked>
                Reshuffle Discard when Draw pile empty
              </label>
              <label style="display: block; margin: 5px 0;">
                <input type="checkbox" data-rule="official.reverseIsSkipWithTwo" checked>
                Reverse is Skip with 2 Players
              </label>
              <label style="display: block; margin: 5px 0;">
                <input type="checkbox" data-rule="official.drawTwoOnFirstTurn" checked>
                Draw Two on First Turn
              </label>
            </div>
            <!-- Variants -->
            <div>
              <div style="font-weight: bold; margin-bottom: 10px;">Variant Rules</div>
              <label style="display: block; margin: 5px 0;">
                <input type="checkbox" data-rule="variants.stacking.enabled" checked>
                Stacking
              </label>
              <div id="stacking-options" style="margin-left: 20px; font-size: 0.9em; opacity: 0.8;">
                <label style="display: block; margin: 2px 0;">
                  <input type="checkbox" data-rule="variants.stacking.allowDraw2OnDraw2" checked>
                  Allow Draw 2 on Draw 2
                </label>
                <label style="display: block; margin: 2px 0;">
                  <input type="checkbox" data-rule="variants.stacking.allowWild4OnWild4" checked>
                  Allow Wild Draw 4 on Wild Draw 4
                </label>
                <label style="display: block; margin: 2px 0;">
                  <input type="checkbox" data-rule="variants.stacking.allowMixed">
                  Allow Mixed Stacking (Draw 2 & Wild Draw 4)
                </label>
              </div>
              <label style="display: block; margin: 5px 0;">
                <input type="checkbox" data-rule="variants.jumpIn.enabled" checked>
                Jump-In
              </label>
              <div id="jumpin-options" style="margin-left: 20px; font-size: 0.9em; opacity: 0.8;">
                <label style="display: block; margin: 2px 0;">
                  <input type="checkbox" data-rule="variants.jumpIn.requireExactMatch" checked>
                  Require Exact Match (same color and value)
                </label>
              </div>
              <label style="display: block; margin: 5px 0;">
                <input type="checkbox" data-rule="variants.sevenZero.enabled" checked>
                7-0 Rule
              </label>
              <div id="sevenzero-options" style="margin-left: 20px; font-size: 0.9em; opacity: 0.8;">
                <label style="display: block; margin: 2px 0;">
                  <input type="checkbox" data-rule="variants.sevenZero.sevenSwapsHand" checked>
                  7 Swaps Hands
                </label>
                <label style="display: block; margin: 2px 0;">
                  <input type="checkbox" data-rule="variants.sevenZero.zeroRotatesHands" checked>
                  0 Rotates Hands
                </label>
                <label style="display: block; margin: 2px 0;">
                  <input type="checkbox" data-rule="variants.sevenZero.preserveCardOrder" checked>
                  Preserve Card Order when Rotating
                </label>
              </div>
              <label style="display: block; margin: 5px 0;">
                <input type="checkbox" data-rule="variants.unoChallengeWindow.enabled" checked>
                UNO Challenge Window
              </label>
              <div id="unowindow-options" style="margin-left: 20px; font-size: 0.9em; opacity: 0.8;">
                <label style="display: block; margin: 2px 0;">
                  <span>Type:</span>
                  <select data-rule="variants.unoChallengeWindow.type">
                    <option value="nextPlayerAction">Until Next Player Acts</option>
                    <option value="timed">Timed (5 seconds)</option>
                  </select>
                </label>
              </div>
              <label style="display: block; margin: 5px 0;">
                <input type="checkbox" data-rule="variants.drawUntilPlayable.enabled" checked>
                Draw Until Playable
              </label>
              <div id="drawuntil-options" style="margin-left: 20px; font-size: 0.9em; opacity: 0.8;">
                <label style="display: block; margin: 2px 0;">
                  Max Reshuffles: <input type="number" data-rule="variants.drawUntilPlayable.maxReshuffles" value="3" min="1" max="10" style="width: 50px;">
                </label>
              </div>
              <label style="display: block; margin: 5px 0;">
                <input type="checkbox" data-rule="variants.progressiveStacking.enabled">
                Progressive Stacking
              </label>
              <div id="progressive-options" style="margin-left: 20px; font-size: 0.9em; opacity: 0.8;">
                <label style="display: block; margin: 2px 0;">
                  Increment: <input type="number" data-rule="variants.progressiveStacking.increment" value="2" min="1" max="10" style="width: 50px;">
                </label>
              </div>
              <label style="display: block; margin: 5px 0;">
                <input type="checkbox" data-rule="variants.maxCardsElimination.enabled">
                Max Cards Elimination
              </label>
              <div id="maxcards-options" style="margin-left: 20px; font-size: 0.9em; opacity: 0.8;">
                <label style="display: block; margin: 2px 0;">
                  Max Cards: <input type="number" data-rule="variants.maxCardsElimination.maxCards" value="25" min="5" max="50" style="width: 50px;">
                </label>
              </div>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;margin-top:16px;">
          <button id="btn-create" style="
            height:54px;background:#FF7043;
            border:2px solid rgba(0,0,0,0.1);border-radius:12px;color:#fff;font-family:Nunito,sans-serif;
            font-size:15px;font-weight:900;cursor:pointer;
            box-shadow:0 6px 0px rgba(0,0,0,0.15); transition:transform 0.1s,box-shadow 0.1s;
          ">🎲 Create Room</button>
          <button id="btn-join" style="
            height:54px;background:#448AFF;
            border:2px solid rgba(0,0,0,0.1);border-radius:12px;color:#fff;font-family:Nunito,sans-serif;
            font-size:15px;font-weight:900;cursor:pointer;
            box-shadow:0 6px 0px rgba(0,0,0,0.15); transition:transform 0.1s,box-shadow 0.1s;
          ">🚪 Join Room</button>
        </div>

        <button id="btn-voice" style="
          display:none; width:100%; height:48px;
          background:#69F0AE;
          border:2px solid rgba(0,0,0,0.1);border-radius:12px;color:#5D4037;font-family:Nunito,sans-serif;
          font-size:15px;font-weight:900;cursor:pointer;margin-bottom:12px;
          box-shadow:0 6px 0px rgba(0,0,0,0.15); transition:transform 0.1s,box-shadow 0.1s;
        ">🎙️ Join Voice Chat</button>

        <div id="status-text" style="
          font-family:Nunito Sans,sans-serif;font-size:14px;font-weight:700;color:#8D6E63;
          text-align:center;min-height:20px;margin-bottom:8px;
        "></div>
      </div>

      <div id="player-list" style="
        pointer-events:all; margin-top:20px; display:flex; flex-wrap:wrap;
        gap:8px; justify-content:center; max-width:600px;
      "></div>

      <button id="btn-start" style="
        pointer-events:all; display:none; margin-top:16px;
        width:240px;height:54px;background:#66BB6A;
        border:2px solid rgba(0,0,0,0.1);border-radius:14px;color:#fff;font-family:Nunito,sans-serif;
        font-size:18px;font-weight:900;cursor:pointer;
        box-shadow:0 8px 0px rgba(0,0,0,0.2);
        transition:transform 0.1s,box-shadow 0.1s;
      ">▶ Start Game</button>
    `;

    document.body.appendChild(root);

    // Focus effects
    ['inp-name','inp-room'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('focus', () => { el.style.borderColor = '#448AFF'; el.style.boxShadow = '0 0 0 3px rgba(68,138,255,0.3)'; });
      el.addEventListener('blur',  () => { el.style.borderColor = 'rgba(93,64,55,0.2)'; el.style.boxShadow = 'none'; });
    });

    // Hover effects (Voxel chunky press)
    ['btn-create','btn-join','btn-start','btn-voice'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('mouseenter', () => { el.style.transform='translateY(2px)'; el.style.boxShadow='0 4px 0px rgba(0,0,0,0.15)'; });
      el.addEventListener('mouseleave', () => { el.style.transform='translateY(0px)'; el.style.boxShadow='0 6px 0px rgba(0,0,0,0.15)'; });
      el.addEventListener('mousedown',  () => { el.style.transform='translateY(6px)'; el.style.boxShadow='0 0px 0px rgba(0,0,0,0.15)'; });
      el.addEventListener('mouseup',    () => { el.style.transform='translateY(2px)'; el.style.boxShadow='0 4px 0px rgba(0,0,0,0.15)'; });
    });

    document.getElementById('btn-create').addEventListener('click', () => this._createRoom());
    document.getElementById('btn-join').addEventListener('click',   () => this._joinRoom());
    document.getElementById('btn-start').addEventListener('click',  () => this._startGame());
    document.getElementById('btn-voice').addEventListener('click',  () => this._joinVoice());

    // ---- Rules event listeners ----
    this._bindRuleInputs();
  }

  _bindRuleInputs() {
    const updateRule = (event) => {
      const target = event.target;
      const path = target.getAttribute('data-rule').split('.');
      let value;
      if (target.type === 'checkbox') {
        value = target.checked;
      } else if (target.type === 'number') {
        value = parseInt(target.value, 10);
      } else if (target.tagName === 'SELECT') {
        value = target.value;
      } else {
        return;
      }

      // Navigate to the object and set the property
      let obj = this.rulesConfig;
      for (let i = 0; i < path.length - 1; i++) {
        if (!obj[path[i]]) {
          // Initialize missing objects
          obj[path[i]] = {};
        }
        obj = obj[path[i]];
      }
      obj[path[path.length - 1]] = value;

      // Optionally, show/hide dependent sections
      this._toggleRuleDependencies();
    };

    // Attach to all inputs with data-rule
    document.querySelectorAll('[data-rule]').forEach(el => {
      el.addEventListener('change', updateRule);
      // For number inputs, also update on input to show live changes
      if (el.type === 'number') {
        el.addEventListener('input', updateRule);
      }
    });

    // Game Mode Presets
    const setRule = (pathStr, value) => {
      const path = pathStr.split('.');
      let obj = this.rulesConfig;
      for (let i = 0; i < path.length - 1; i++) {
        if (!obj[path[i]]) obj[path[i]] = {};
        obj = obj[path[i]];
      }
      obj[path[path.length - 1]] = value;
      const el = document.querySelector(`[data-rule="${pathStr}"]`);
      if (el) {
        if (el.type === 'checkbox') el.checked = value;
        else el.value = value;
      }
    };

    document.getElementById('btn-mode-classic').addEventListener('click', () => {
      document.getElementById('btn-mode-classic').style.borderColor = '#448AFF';
      document.getElementById('btn-mode-mercy').style.borderColor = 'transparent';
      setRule('variants.stacking.enabled', true);
      setRule('variants.stacking.allowDraw2OnDraw2', true);
      setRule('variants.stacking.allowWild4OnWild4', true);
      setRule('variants.stacking.allowMixed', false);
      setRule('variants.sevenZero.enabled', false);
      setRule('variants.drawUntilPlayable.enabled', false);
      setRule('variants.maxCardsElimination.enabled', false);
      this._toggleRuleDependencies();
    });

    document.getElementById('btn-mode-mercy').addEventListener('click', () => {
      document.getElementById('btn-mode-mercy').style.borderColor = '#FF7043';
      document.getElementById('btn-mode-classic').style.borderColor = 'transparent';
      setRule('variants.stacking.enabled', true);
      setRule('variants.stacking.allowDraw2OnDraw2', true);
      setRule('variants.stacking.allowWild4OnWild4', true);
      setRule('variants.stacking.allowMixed', true);
      setRule('variants.sevenZero.enabled', true);
      setRule('variants.drawUntilPlayable.enabled', true);
      setRule('variants.maxCardsElimination.enabled', true);
      setRule('variants.maxCardsElimination.maxCards', 25);
      this._toggleRuleDependencies();
    });

    // Initialize the UI state (show/hide dependent sections)
    this._toggleRuleDependencies();
  }

  _toggleRuleDependencies() {
    // Stacking options
    const stackingEnabled = this.rulesConfig.variants.stacking.enabled;
    document.getElementById('stacking-options').style.opacity = stackingEnabled ? '1' : '0.5';
    document.getElementById('stacking-options').querySelectorAll('input').forEach(input => {
      input.disabled = !stackingEnabled;
    });

    // Jump-In options
    const jumpInEnabled = this.rulesConfig.variants.jumpIn.enabled;
    document.getElementById('jumpin-options').style.opacity = jumpInEnabled ? '1' : '0.5';
    document.getElementById('jumpin-options').querySelectorAll('input').forEach(input => {
      input.disabled = !jumpInEnabled;
    });

    // 7-0 options
    const sevenZeroEnabled = this.rulesConfig.variants.sevenZero.enabled;
    document.getElementById('sevenzero-options').style.opacity = sevenZeroEnabled ? '1' : '0.5';
    document.getElementById('sevenzero-options').querySelectorAll('input').forEach(input => {
      input.disabled = !sevenZeroEnabled;
    });

    // UNO Challenge Window options
    const unoWindowEnabled = this.rulesConfig.variants.unoChallengeWindow.enabled;
    document.getElementById('unowindow-options').style.opacity = unoWindowEnabled ? '1' : '0.5';
    document.getElementById('unowindow-options').querySelectorAll('select, input').forEach(el => {
      el.disabled = !unoWindowEnabled;
    });

    // Draw Until Playable options
    const drawUntilEnabled = this.rulesConfig.variants.drawUntilPlayable.enabled;
    document.getElementById('drawuntil-options').style.opacity = drawUntilEnabled ? '1' : '0.5';
    document.getElementById('drawuntil-options').querySelectorAll('input').forEach(input => {
      input.disabled = !drawUntilEnabled;
    });

    // Progressive Stacking options
    const progressiveEnabled = this.rulesConfig.variants.progressiveStacking.enabled;
    document.getElementById('progressive-options').style.opacity = progressiveEnabled ? '1' : '0.5';
    document.getElementById('progressive-options').querySelectorAll('input').forEach(input => {
      input.disabled = !progressiveEnabled;
    });

    // Max Cards Elimination options
    const maxCardsEnabled = this.rulesConfig.variants.maxCardsElimination.enabled;
    document.getElementById('maxcards-options').style.opacity = maxCardsEnabled ? '1' : '0.5';
    document.getElementById('maxcards-options').querySelectorAll('input').forEach(input => {
      input.disabled = !maxCardsEnabled;
    });
  }

  // ── Room logic ───────────────────────────────────────────

  _createRoom() {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    document.getElementById('inp-room').value = code;
    this.isRoomCreator = true;
    this._joinRoom();
  }

  async _joinVoice() {
    const btn = document.getElementById('btn-voice');
    btn.disabled = true;
    btn.textContent = '🎤 Connecting…';
    const ok = await net.startVoice();
    if (ok) {
      btn.textContent = '✅ Voice Active';
      btn.style.background = 'linear-gradient(135deg,#27ae60,#1e8449)';
    } else {
      btn.textContent = '⚠️ No mic access';
      btn.style.background = 'rgba(231,76,60,0.4)';
      btn.disabled = false;
    }
  }

  async _joinRoom() {
    const name = document.getElementById('inp-name').value.trim() || 'Player';
    const code = document.getElementById('inp-room').value.trim().toUpperCase();
    if (!code || code.length < 3) { this._setStatus('⚠️ Enter a room code!'); return; }

    this._setStatus('🔌 Connecting via P2P…');

    try {
      net.join(code, name);

      // Store on instance so peerJoin handler can re-announce to late arrivals
      const myColor = PLAYER_COLORS[0];
      this.myName  = name;
      this.myColor = myColor;

      // Register myself locally
      this.players[net.myId] = { name, color: myColor };
      this._refreshPlayerList();

      // Note: we do NOT broadcast player-join here because the WebRTC connection
      // hasn't been established yet — the message would go nowhere.
      // We announce ourselves in the peerJoin handler instead (see _wireNetwork).

      this._setStatus(`✅ In room "${code}" — waiting for players…`);

      // Don't show Start button here — peers is empty at this point so
      // isHost() always returns true for everyone. Wait for peerJoin instead.
      // Exception: if I'm solo-testing, show it but it will block on < 2 players.
      this._refreshStartButton();

      // Show the voice button — must be triggered by user gesture (iOS requirement)
      document.getElementById('btn-voice').style.display = 'block';

      if (this.isRoomCreator) {
        net.setHost(net.myId);
      }
    } catch (err) {
      console.error('[Lobby] Join failed:', err);
      this._setStatus(`❌ Error: ${err.message}`);
    }
  }

  _wireNetwork() {
    net.on('peerJoin', id => {
      // Placeholder until we receive their player-join announcement
      const idx = Object.keys(this.players).length % PLAYER_COLORS.length;
      this.players[id] = { name: 'Joining…', color: PLAYER_COLORS[idx] };
      this._refreshPlayerList();

      // Re-evaluate host AFTER peers set is updated — show OR hide the button.
      // This is the earliest safe moment: net.peers now includes the new peer.
      this._refreshStartButton();

      // Announce ourselves directly to the newly-connected peer.
      if (this.myName) {
        net.sendGameAction({ type: 'player-join', payload: { name: this.myName, color: this.myColor } }, id);
      }
    });

    net.on('peerLeave', id => {
      delete this.players[id];
      this._refreshPlayerList();
      this._refreshStartButton();
    });

    net.on('gameAction', ({ data, peerId }) => {
      if (data.action && data.action.type === 'player-join') {
        this.players[peerId] = { name: data.action.payload.name, color: data.action.payload.color };
        this._refreshPlayerList();
        // Re-check host status whenever the roster changes
        this._refreshStartButton();
      }
      if (data.action && data.action.type === 'game-start') {
        if (data.action.payload.hostId) {
          net.setHost(data.action.payload.hostId);
        }
        this._goToGame(data.action.payload);
      }
    });

    net.on('peerStream', ({ stream, peerId }) => {
      // Audio playback is handled by voice-ui.js in GameScene
      // (lobby doesn't need its own audio element)
      void stream; void peerId;
    });
  }

  _refreshPlayerList() {
    const list = document.getElementById('player-list');
    if (!list) return;
    list.innerHTML = '';
    Object.entries(this.players).forEach(([id, info]) => {
      const isMe = id === net.myId;
      const isHost = net.getHostId() === id;
      const pill = document.createElement('div');
      pill.style.cssText = `
        display:inline-flex;align-items:center;gap:8px;
        background:#ffffff;border:2px solid rgba(0,0,0,0.08);
        border-radius:12px;padding:6px 16px;
        font-family:Nunito,sans-serif;font-size:14px;font-weight:800;color:#5D4037;
        box-shadow:0 4px 0px rgba(0,0,0,0.05);
      `;
      pill.innerHTML = `
        <span style="width:20px;height:20px;border-radius:6px;background:${info.color};display:inline-block;flex-shrink:0"></span>
        ${info.name}
        ${isMe ? '<span style="color:#8D6E63;font-size:11px;font-weight:900;">(you)</span>' : ''}
        ${isHost ? '👑' : ''}
      `;
      list.appendChild(pill);
    });
  }

  // ── Helpers ──────────────────────────────────────────────

  // Single place that decides whether to show/hide the Start button.
  // Called after every event that could change host status or peer count.
  _refreshStartButton() {
    const btn = document.getElementById('btn-start');
    if (!btn) return;
    // Only the room creator sees the button; and only when at least 1 peer is connected
    btn.style.display = (this.isRoomCreator && net.getPeers().length > 0) ? 'block' : 'none';
  }

  _startGame() {
    if (!this.isRoomCreator) return;

    // Use this.players as the source of truth — it's populated by game events
    // which travel over the live data channel. net.getPeers() can lag by one
    // event tick (peerJoin fires async), causing false "Need at least 2" errors.
    const playerIds = Object.keys(this.players);
    if (playerIds.length < 2) { this._setStatus('⚠️ Need at least 2 players!'); return; }
    const playerNames = {};
    playerIds.forEach(id => { playerNames[id] = this.players[id]?.name || 'Player'; });
    const payload = {
      playerIds,
      playerNames,
      hostId: net.myId,
      rulesConfig: this.rulesConfig // Include the rules configuration
    };
    net.sendGameAction({ type: 'game-start', payload });
    this._goToGame(payload);
  }

  _goToGame(payload) {
    document.getElementById('lobby-root')?.remove();
    this.scene.start('Game', { ...payload, myId: net.myId });
  }

  _setStatus(msg) {
    const el = document.getElementById('status-text');
    if (el) el.textContent = msg;
  }
}