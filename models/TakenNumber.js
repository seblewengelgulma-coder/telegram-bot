const mongoose = require('mongoose');

const takenNumberSchema = new mongoose.Schema({
  gameId: { type: String, required: true },
  number: { type: Number, required: true },
  userId: { type: Number, required: true },
  userName: { type: String }
});

takenNumberSchema.index({ gameId: 1, number: 1 }, { unique: true });

module.exports = mongoose.model('TakenNumber', takenNumberSchema);