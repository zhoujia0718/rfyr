const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  openid: {
    type: String,
    unique: true,
    required: true
  },
  nickname: {
    type: String
  },
  avatar: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);
