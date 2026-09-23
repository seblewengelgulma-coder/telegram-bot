const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  assignedAdminId: { type: Number, default: null },
  userName: { type: String },
  message: { type: String, required: true },
  photoId: { type: String, default: null },
  adminReply: { type: String, default: null },
  adminPhotoId: { type: String, default: null },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Comment', commentSchema);