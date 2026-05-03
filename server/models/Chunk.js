const mongoose = require('mongoose');

const ChunkSchema = new mongoose.Schema({
  textbookId:         { type: String, required: true, index: true },
  subject:            { type: String, required: true },
  content:            { type: String, required: true },
  pageNum:            { type: Number, required: true },
  embedding:          { type: [Number], default: [] },
  isImage:            { type: Boolean, default: false },
  diagramDescription: String,
  topicName:          { type: String, default: '' },
  importance:         { type: Number, default: 1, min: 1, max: 3 },
  chunkIndex:         { type: Number, default: 0 },
  createdAt:          { type: Date, default: Date.now },
});

ChunkSchema.index({ textbookId: 1, pageNum: 1 });
ChunkSchema.index({ textbookId: 1, topicName: 1 });

module.exports = mongoose.models.Chunk || mongoose.model('Chunk', ChunkSchema);
