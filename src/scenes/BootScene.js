// src/scenes/BootScene.js
// Preloads all assets and shows a progress bar.

import Phaser from 'phaser';
import { createDeck } from '../uno-engine.js';

export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const W = this.scale.width, H = this.scale.height;

    // ── Progress bar ─────────────────────────────────────
    const barBg  = this.add.rectangle(W/2, H/2, 420, 18, 0x16213e).setDepth(10);
    const bar    = this.add.rectangle(W/2 - 210 + 1, H/2, 2, 16, 0xe94560).setDepth(11).setOrigin(0, 0.5);
    const logo   = this.add.text(W/2, H/2 - 60, 'UNO', {
      fontFamily: 'Nunito', fontSize: '96px', fontStyle: 'bold 900',
      color: '#e94560', stroke: '#fff', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(10);
    const label  = this.add.text(W/2, H/2 + 40, 'Loading…', {
      fontFamily: 'Nunito', fontSize: '18px', color: '#7f8c8d',
    }).setOrigin(0.5).setDepth(10);

    this.load.on('progress', v => {
      bar.width = Math.max(2, 418 * v);
      label.setText(`Loading… ${Math.floor(v * 100)}%`);
    });

    // ── Card Textures ─────────────
    // Load No Mercy card images
    const allCards = createDeck();
    for (const card of allCards) {
      // The images are in public/Uno_No_Mercy_Cards/
      this.load.image(card.id, `Uno_No_Mercy_Cards/${card.id}.png`);
    }

    // Card back fallback (we will use a generated texture or load one if available)
    // We'll generate a card back in create()

    // ── Sounds (using Phaser's audio — web audio tones as fallback) ─────
    // Real sound files go in public/assets/sounds/ — we'll add silent fallback.
  }

  create() {
    this.generateCardBack();
    this.generateTableTexture();
    this.scene.start('Lobby');
  }

  // ── Procedural Card Textures ─────────────────────────────
  // Draws cards directly to Phaser's texture cache using Canvas 2D API.

  generateCardBack() {
    const W = 90, H = 130, R = 8;
    // Card back (Voxel style)
    if (!this.textures.exists('card-back')) {
      try {
        const gfx = this.make.graphics({ add: false });
        
        // Shadow
        gfx.fillStyle(0x000000, 0.15);
        this.roundRect(gfx, 0, 10, W, H, R);
        
        // Side/Thickness
        gfx.fillStyle(0x263238);
        this.roundRect(gfx, 0, 5, W, H, R);
        
        // Top Face (Charcoal)
        gfx.fillStyle(0x37474F);
        this.roundRect(gfx, 0, 0, W, H, R);
        
        // Inner Blocky Pattern
        gfx.fillStyle(0xE8F0FE, 0.9); // Primary color inner
        this.roundRect(gfx, 10, 10, W-20, H-20, R-4);
        
        // Inner Red Block (Logo stand-in)
        gfx.fillStyle(0xFF7043);
        this.roundRect(gfx, 20, 35, W-40, H-70, R-6);
        
        gfx.lineStyle(2, 0xffffff, 0.3);
        this.strokeRoundRect(gfx, 0, 0, W, H, R);
        
        gfx.generateTexture('card-back', W, H + 12);
        gfx.destroy();
      } catch (e) {
        if (!(e.message && e.message.includes('Texture key already in use'))) {
          throw e;
        }
      }
    }
  }

  generateTableTexture() {
    if (this.textures.exists('table')) return;
    const gfx = this.make.graphics({ add: false });
    // Use the primary background color #E8F0FE
    gfx.fillStyle(0xE8F0FE);
    gfx.fillRect(0, 0, 400, 400);
    // Draw a subtle grid to emphasize isometric/voxel gamified feel
    gfx.lineStyle(1, 0x448AFF, 0.05); // using neutral Cube Blue with low alpha
    for (let i = 0; i < 400; i += 40) {
      gfx.moveTo(i, 0);
      gfx.lineTo(i, 400);
      gfx.moveTo(0, i);
      gfx.lineTo(400, i);
    }
    gfx.strokePath();
    gfx.generateTexture('table', 400, 400);
    gfx.destroy();
  }

  buildCardList() {
    return createDeck();
  }

  roundRect(gfx, x, y, w, h, r) {
    gfx.fillRoundedRect(x, y, w, h, r);
  }

  strokeRoundRect(gfx, x, y, w, h, r) {
    gfx.strokeRoundedRect(x, y, w, h, r);
  }
}
