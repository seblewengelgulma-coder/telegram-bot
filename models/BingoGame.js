const mongoose = require('mongoose');

const bingoGameSchema = new mongoose.Schema({
  gameId: { type: String, required: true, unique: true },
  cost: { type: Number, required: true },
  status: { type: String, default: 'waiting' }, 
  players: { type: Array, default: [] }
});

module.exports = mongoose.model('BingoGame', bingoGameSchema);