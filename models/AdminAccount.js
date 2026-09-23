const mongoose = require('mongoose');

const adminAccountSchema = new mongoose.Schema({
  adminId: { type: Number, required: true, unique: true },
  adminName: { type: String, required: true },
  telebirr: { type: String, required: true },
  cbeAccount: { type: String, required: true },
  isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('AdminAccount', adminAccountSchema);