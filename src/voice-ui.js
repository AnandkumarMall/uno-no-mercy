// src/voice-ui.js
// Builds the floating voice overlay — one pill per peer showing name,
// speaking indicator, and mute button.

const COLORS = ['#e74c3c','#3498db','#27ae60','#f39c12','#9b59b6','#1abc9c'];
let colorIdx = 0;

const peerData = {}; // peerId → { audio, analyser, animId, el }

export function buildVoiceOverlay(net) {
  const overlay = document.getElementById('voice-overlay');
  overlay.innerHTML = '';

  // My own mic pill
  _addPill(overlay, net.myId, 'You (me)', COLORS[colorIdx++ % COLORS.length], net, true);

  net.on('peerJoin', peerId => {
    _addPill(overlay, peerId, `Player ${colorIdx + 1}`, COLORS[colorIdx++ % COLORS.length], net, false);
  });

  net.on('peerLeave', peerId => {
    const d = peerData[peerId];
    if (d) {
      cancelAnimationFrame(d.animId);
      d.el?.remove();
      delete peerData[peerId];
    }
  });

  net.on('peerStream', ({ stream, peerId }) => {
    const d = peerData[peerId];
    if (!d) return;
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    d.audio = audio;
    document.body.appendChild(audio);
    _startVolumeMonitor(peerId, stream);
  });

  // Monitor own mic
  net.on('voiceReady', ({ stream }) => {
    _startVolumeMonitor(net.myId, stream);
  });
}

function _addPill(overlay, peerId, name, color, net, isMe) {
  const pill = document.createElement('div');
  pill.className = 'voice-peer';
  pill.dataset.peerId = peerId;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.style.background = color;
  avatar.textContent = name[0].toUpperCase();

  const nameEl = document.createElement('span');
  nameEl.textContent = name;
  nameEl.style.fontSize = '13px';
  nameEl.style.fontWeight = '700';

  const muteBtn = document.createElement('button');
  muteBtn.className = 'mute-btn';
  muteBtn.textContent = '🎙️';
  muteBtn.title = 'Mute / Unmute';

  if (isMe) {
    let muted = false;
    muteBtn.addEventListener('click', () => {
      muted = !muted;
      net.setMuted(muted);
      muteBtn.textContent = muted ? '🔇' : '🎙️';
      pill.style.opacity = muted ? '0.5' : '1';
    });
  } else {
    muteBtn.style.display = 'none';
  }

  pill.append(avatar, nameEl, muteBtn);
  overlay.appendChild(pill);
  peerData[peerId] = { el: pill };
}

function _startVolumeMonitor(peerId, stream) {
  try {
    const ctx      = new AudioContext();
    const source   = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const d = peerData[peerId];
    if (!d) return;
    d.analyser = analyser;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const vol = data.reduce((a, b) => a + b, 0) / data.length;
      const pill = d.el;
      if (pill) {
        if (vol > 12) pill.classList.add('speaking');
        else          pill.classList.remove('speaking');
      }
      d.animId = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) {
    console.warn('[VoiceUI] AudioContext error:', e.message);
  }
}
