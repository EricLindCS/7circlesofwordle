const game = require('./dist/game.js');

if (typeof game.loadWordList === 'function') game.loadWordList();
console.log('Today (UTC date):', new Date().toISOString().slice(0,10));
console.log('Stage 1 (Hangman):', game.getTodayWord());
console.log('Stage 2 (Wordle):', game.getTodayWordStage2());

// If present, also show stage 4 first-5 letters for completeness
if (typeof game.getTodayWord7 === 'function') {
  console.log('Stage 4 (7-letter) first 5 letters:', game.getTodayWord7().slice(0,5));
}
