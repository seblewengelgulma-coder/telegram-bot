const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  assignedAdminId: { type: Number, default: null },
  userName: { type: String },
  type: { type: String, required: true },
  amount: { type: Number, required: true },
  details: { type: String, required: true },
  photoUniqueId: { type: String, unique: true, sparse: true }, 
  photoId: { type: String, sparse: true }, 
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Request', requestSchema);