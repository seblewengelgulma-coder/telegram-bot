const mongoose = require('mongoose');

const connectDB = async () => {
  const MONGO_URI = process.env.MONGO_URI;

  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not defined in environment variables!');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log('📦 Connected to MongoDB successfully!');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
};

const setupSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('⚡ Client connected via Socket.io:', socket.id);

    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);
    });
  });
};

module.exports = { connectDB, setupSocket };