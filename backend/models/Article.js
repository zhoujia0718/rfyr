const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  subCategory: {
    type: String
  },
  author: {
    type: String
  },
  date: {
    type: Date,
    default: Date.now
  },
  readCount: {
    type: Number,
    default: 0
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  requiresMembership: {
    type: Boolean,
    default: false
  },
  pdfUrl: {
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

module.exports = mongoose.model('Article', articleSchema);
