// Game state structure definitions and initial state creator

import { ActionTypes } from './actionTypes.js';
import { COLORS } from '../uno-engine.js';

// Define card shape
/**
 * @typedef {Object} Card
 * @property {'red'|'yellow'|'green'|'blue'|'wild'} color
 * @property {string} value // '0'-'9', 'skip', 'reverse', 'draw2', 'wild', 'wild-draw4'
 * @property {string} id    // unique identifier
 */

/**
 * Player state
 * @typedef {Object} PlayerState
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {Card[]} hand
 * @property {boolean} unoCalled
 * @property {boolean} wildDrawFourChallenged // whether this player has been challenged for Wild Draw Four this turn
 */

/**
 * Deck state
 * @typedef {Object} DeckState
 * @property {Card[]} drawPile
 * @property {Card[]} discardPile
 */

/**
 * Turn state
 * @typedef {Object} TurnState
 * @property {string} currentPlayerId
 * @property {1|-1} direction // 1 = clockwise, -1 = counter-clockwise
 * @property {'DRAW'|'PLAY'|'CHOOSE_COLOR'|'CHOOSE_SWAP_PLAYER'|'RESOLVE_DRAW'|'UNO_WINDOW'|'GAME_OVER'} phase
 */

/**
 * Pending draw state (from stacking penalties)
 * @typedef {Object|null} PendingDrawState
 * @property {number} amount
 * @property {'draw2'|'wild4'} type
 * @property {string|null} sourcePlayerId
 */

/**
 * UNO window state
 * @typedef {Object} UnoWindowState
 * @property {boolean} active
 * @property {boolean} expiresOnAction // true = expires when next player acts (no timer)
 */

/**
 * Game status
 * @typedef {Object} GameStatus
 * @property {string|null} winnerId
 * @property {boolean} isOver
 */

/**
 * Full game state
 * @typedef {Object} GameState
 * @property {{[playerId]: PlayerState}} players
 * @property {DeckState} deck
 * @property {TurnState} turn
 * @property {PendingDrawState|null} pendingDraw
 * @property {UnoWindowState} unoWindow
 * @property {GameStatus} status
 * @property {Object[]} history // array of {action, playerId, timestamp}
 * @property {Object} rules // configuration object
 */

/**
 * Create initial game state
 * @param {string[]} playerIds - array of player IDs
 * @param {{name:string, color:string}[]} playerInfos - optional array of player info objects
 * @param {Object} rulesConfig - rules configuration (official + variants)
 * @returns {GameState}
 */
export function createInitialState(playerIds, playerInfos = [], rulesConfig = {}) {
  // Initialize players
  const players = {};
  playerIds.forEach((id, index) => {
    const info = playerInfos[index] || { name: `Player${index + 1}`, color: '' };
    players[id] = {
      id,
      name: info.name || `Player${index + 1}`,
      color: info.color || '',
      hand: [],
      unoCalled: false,
      wildDrawFourChallenged: false
    };
  });

  // Deck will be initialized separately (maybe via action)
  // We'll start with empty decks; a INIT_DECK action will fill them.
  const deck = {
    drawPile: [],
    discardPile: []
  };

  const turn = {
    currentPlayerId: playerIds[0] || null,
    direction: 1,
    phase: 'DRAW' // start with draw phase (could also be dealing)
  };

  const pendingDraw = null;

  const unoWindow = {
    active: false,
    expiresOnAction: true // default to expires when next player acts
  };

  const status = {
    winnerId: null,
    isOver: false
  };

  const history = [];

  const rules = {
    official: {
      challengeWildDrawFour: true,
      mustCallUno: true,
      reshuffleDiscard: true,
      reverseIsSkipWithTwo: true,
      drawTwoOnFirstTurn: true
    },
    variants: {
      stacking: {
        enabled: true,
        allowDraw2OnDraw2: true,
        allowWild4OnWild4: true,
        allowMixed: false
      },
      jumpIn: {
        enabled: true,
        requireExactMatch: true
      },
      sevenZero: {
        enabled: true,
        sevenSwapsHand: true,
        zeroRotatesHands: true,
        preserveCardOrder: true
      },
      unoChallengeWindow: {
        type: 'nextPlayerAction'
      },
      drawUntilPlayable: {
        enabled: true,
        maxReshuffles: 3
      },
      progressiveStacking: {
        enabled: false,
        increment: 2
      },
      maxCardsElimination: {
        enabled: true,
        maxCards: 25
      }
    },
    ...rulesConfig // allow override
  };

  return {
    players,
    deck,
    turn,
    pendingDraw,
    unoWindow,
    status,
    history,
    rules
  };
}

// Reducer placeholder - will be implemented in gameReducer.js
export const UNO_REDUCER = Symbol('UNO_REDUCER');