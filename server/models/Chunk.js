const mongoose = require('mongoose');

const ChunkSchema = new mongoose.Schema({
  textbookId: { type: String, required: true, index: true },
  subject:    { type: String, required: true },
  content:    { type: String, required: true },
  pageNum:    { type: Number, required: true },
  embedding:  { type: [Number], default: [] },
  createdAt:  { type: Date, default: Date.now },
});

ChunkSchema.index({ textbookId: 1, pageNum: 1 });

module.exports = mongoose.models.Chunk || mongoose.model('Chunk', ChunkSchema);
