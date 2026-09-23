const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  userName: { type: String },
  phone: { type: String, default: null },
  balance: { type: Number, default: 0 },
  assignedAdminId: { type: Number, default: null },
  referredBy: { type: Number, default: null },
  hasReceivedBonus: { type: Boolean, default: false },
  totalGames: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  dailyWins: { type: Number, default: 0 },
  weeklyWins: { type: Number, default: 0 },
  qualifiedDays: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  level: { type: Number, default: 1 }
});

module.exports = mongoose.model('User', userSchema);