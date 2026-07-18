// src/main.js — Entry point
import Phaser from 'phaser';
import BootScene   from './scenes/BootScene.js';
import LobbyScene  from './scenes/LobbyScene.js';
import GameScene   from './scenes/GameScene.js';
import EndScene    from './scenes/EndScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 1280,
  height: 720,
  backgroundColor: '#E8F0FE',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, LobbyScene, GameScene, EndScene],
};

const game = new Phaser.Game(config);
export default game;
