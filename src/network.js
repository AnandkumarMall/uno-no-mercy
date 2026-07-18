// src/network.js — Trystero P2P networking (@trystero-p2p/torrent v0.25.x)
//
// API changes in v0.25 vs older trystero:
//   • makeAction() returns { send, onMessage } OBJECT — NOT a [send, onMessage] tuple
//   • turnConfig is a top-level field on the room config, NOT inside rtcConfig
//   • getPeers() is a room method returning Record<peerId, RTCPeerConnection>
//   • onPeerJoin / onPeerLeave / onPeerStream are assignable properties on the room object
//   • selfId is a string export (unchanged)

import { joinRoom, selfId } from '@trystero-p2p/torrent';

const APP_ID = 'uno-game-v1-2025';

// STUN + TURN relay config
// turnConfig is a separate top-level key in @trystero-p2p v0.25
const TURN_CONFIG = [
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

class Network {
  constructor() {
    this.room          = null;
    this.myId          = selfId;   // stable string exported by @trystero-p2p
    this.peers         = new Set();
    this._handlers     = {};
    this._actions      = {};       // { gameEvent, chat, snapshot } — each is { send, onMessage }
    this.micStream     = null;
    this.roomCode      = null;
    this.playerName    = null;
    this.explicitHostId = null;
  }

  // ── Join ──────────────────────────────────────────────────
  join(roomCode, playerName) {
    if (this.room) this.leave();

    this.roomCode   = roomCode;
    this.playerName = playerName;

    // joinRoom is synchronous — returns room object immediately
    this.room = joinRoom(
      {
        appId:     APP_ID,
        rtcConfig: RTC_CONFIG,
        turnConfig: TURN_CONFIG,  // v0.25: separate key, not inside rtcConfig
      },
      roomCode.toUpperCase()
    );

    // ── Peer lifecycle ────────────────────────────────────
    this.room.onPeerJoin = (id) => {
      this.peers.add(id);
      this._emit('peerJoin', id);
      // If voice is already active, stream to the newly-joined peer specifically
      if (this.micStream) this.room.addStream(this.micStream, { target: id });
    };

    this.room.onPeerLeave = (id) => {
      this.peers.delete(id);
      this._emit('peerLeave', id);
    };

    // ── Named actions ─────────────────────────────────────
    // v0.25 makeAction returns { send, onMessage } — NOT a tuple
    const gameEventAction = this.room.makeAction('game-event');
    const chatAction      = this.room.makeAction('chat');
    const snapshotAction  = this.room.makeAction('snapshot');

    this._actions = { gameEventAction, chatAction, snapshotAction };

    // onMessage is a setter property in v0.25: action.onMessage = callback
    // Callback signature: (data, context) where context = { peerId, metadata? }
    gameEventAction.onMessage = (data, ctx) =>
      this._emit('gameAction', { data, peerId: ctx.peerId });

    chatAction.onMessage = (data, ctx) =>
      this._emit('chat', { data, peerId: ctx.peerId });

    snapshotAction.onMessage = (data, ctx) =>
      this._emit('snapshot', { data, peerId: ctx.peerId });

  }

  leave() {
    this.stopVoice();
    this.peers.clear();
    this._actions = {};
    if (this.room) {
      this.room.leave?.();
      this.room = null;
    }
  }

  // ── Game Actions ───────────────────────────────────────────
  sendGameAction(action, targetId = null) {
    const actionSend = this._actions.gameEventAction;
    if (!actionSend) return;
    const data = { action, senderId: this.myId, ts: Date.now() };
    // send(data, options?) — target can be a string peer ID or null/undefined for broadcast
    actionSend.send(data, targetId ? { target: targetId } : undefined);
  }

  sendChat(message) {
    const action = this._actions.chatAction;
    if (!action) return;
    action.send({ message, senderId: this.myId, name: this.playerName });
  }

  sendSnapshot(state, targetId = null) {
    const action = this._actions.snapshotAction;
    if (!action) return;
    const data = { state, senderId: this.myId };
    action.send(data, targetId ? { target: targetId } : undefined);
  }

  // ── Voice Chat ────────────────────────────────────────────
  // MUST be called from a user-gesture handler (button click) — iOS requirement
  async startVoice() {
    if (!this.room) return false;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      // addStream(stream, options?) — to target a specific peer: { target: peerId }
      this.room.addStream(this.micStream);

      this.room.onPeerStream = (stream, peerId) => {
        this._emit('peerStream', { stream, peerId });
      };

      // NOTE: Late-joiner streaming is handled in onPeerJoin (set above in join())

      this._emit('voiceReady', { stream: this.micStream });
      return true;
    } catch (err) {
      console.warn('[Network] Mic error:', err.message);
      this._emit('voiceError', err.message);
      return false;
    }
  }

  stopVoice() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
  }

  setMuted(muted) {
    this.micStream?.getAudioTracks().forEach(t => { t.enabled = !muted; });
  }

  // ── Host Election ─────────────────────────────────────────
  setHost(hostId) {
    this.explicitHostId = hostId;
  }

  getHostId() {
    if (this.explicitHostId) return this.explicitHostId;
    return [...this.peers, this.myId].sort()[0];
  }

  isHost() {
    if (this.explicitHostId) return this.myId === this.explicitHostId;
    return this.getHostId() === this.myId;
  }

  getPeers() {
    return [...this.peers];
  }

  // ── Event Bus ─────────────────────────────────────────────
  on(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
  }

  off(event, handler) {
    if (this._handlers[event]) {
      this._handlers[event] = this._handlers[event].filter(h => h !== handler);
    }
  }

  _emit(event, data) {
    (this._handlers[event] || []).forEach(h => h(data));
  }
}

export const net = new Network();
