const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    amount: { type: Number, required: true },
    // txHash ወይም transactionId ይደገም እንዳይሆን unique: true እናደርጋለን
    transactionId: { 
        type: String, 
        required: true, 
        unique: true // 👈 1. በዳታቤዝ ደረጃ መደገምን ይከለክላል
    },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Deposit', depositSchema);