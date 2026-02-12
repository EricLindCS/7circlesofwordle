const game = require('./dist/game.js');

if (typeof game.loadWordList === 'function') game.loadWordList();
console.log('Today (UTC date):', new Date().toISOString().slice(0,10));
if (typeof game.getTodayWord === 'function') console.log('Stage 1 (Hangman):', game.getTodayWord());
if (typeof game.getTodayWordStage2 === 'function') console.log('Stage 2 (Wordle):', game.getTodayWordStage2());
if (typeof game.getTodayWordStage3 === 'function') console.log('Stage 3 (Anagram):', game.getTodayWordStage3());
if (typeof game.getTodayWordStage4 === 'function') console.log('Stage 4 (Wordle):', game.getTodayWordStage4());
if (typeof game.getTodayWordStage6 === 'function') console.log('Stage 6 (6-letter):', game.getTodayWordStage6());
if (typeof game.getTodayWord7 === 'function') console.log('Stage 7 (7-letter) first 5 letters:', game.getTodayWord7().slice(0,5));
