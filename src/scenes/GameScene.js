// src/scenes/GameScene.js — Phase 5 Polish
// Full UNO gameplay with animations, sounds, avatars, chat, voice.

import Phaser from 'phaser';
import { net } from '../network.js';
import {
  isValidPlay,
  drawCard, checkWin, hasOneCard, WILDS,
  createInitialState as createInitialStateEngine
} from '../uno-engine.js';
import { createInitialState as createBaseState } from '../engine/state.js';
import * as AC from '../engine/actions.js';
import { validateAction } from '../engine/validators.js';
import reducer from '../engine/gameReducer.js';
import { buildVoiceOverlay } from '../voice-ui.js';
import { sounds } from '../sounds.js';

const COLOR_HEX = {
  red: 0xFF7043, yellow: 0xFFCA28, green: 0x66BB6A,
  blue: 0x448AFF, wild: 0x37474F,
};
const PLAYER_COLORS = ['#FF7043','#448AFF','#66BB6A','#FFCA28','#69F0AE','#37474F'];
const CARD_W = 90, CARD_H = 130;
const CARD_SCALE = 0.95;

export default class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  init(data) {
    this.myId        = data.myId;
    this.playerIds   = data.playerIds;
    this.playerNames = data.playerNames;
    this.rulesConfig = data.rulesConfig || {}; // from lobby host
    this.gameState   = null;
    this.cardSprites = {};
    this.unoTimer    = null;
    this.prevTurnIdx = -1;
    // Assign stable colors to each player
    this.playerColors = {};
    this.playerIds.forEach((id, i) => {
      this.playerColors[id] = PLAYER_COLORS[i % PLAYER_COLORS.length];
    });
  }

  create() {
    const W = this.scale.width, H = this.scale.height;

    this._buildBackground(W, H);
    this._buildTable(W, H);
    this._buildHUD(W, H);
    this._buildSpecialUI();
    this._wireNetwork();
    buildVoiceOverlay(net);

    if (net.isHost()) {
      // Build playerInfos array from this.playerNames and this.playerColors
      const playerInfos = this.playerIds.map(id => ({
        name: this.playerNames[id] || `Player${id}`,
        color: this.playerColors[id] || '#ffffff'
      }));
      this.gameState = createInitialStateEngine(this.playerIds, playerInfos, this.rulesConfig);
      this._dealAnimation(() => {
        net.sendSnapshot(this.gameState);
        this._renderAll();
      });
    } else {
      this._showWaiting(W, H);
    }

    net.on('peerJoin', id => {
      if (net.isHost() && this.gameState) net.sendSnapshot(this.gameState, id);
    });
  }

  shutdown() {
    document.getElementById('game-ui')?.remove();
    document.getElementById('chat-box')?.remove();
    document.getElementById('color-picker-modal')?.classList.add('hidden');
  }

  // ── Background ────────────────────────────────────────────

  _buildBackground(W, H) {
    // Voxel background (light blue)
    const gfx = this.add.graphics();
    gfx.fillGradientStyle(0xE8F0FE, 0xE8F0FE, 0xD1E4FF, 0xD1E4FF, 1);
    gfx.fillRect(0, 0, W, H);

    // Subtle isometric grid
    gfx.lineStyle(1, 0x448AFF, 0.1);
    for (let x = 0; x < W; x += 40) { gfx.moveTo(x, 0); gfx.lineTo(x, H); }
    for (let y = 0; y < H; y += 40) { gfx.moveTo(0, y); gfx.lineTo(W, y); }
    gfx.strokePath();

    // Voxel Table (Chunky block)
    gfx.fillStyle(0x37474F, 1); // Dark charcoal shadow side
    gfx.fillRoundedRect(W / 2 - W * 0.35, H / 2 - H * 0.3 + 16, W * 0.7, H * 0.6, 16);
    
    gfx.fillStyle(0x66BB6A, 1); // Grass block top
    gfx.fillRoundedRect(W / 2 - W * 0.35, H / 2 - H * 0.3, W * 0.7, H * 0.6, 16);

    // Table edge highlight
    gfx.lineStyle(4, 0xffffff, 0.2);
    gfx.strokeRoundedRect(W / 2 - W * 0.35, H / 2 - H * 0.3, W * 0.7, H * 0.6, 16);
  }

  // ── Table Center ─────────────────────────────────────────

  _buildTable(W, H) {
    const cx = W / 2, cy = H / 2;

    // Draw pile
    this.drawPileBg = this.add.rectangle(cx - 80, cy, CARD_W + 8, CARD_H + 8, 0xffffff, 0.2)
      .setStrokeStyle(4, 0xffffff, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this._onDrawPile())
      .on('pointerover', () => { this.tweens.add({ targets: this.drawPileCard, displayWidth: CARD_W * 1.05, displayHeight: CARD_H * 1.05, duration: 100 }); })
      .on('pointerout',  () => { this.tweens.add({ targets: this.drawPileCard, displayWidth: CARD_W * CARD_SCALE, displayHeight: CARD_H * CARD_SCALE, duration: 100 }); });

    this.drawPileCard = this.add.image(cx - 80, cy, 'card-back').setDisplaySize(CARD_W * CARD_SCALE, CARD_H * CARD_SCALE);
    this.drawPileLabel = this.add.text(cx - 80, cy + 82, 'DRAW', {
      fontFamily: 'Nunito', fontSize: '12px', color: '#ffffff', fontStyle: '800',
      letterSpacing: 2, stroke: '#5D4037', strokeThickness: 3
    }).setOrigin(0.5);
    this.drawPileCount = this.add.text(cx - 80, cy + 98, '', {
      fontFamily: 'Nunito', fontSize: '14px', fontStyle: '900', color: '#ffffff',
      stroke: '#5D4037', strokeThickness: 3
    }).setOrigin(0.5);

    // Discard pile slot
    this.discardSlot = this.add.rectangle(cx + 80, cy, CARD_W + 8, CARD_H + 8, 0x000000, 0.1)
      .setStrokeStyle(4, 0x000000, 0.2);
    this.discardPileCard = this.add.image(cx + 80, cy, 'card-back').setDisplaySize(CARD_W * CARD_SCALE, CARD_H * CARD_SCALE).setAlpha(0.3);

    // Color ring (shows current active color)
    this.colorRingOuter = this.add.rectangle(cx + 80, cy - 95, 48, 48, 0xffffff, 0.15).setStrokeStyle(2, 0xffffff, 0.5);
    this.colorRing      = this.add.rectangle(cx + 80, cy - 95, 36, 36, 0xFF7043)
      .setStrokeStyle(3, 0xffffff, 1);
    this.colorLabel     = this.add.text(cx + 80, cy - 134, 'COLOR', {
      fontFamily: 'Nunito', fontSize: '12px', color: '#ffffff', fontStyle: '800', letterSpacing: 2, stroke: '#5D4037', strokeThickness: 3
    }).setOrigin(0.5);

    // Turn arrow indicator
    this.turnArrow = this.add.text(cx, cy - 10, '▶', {
      fontFamily: 'Nunito', fontSize: '26px', color: '#FFCA28', stroke: '#5D4037', strokeThickness: 4
    }).setOrigin(0.5).setAlpha(0);

    // Turn banner
    this.turnBanner = this.add.text(W / 2, 32, '', {
      fontFamily: 'Nunito', fontSize: '24px', fontStyle: '900',
      color: '#ffffff', stroke: '#5D4037', strokeThickness: 5,
    }).setOrigin(0.5);
  }

  // ── HUD — Opponent Panels ─────────────────────────────────

  _buildHUD(W, H) {
    this.opponentPanels = {};
    const others    = this.playerIds.filter(id => id !== this.myId);
    const positions = this._getOpponentPositions(W, H, others.length);

    others.forEach((id, i) => {
      const { x, y } = positions[i];
      const color     = this.playerColors[id];
      const hexColor  = parseInt(color.replace('#', ''), 16);

      // Avatar block
      const avatarShadow = this.add.rectangle(x, y - 26, 44, 44, 0x000000, 0.2);
      const avatar = this.add.rectangle(x, y - 28, 44, 44, hexColor)
        .setStrokeStyle(3, 0xffffff, 1);
      const avatarText = this.add.text(x, y - 28,
        (this.playerNames[id] || '?')[0].toUpperCase(), {
          fontFamily: 'Nunito', fontSize: '22px', fontStyle: '900', color: '#fff', stroke: '#5D4037', strokeThickness: 4
        }).setOrigin(0.5);

      // Name tag
      const nameBg = this.add.rectangle(x, y + 12, 110, 26, 0xffffff, 1)
        .setStrokeStyle(2, 0x5D4037, 1);
      const nameText = this.add.text(x, y + 12, this.playerNames[id] || id.slice(0, 8), {
        fontFamily: 'Nunito', fontSize: '13px', fontStyle: '900', color: '#5D4037',
      }).setOrigin(0.5);
      const countText = this.add.text(x, y + 32, '7 cards', {
        fontFamily: 'Nunito', fontSize: '12px', fontStyle: '800', color: color, stroke: '#ffffff', strokeThickness: 3

      }).setOrigin(0.5);

      // Speaking indicator
      const speakRing = this.add.circle(x + 22, y - 28, 8, 0x27ae60).setAlpha(0);

      // Mini opponent hand (card backs)
      this.opponentPanels[id] = {
        avatar, avatarText, nameBg, nameText, countText, speakRing,
        x, y, miniCards: [],
      };
    });

    // My avatar (bottom)
    const myColor    = this.playerColors[this.myId];
    const myHexColor = parseInt(myColor.replace('#', ''), 16);
    this.myAvatar = this.add.circle(W / 2, H - 172, 22, myHexColor)
      .setStrokeStyle(2, 0xffffff, 0.5);
    this.myAvatarText = this.add.text(W / 2, H - 172,
      (this.playerNames[this.myId] || '?')[0].toUpperCase(), {
        fontFamily: 'Nunito', fontSize: '18px', fontStyle: '900', color: '#fff',
      }).setOrigin(0.5);
    this.myNameText = this.add.text(W / 2, H - 148, this.playerNames[this.myId] || 'You', {
      fontFamily: 'Nunito', fontSize: '13px', color: myColor, fontStyle: '700',
    }).setOrigin(0.5);
    
    // Track if swap modal is currently open so we don't spam it
    this.swapModalOpen = false;
  }

  // ── Special UI — HTML Overlays ────────────────────────────

  _buildSpecialUI() {
    // UNO button
    const unoBtn = document.createElement('button');
    unoBtn.id = 'uno-btn';
    unoBtn.innerHTML = '🃏<br>UNO!';
    unoBtn.style.cssText = `
      position:fixed; bottom:110px; right:24px;
      width:82px; height:82px; border-radius:50%;
      background:radial-gradient(circle at 40% 40%, #e74c3c, #922b21);
      border:3px solid rgba(255,255,255,0.8); color:#fff;
      font-family:Nunito,sans-serif; font-size:14px; font-weight:900;
      line-height:1.2; cursor:pointer; display:none; z-index:100;
      box-shadow:0 0 0 0 rgba(231,76,60,0.7);
      animation:unoRing 1.2s infinite;
    `;
    document.head.insertAdjacentHTML('beforeend', `
      <style>
        @keyframes unoRing {
          0%   { box-shadow: 0 0 0 0 rgba(231,76,60,0.7); }
          70%  { box-shadow: 0 0 0 16px rgba(231,76,60,0); }
          100% { box-shadow: 0 0 0 0 rgba(231,76,60,0); }
        }
        #uno-btn:hover { transform: scale(1.1); }
        #mute-btn:hover { opacity: 0.8; }
      </style>
    `);
    unoBtn.addEventListener('click', () => this._sayUno());
    document.body.appendChild(unoBtn);
    this.unoBtn = unoBtn;

    // Mute button (Voxel Gamified style)
    const muteBtn = document.createElement('button');
    muteBtn.id = 'mute-btn';
    muteBtn.textContent = '🎙️';
    muteBtn.title = 'Mute / Unmute mic';
    muteBtn.style.cssText = `
      position:fixed; bottom:24px; right:24px;
      width:52px; height:52px; border-radius:12px;
      background:#ffffff; border:2px solid #5D4037;
      color:#5D4037;
      font-size:24px; cursor:pointer; z-index:100;
      display:flex; align-items:center; justify-content:center;
      box-shadow: 0 4px 0px rgba(93,64,55,0.15); transition:transform 0.1s, box-shadow 0.1s;
    `;
    let muted = false;
    muteBtn.addEventListener('click', () => {
      muted = !muted;
      net.setMuted(muted);
      muteBtn.textContent = muted ? '🔇' : '🎙️';
      muteBtn.style.background = muted ? '#FF7043' : '#ffffff';
    });
    muteBtn.addEventListener('mouseenter', () => { muteBtn.style.transform='translateY(-2px)'; muteBtn.style.boxShadow='0 6px 0px rgba(93,64,55,0.15)'; });
    muteBtn.addEventListener('mouseleave', () => { muteBtn.style.transform='translateY(0px)'; muteBtn.style.boxShadow='0 4px 0px rgba(93,64,55,0.15)'; });
    muteBtn.addEventListener('mousedown',  () => { muteBtn.style.transform='translateY(4px)'; muteBtn.style.boxShadow='0 0px 0px rgba(93,64,55,0.15)'; });
    muteBtn.addEventListener('mouseup',    () => { muteBtn.style.transform='translateY(-2px)'; muteBtn.style.boxShadow='0 6px 0px rgba(93,64,55,0.15)'; });
    document.body.appendChild(muteBtn);

    // Chat box
    this._buildChatBox();
  }

  _buildChatBox() {
    const box = document.createElement('div');
    box.id = 'chat-box';
    box.style.cssText = `
      position:fixed; bottom:24px; left:24px; width:260px;
      background:#ffffff; 
      border:2px solid #5D4037; border-radius:12px;
      overflow:hidden; z-index:100; display:flex; flex-direction:column;
      box-shadow: 0 6px 0px rgba(93,64,55,0.15);
    `;

    const msgs = document.createElement('div');
    msgs.id = 'chat-messages';
    msgs.style.cssText = `
      max-height:120px; overflow-y:auto; padding:10px 12px 6px;
      font-size:13px; font-family:Nunito,sans-serif; color:#8D6E63; font-weight:700;
      display:flex; flex-direction:column; gap:4px;
    `;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; border-top:2px solid rgba(93,64,55,0.1); padding:4px 8px; background:#E8F0FE;';

    const inp = document.createElement('input');
    inp.placeholder = 'Say something…';
    inp.style.cssText = `flex:1; background:none; border:none; outline:none; padding:6px 4px;
      color:#5D4037; font-family:Nunito,sans-serif; font-size:14px; font-weight:800;`;

    const send = document.createElement('button');
    send.innerHTML = '➤';
    send.style.cssText = `background:none; border:none; color:#FF7043; font-size:18px;
      padding:0 6px; cursor:pointer; font-weight:900;`;

    const doSend = () => {
      const msg = inp.value.trim();
      if (!msg) return;
      net.sendChat(msg);
      this._addChatMsg('You', msg, true);
      inp.value = '';
      sounds.chat();
    };
    send.addEventListener('click', doSend);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });

    row.append(inp, send);
    box.append(msgs, row);
    document.body.appendChild(box);
    this.chatMsgs = msgs;
  }

  // ── Network ───────────────────────────────────────────────

  _wireNetwork() {
    // Authoritative state: only update from host snapshots
    net.on('snapshot', ({ data }) => {
      const wasWaiting = !this.gameState;
      this.gameState = data.state;
      if (wasWaiting) {
        this.waitText?.destroy();
        this._dealAnimation(() => this._renderAll());
      } else {
        this._renderAll();
      }
    });

    net.on('gameAction', ({ data, peerId }) => this._applyRemoteAction(data.action, peerId));

    net.on('chat', ({ data }) => {
      this._addChatMsg(data.name, data.message, false);
      sounds.chat();
    });
  }

  /**
   * _applyRemoteAction — Host-authoritative using reducer and action validation.
   *   - Host: validates incoming action, runs reducer, broadcasts snapshot.
   *   - Non-host: apply action via reducer (should produce same state as host) and render.
   */
  _applyRemoteAction(action, peerId) {
    if (!this.gameState) return;

    const actionObj = {
      type: action.type,
      payload: action.payload || {},
    };

    if (net.isHost()) {
      // Host: validate then apply
      const isValid = validateAction(this.gameState, actionObj);
      if (!isValid) {
        console.warn('[Host] Invalid action ignored from', peerId, actionObj);
        return;
      }
      let newState = reducer(this.gameState, actionObj);
      // Handle win detection (could be moved into reducer later)
      if (newState.phase !== 'ended' && this._checkWinAfterAction(newState, actionObj, peerId)) {
        newState.phase = 'ended';
        newState.winner = peerId;
      }
      this.gameState = newState;
      net.sendSnapshot(this.gameState);
      this._renderAll();
      this._playActionSound(actionObj);
    } else {
      // Non-host: apply same action to stay in sync (assumes host already validated)
      let newState = reducer(this.gameState, actionObj);
      if (newState.phase !== 'ended' && this._checkWinAfterAction(newState, actionObj, peerId)) {
        newState.phase = 'ended';
        newState.winner = peerId;
      }
      this.gameState = newState;
      this._renderAll();
      this._playActionSound(actionObj);
    }
  }

  // Helper: determine if the action resulted in a win for the peer who sent it
  _checkWinAfterAction(state, action, peerId) {
    // Win condition: player has no cards after their turn ends
    // We approximate: if action was a PLAY_CARD or DRAW_CARD that ended turn,
    // we can check if the player who just acted now has zero cards.
    // Simpler: after applying action, check if the player who just acted has empty hand.
    const playerId = action.payload.playerId ?? peerId; // for actions that include playerId
    const hand = state.hands[playerId] ?? [];
    return hand.length === 0;
  }

  // Helper: play appropriate sound for action type (mirrors previous logic)
  _playActionSound(action) {
    switch (action.type) {
      case 'PLAY_CARD': {
        const card = action.payload.card;
        const isSpecial = card && ['skip','reverse','draw2','wild','wild-draw4'].includes(card.value);
        isSpecial ? sounds.specialCard() : sounds.cardPlay();
        break;
      }
      case 'DRAW_CARD':
        sounds.cardDraw();
        break;
      case 'CALL_UNO':
        sounds.uno();
        break;
      // other actions have no sound
    }
  }

  // ── Player Actions ────────────────────────────────────────

  _onCardClick(card) {
    if (!this.gameState || !this.gameState.turn) return;
    const myTurn = this.gameState.turn.currentPlayerId === this.myId;
    if (!myTurn) { this._flashMsg('⏳ Not your turn!', '#FF7043'); sounds.invalid(); return; }

    const top = this.gameState.topCard;
    if (!isValidPlay(card, top, this.gameState.currentColor, this.gameState.pendingDraw)) {
      this._flashMsg("❌ Can't play that card!", '#FF7043');
      sounds.invalid();
      this._shakeCard(card);
      return;
    }

    if (card.color === 'wild' && card.value !== 'color-roulette') {
      this._showColorPicker(c => {
        this._executePlay(card, c);
      });
      return;
    }
    this._executePlay(card, null);
  }

  _executePlay(card, chosenColor) {
    if (!this.gameState.turn || this.gameState.turn.currentPlayerId !== this.myId) return;
    const action = {
      type: 'PLAY_CARD',
      payload: { playerId: this.myId, card, chosenColor }
    };// Optimistic update
    this.gameState = reducer(this.gameState, action);
    
    // UI feedback for special variants
    if (card.value === '0') {
      this._flashMsg('Hands Rotated! 🔄', '#448AFF');
    }
    
    // Win check
    if (this.gameState.phase !== 'ended' && this._checkWinAfterAction(this.gameState, action, this.myId)) {
      this.gameState.phase = 'ended';
      this.gameState.winner = this.myId;
    }
    this._renderAll();
    // Send action to peers
    net.sendGameAction(action);
    // Host: broadcast snapshot immediately
    if (net.isHost()) {
      net.sendSnapshot(this.gameState);
    }
    // Sound feedback
    this._playActionSound(action);
    // UNO button
    if (hasOneCard(this.myId, this.gameState.hands)) this._showUnoBtn();
    // End game handling
    if (this.gameState.phase === 'ended') {
      this.time.delayedCall(1800, () => this._endGame());
    }
  }

  _onDrawPile() {
    if (!this.gameState.turn || this.gameState.turn.currentPlayerId !== this.myId) return;
    
    const drawUntilPlayable = this.rulesConfig?.variants?.drawUntilPlayable?.enabled ?? false;
    let count = drawUntilPlayable ? 'until-playable' : 1;
    let isPenalty = false;
    if (this.gameState.pendingDraw) {
      count = this.gameState.pendingDraw.amount;
      isPenalty = true;
    }
    
    // In Uno No Mercy, you cannot voluntarily draw if you have a playable card
    if (!isPenalty) {
      const myHand = this.gameState.hands[this.myId];
      const topCard = this.gameState.topCard;
      const hasPlayable = myHand.some(c => isValidPlay(c, topCard, this.gameState.currentColor, null));
      if (hasPlayable) {
        this._flashMsg('You have a playable card!', '#FF7043');
        return;
      }
    }
    
    // Draw the card
    const drawAction = { type: 'DRAW_CARD', payload: { playerId: this.myId, count } };
    net.sendGameAction(drawAction);
    this.gameState = reducer(this.gameState, drawAction);
    
    if (isPenalty) {
      this._flashMsg(count === 'roulette' ? 'Drawing Color Roulette!' : `Drew ${count} penalty cards!`, '#FF7043');
    } else {
      const myHand = this.gameState.hands[this.myId];
      const drawnCard = myHand[myHand.length - 1];
      
      if (drawUntilPlayable) {
        // With until-playable, the last card in the hand is guaranteed playable
        this._flashMsg('Drew until playable — auto-playing!', '#66BB6A');
        if (drawnCard.color === 'wild') {
          this._showColorPicker(c => {
            this._executePlay(drawnCard, c);
          });
        } else {
          this._executePlay(drawnCard, null);
        }
      } else {
        // Classic rule: draw 1. If playable, auto-play. Else, just keep it.
        const topCard = this.gameState.topCard;
        const playable = isValidPlay(drawnCard, topCard, this.gameState.currentColor, null);
        if (playable) {
          this._flashMsg('You drew — auto-playing!', '#66BB6A');
          if (drawnCard.color === 'wild') {
            this._showColorPicker(c => {
              this._executePlay(drawnCard, c);
            });
          } else {
            this._executePlay(drawnCard, null);
          }
        } else {
          this._flashMsg('Drew a card — not playable.', '#FFCA28');
          // Advance turn for classic mode since it's not playable and we drew our 1 card
          net.sendGameAction({ type: 'NEXT_TURN' });
          this.gameState = reducer(this.gameState, { type: 'NEXT_TURN' });
        }
      }
    }
    
    if (net.isHost()) net.sendSnapshot(this.gameState);
    
    this._renderAll();
  }

  _sayUno() {
    const action = AC.callUno(this.myId);
    this.gameState = reducer(this.gameState, action);
    this._renderAll();
    sounds.uno();
    this._showUnoShout('You');
    this._hideUnoBtn();
    net.sendGameAction(action);
    if (net.isHost()) {
      net.sendSnapshot(this.gameState);
    }
  }

  // ── Rendering ─────────────────────────────────────────────

  _renderAll() {
    if (!this.gameState) return;
    this._renderHand();
    this._renderDiscard();
    this._renderColorRing();
    this._renderDrawCount();
    this._renderTurnBanner();
    this._renderOpponents();
    this._checkTurnChange();
    
    // Check if we need to show the swap player picker
    if (this.gameState.turn && this.gameState.turn.phase === 'CHOOSE_SWAP_PLAYER') {
      if (this.gameState.selectingPlayer === this.myId && !this.swapModalOpen) {
        this.swapModalOpen = true;
        this._showSwapPlayerPicker(targetId => {
          this.swapModalOpen = false;
          net.sendGameAction({ type: 'CHOOSE_SWAP_PLAYER', payload: { targetPlayerId: targetId } });
          this.gameState = reducer(this.gameState, { type: 'CHOOSE_SWAP_PLAYER', payload: { targetPlayerId: targetId } });
          if (net.isHost()) net.sendSnapshot(this.gameState);
          this._renderAll();
        });
      }
    }
    
    // Check if we need to show the color picker for a pending Color Roulette
    if (this.gameState.turn && this.gameState.turn.phase === 'CHOOSE_ROULETTE_COLOR') {
      if (this.gameState.turn.currentPlayerId === this.myId && !this.swapModalOpen) {
        this.swapModalOpen = true;
        this._showColorPicker(c => {
          this.swapModalOpen = false;
          net.sendGameAction({ type: 'CHOOSE_COLOR', payload: { color: c } });
          this.gameState = reducer(this.gameState, { type: 'CHOOSE_COLOR', payload: { color: c } });
          if (net.isHost()) net.sendSnapshot(this.gameState);
          this._renderAll();
        });
      }
    }
  }

  _renderHand() {
    const W = this.scale.width, H = this.scale.height;
    const hand = this.gameState.hands[this.myId] || [];

    // Destroy old sprites
    Object.values(this.cardSprites).forEach(s => s?.destroy());
    this.cardSprites = {};

    const maxW  = W - 80;
    const spread = Math.min(64, maxW / Math.max(hand.length, 1));
    const totalW = (hand.length - 1) * spread + CARD_W;
    const startX = W / 2 - totalW / 2 + CARD_W / 2;
    const baseY  = H - 80;

    const myTurn = this.gameState.turn && this.gameState.turn.currentPlayerId === this.myId;

    hand.forEach((card, i) => {
      const angle = (i - (hand.length - 1) / 2) * 1.5;
      const x     = startX + i * spread;
      const yOff  = Math.abs(angle) * 1.2;

      if (!this.textures.exists(card.id)) return;
      const sprite = this.add.image(x, baseY + yOff, card.id)
        .setDisplaySize(CARD_W * CARD_SCALE, CARD_H * CARD_SCALE)
        .setAngle(angle)
        .setDepth(i + 10)
        .setInteractive({ useHandCursor: myTurn });

      // Highlight playable cards on your turn
      if (myTurn) {
        const top = this.gameState.topCard;
        const playable = isValidPlay(card, top, this.gameState.currentColor);
        if (playable) {
          this.tweens.add({ targets: sprite, y: baseY + yOff - 6, duration: 300, ease: 'Sine.Out', yoyo: true, repeat: -1 });
        } else {
          sprite.setAlpha(0.55);
        }
      }

      sprite.on('pointerover', () => {
        this.tweens.killTweensOf(sprite);
        this.tweens.add({ targets: sprite, y: baseY + yOff - 28, duration: 120, ease: 'Quad.Out' });
      });
      sprite.on('pointerout', () => {
        this.tweens.killTweensOf(sprite);
        this.tweens.add({ targets: sprite, y: baseY + yOff, duration: 120 });
      });
      sprite.on('pointerdown', () => this._onCardClick(card));

      this.cardSprites[card.id + i] = sprite;
    });

    // My card count badge
    if (!this.myCountText) {
      this.myCountText = this.add.text(W / 2, H - 155, '', {
        fontFamily: 'Nunito', fontSize: '13px', color: '#7f8c8d',
      }).setOrigin(0.5).setDepth(20);
    }
    this.myCountText.setText(`${hand.length} card${hand.length !== 1 ? 's' : ''}`);
  }

  _renderDiscard() {
    const top = this.gameState.topCard;
    if (top && this.textures.exists(top.id)) {
      this.discardPileCard.setTexture(top.id).setAlpha(1).setDisplaySize(CARD_W * CARD_SCALE, CARD_H * CARD_SCALE);
    }
  }

  _renderColorRing() {
    const c = COLOR_HEX[this.gameState.currentColor] ?? 0x888888;
    this.colorRing.setFillStyle(c);
    this.tweens.add({ targets: this.colorRingOuter, alpha: 0.3, duration: 200, yoyo: true });
  }

  _renderDrawCount() {
    this.drawPileCount.setText(`${this.gameState.deck.drawPile.length}`);
  }

  _renderTurnBanner() {
    if (!this.gameState.turn) return;
    const id   = this.gameState.turn.currentPlayerId;
    const name = this.playerNames[id] || id;
    const isMe = id === this.myId;
    this.turnBanner.setText(isMe ? '⭐  Your Turn!' : `${name}'s Turn`);
    this.turnBanner.setColor(isMe ? '#f1c40f' : '#aaa');
  }

  _renderOpponents() {
    this.playerIds.filter(id => id !== this.myId).forEach(id => {
      const p = this.opponentPanels[id];
      if (!p || !this.gameState.hands[id]) return;
      const n = this.gameState.hands[id].length;
      p.countText.setText(`${n} card${n !== 1 ? 's' : ''}`);

      // Highlight active player
      const activeId = this.gameState.turn ? this.gameState.turn.currentPlayerId : null;
      p.nameBg.setStrokeStyle(1,
        parseInt((this.playerColors[id] || '#888').replace('#',''), 16),
        activeId === id ? 0.9 : 0.3
      );
    });
  }

  _checkTurnChange() {
    if (!this.gameState.turn) return;
    const id = this.gameState.turn.currentPlayerId;
    if (id !== this.prevTurnIdx) { // prevTurnIdx is now actually storing the ID
      this.prevTurnIdx = id;
      if (id === this.myId) {
        sounds.yourTurn();
        this._flashMsg('⭐ Your Turn!', '#FFCA28');
      }
    }
  }

  // ── Animations ────────────────────────────────────────────

  _dealAnimation(onDone) {
    const W = this.scale.width, H = this.scale.height;
    const cx = W / 2, cy = H / 2;

    // Animate 7 cards flying from center to bottom
    let done = 0;
    for (let i = 0; i < 7; i++) {
      const card = this.add.image(cx, cy, 'card-back')
        .setDisplaySize(CARD_W * 0.4, CARD_H * 0.4).setDepth(100).setAlpha(0);

      this.tweens.add({
        targets: card,
        alpha: 1,
        displayWidth: CARD_W * CARD_SCALE, displayHeight: CARD_H * CARD_SCALE,
        x: cx - 160 + i * 50,
        y: H - 80,
        duration: 280,
        delay: i * 80,
        ease: 'Quad.Out',
        onComplete: () => {
          card.destroy();
          done++;
          if (done === 7 && onDone) onDone();
        },
      });
    }
    sounds.shuffle();
  }

  _flyCardToDiscard(card) {
    const W = this.scale.width, H = this.scale.height;
    if (!this.textures.exists(card.id)) return;

    const fx = this.add.image(W / 2, H - 80, card.id)
      .setDisplaySize(CARD_W * CARD_SCALE, CARD_H * CARD_SCALE).setDepth(200).setAngle(Phaser.Math.Between(-10, 10));

    this.tweens.add({
      targets: fx,
      x: W / 2 + 80, y: H / 2,
      angle: 0,
      displayWidth: CARD_W * CARD_SCALE, displayHeight: CARD_H * CARD_SCALE,
      duration: 260, ease: 'Quad.InOut',
      onComplete: () => fx.destroy(),
    });
  }

  _shakeCard(card) {
    const key = Object.keys(this.cardSprites).find(k => k.startsWith(card.id));
    const sprite = this.cardSprites[key];
    if (!sprite) return;
    const ox = sprite.x;
    this.tweens.add({
      targets: sprite, x: ox + 8, duration: 40,
      yoyo: true, repeat: 4,
      onComplete: () => sprite.x = ox,
    });
  }

  // ── Color Picker ──────────────────────────────────────────

  _showColorPicker(callback) {
    const modal = document.getElementById('color-picker-modal');
    modal.classList.remove('hidden');
    const handler = (e) => {
      const color = e.target.closest('.color-btn')?.dataset?.color;
      if (!color) return;
      modal.classList.add('hidden');
      modal.querySelectorAll('.color-btn').forEach(b => b.removeEventListener('click', handler));
      callback(color);
    };
    modal.querySelectorAll('.color-btn').forEach(b => b.addEventListener('click', handler));
  }
  
  _showSwapPlayerPicker(callback) {
    const modal = document.getElementById('swap-player-modal');
    const container = document.getElementById('swap-player-buttons');
    container.innerHTML = '';
    
    // Add buttons for each opponent
    const opponents = this.playerIds.filter(id => id !== this.myId);
    opponents.forEach(opId => {
      const name = this.playerNames[opId] || opId;
      const btn = document.createElement('button');
      btn.className = 'color-btn';
      btn.style.background = this.playerColors[opId] || '#34495e';
      btn.dataset.id = opId;
      btn.textContent = name;
      container.appendChild(btn);
    });
    
    modal.classList.remove('hidden');
    const handler = (e) => {
      const targetId = e.target.closest('.color-btn')?.dataset?.id;
      if (!targetId) return;
      modal.classList.add('hidden');
      container.querySelectorAll('.color-btn').forEach(b => b.removeEventListener('click', handler));
      callback(targetId);
    };
    container.querySelectorAll('.color-btn').forEach(b => b.addEventListener('click', handler));
  }

  // ── UNO Button ────────────────────────────────────────────

  _showUnoBtn() {
    this.unoBtn.style.display = 'flex';
    this.unoBtn.style.alignItems = 'center';
    this.unoBtn.style.justifyContent = 'center';
    this.unoBtn.style.flexDirection = 'column';
    if (this.unoTimer) this.unoTimer.remove();
    this.unoTimer = this.time.delayedCall(5000, () => this._hideUnoBtn());
  }

  _hideUnoBtn() {
    this.unoBtn.style.display = 'none';
    if (this.unoTimer) { this.unoTimer.remove(); this.unoTimer = null; }
  }

  _showUnoShout(name) {
    const W = this.scale.width, H = this.scale.height;
    const t = this.add.text(W / 2, H / 2 - 40, `${name} shouts UNO! 🃏`, {
      fontFamily: 'Nunito', fontSize: '46px', fontStyle: '900',
      color: '#e74c3c', stroke: '#fff', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(300).setScale(0.3);

    this.tweens.add({
      targets: t, scale: 1, duration: 250, ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: t, alpha: 0, y: H / 2 - 90, duration: 1200, delay: 800,
          onComplete: () => t.destroy(),
        });
      },
    });
  }

  // ── Flash Message ─────────────────────────────────────────

  _flashMsg(msg, color = '#eaeaea') {
    const W = this.scale.width, H = this.scale.height;
    const t = this.add.text(W / 2, H / 2 - 60, msg, {
      fontFamily: 'Nunito', fontSize: '24px', fontStyle: '800',
      color, stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(300).setAlpha(0);

    this.tweens.add({
      targets: t, alpha: 1, duration: 150,
      onComplete: () => {
        this.tweens.add({ targets: t, alpha: 0, y: H / 2 - 90, duration: 900, delay: 700,
          onComplete: () => t.destroy() });
      },
    });
  }

  _showWaiting(W, H) {
    this.waitText = this.add.text(W / 2, H / 2, '⏳ Waiting for host…', {
      fontFamily: 'Nunito', fontSize: '26px', color: '#7f8c8d',
    }).setOrigin(0.5);
    this.tweens.add({ targets: this.waitText, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
  }

  // ── Chat ──────────────────────────────────────────────────

  _addChatMsg(name, msg, isMe) {
    const div = document.createElement('div');
    div.style.lineHeight = '1.4';
    div.innerHTML = `<span style="color:${isMe?'#e94560':'#3498db'};font-weight:700">${this._esc(name)}</span>: ${this._esc(msg)}`;
    this.chatMsgs.appendChild(div);
    this.chatMsgs.scrollTop = this.chatMsgs.scrollHeight;
  }

  _esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Opponent positions ────────────────────────────────────

  _getOpponentPositions(W, H, count) {
    if (count === 1) return [{ x: W / 2, y: 60 }];
    if (count === 2) return [{ x: W / 4, y: 60 }, { x: 3 * W / 4, y: 60 }];
    if (count === 3) return [
      { x: 100, y: H / 2 }, { x: W / 2, y: 60 }, { x: W - 100, y: H / 2 },
    ];
    return Array.from({ length: count }, (_, i) => ({
      x: W * (i + 1) / (count + 1), y: 60,
    }));
  }

  // ── End Game ──────────────────────────────────────────────

  _endGame() {
    sounds.win();
    this.shutdown();
    this.scene.start('End', {
      winner: this.gameState.winner,
      playerNames: this.playerNames,
      myId: this.myId,
      playerColors: this.playerColors,
    });
  }
}
