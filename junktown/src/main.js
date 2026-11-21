import './style.css';
import { Game } from './game.js';

const game = new Game(document.getElementById('game'), document.getElementById('ui'));
// handy for testing from the browser console
window.game = game;
