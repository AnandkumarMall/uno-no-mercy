// src/scenes/EndScene.js — Phase 5 Polish
import Phaser from 'phaser';
import { net } from '../network.js';
import { sounds } from '../sounds.js';

export default class EndScene extends Phaser.Scene {
  constructor() { super('End'); }

  init(data) {
    this.winner       = data.winner;
    this.playerNames  = data.playerNames;
    this.myId         = data.myId;
    this.playerColors = data.playerColors || {};
  }

  create() {
    const W = this.scale.width, H = this.scale.height;
    const isMe   = this.winner === this.myId;
    const name   = this.playerNames[this.winner] || 'Someone';
    const color  = this.playerColors[this.winner] || '#e94560';
    const hexCol = parseInt(color.replace('#', ''), 16);

    // Background
    const gfx = this.add.graphics();
    gfx.fillGradientStyle(0xE8F0FE, 0xE8F0FE, 0xD1E4FF, 0xD1E4FF, 1);
    gfx.fillRect(0, 0, W, H);

    // Confetti
    this._spawnConfetti(W, H);

    // Winner glow circle
    const glow = this.add.circle(W / 2, H / 2 - 60, 110, hexCol, 0.12).setScale(0);
    this.tweens.add({ targets: glow, scale: 1, duration: 600, ease: 'Back.Out' });

    // Avatar
    const avatar = this.add.circle(W / 2, H / 2 - 60, 64, hexCol)
      .setStrokeStyle(4, 0xffffff, 0.7).setScale(0);
    const avatarLetter = this.add.text(W / 2, H / 2 - 60, name[0].toUpperCase(), {
      fontFamily: 'Nunito', fontSize: '52px', fontStyle: '900', color: '#fff',
    }).setOrigin(0.5).setAlpha(0);

    // Trophy / sad emoji
    const emoji = this.add.text(W / 2, H / 2 - 60, isMe ? '🏆' : '😅', {
      fontSize: '52px',
    }).setOrigin(0.5).setAlpha(0).setDepth(5);

    // Headline
    const headline = this.add.text(W / 2, H / 2 + 30, isMe ? 'YOU WIN! 🎉' : `${name} Wins!`, {
      fontFamily: 'Nunito', fontSize: isMe ? '68px' : '52px', fontStyle: '900',
      color: isMe ? '#FFCA28' : color,
      stroke: '#5D4037', strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0).setY(H / 2 + 50);

    const sub = this.add.text(W / 2, H / 2 + 96, isMe
      ? 'Amazing game! 🥳'
      : 'Better luck next time! 💪', {
      fontFamily: 'Nunito Sans', fontSize: '20px', fontStyle: '800', color: '#8D6E63',
    }).setOrigin(0.5).setAlpha(0);

    // Animate in sequence
    this.tweens.add({
      targets: avatar, scale: 1, duration: 500, delay: 100, ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({ targets: [avatarLetter, emoji], alpha: 1, duration: 300 });
      },
    });
    this.tweens.add({ targets: headline, alpha: 1, y: H / 2 + 30, duration: 500, delay: 400 });
    this.tweens.add({ targets: sub, alpha: 1, duration: 400, delay: 700 });

    // Play Again button (HTML) Voxel Gamified style
    const btn = document.createElement('button');
    btn.textContent = '🔄 Play Again';
    btn.style.cssText = `
      position:fixed; left:50%; bottom:72px; transform:translateX(-50%) scale(0.8);
      width:230px; height:60px;
      background:#FF7043;
      border:2px solid rgba(0,0,0,0.1); border-radius:12px; color:#fff;
      font-family:Nunito,sans-serif; font-size:18px; font-weight:900;
      cursor:pointer; z-index:200;
      box-shadow:0 6px 0px rgba(0,0,0,0.15);
      opacity:0; transition:opacity 0.4s, transform 0.15s, box-shadow 0.15s;
    `;
    document.body.appendChild(btn);
    setTimeout(() => {
      btn.style.transform = 'translateX(-50%) scale(1) translateY(2px)';
    }, 900);
    btn.addEventListener('mouseenter', () => { btn.style.transform = 'translateX(-50%) translateY(0px)'; btn.style.boxShadow = '0 8px 0px rgba(0,0,0,0.15)'; });
    btn.addEventListener('mouseleave', () => { btn.style.transform = 'translateX(-50%) translateY(2px)'; btn.style.boxShadow = '0 6px 0px rgba(0,0,0,0.15)'; });
    btn.addEventListener('mousedown',  () => { btn.style.transform = 'translateX(-50%) translateY(8px)'; btn.style.boxShadow = '0 0px 0px rgba(0,0,0,0.15)'; });
    btn.addEventListener('mouseup',    () => { btn.style.transform = 'translateX(-50%) translateY(2px)'; btn.style.boxShadow = '0 6px 0px rgba(0,0,0,0.15)'; });
    btn.addEventListener('click', () => {
      btn.remove();
      this.scene.start('Lobby');
    });

    // Play win/lose sound
    this.time.delayedCall(300, () => { isMe ? sounds.win() : sounds.playerJoin(); });
  }

  _spawnConfetti(W, H) {
    const colors = [0xFF7043, 0xFFCA28, 0x66BB6A, 0x448AFF, 0x69F0AE];
    for (let i = 0; i < 80; i++) {
      const x = Phaser.Math.Between(0, W);
      const w = Phaser.Math.Between(6, 16);
      const h = Phaser.Math.Between(8, 20);
      const rect = this.add.rectangle(
        x, Phaser.Math.Between(-40, -10), w, h,
        Phaser.Utils.Array.GetRandom(colors)
      ).setAngle(Phaser.Math.Between(0, 360));

      const speed = Phaser.Math.Between(1600, 3800);
      this.tweens.add({
        targets: rect,
        y: H + 30,
        angle: rect.angle + Phaser.Math.Between(-270, 270),
        x: x + Phaser.Math.Between(-80, 80),
        duration: speed,
        delay: Phaser.Math.Between(0, 1500),
        ease: 'Linear',
        repeat: -1,
        onRepeat: () => {
          rect.x = Phaser.Math.Between(0, W);
          rect.y = -20;
        },
      });
    }
  }
}
