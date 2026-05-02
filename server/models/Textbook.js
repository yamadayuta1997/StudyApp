const mongoose = require('mongoose');

const TextbookSchema = new mongoose.Schema({
  textbookId:      { type: String, required: true, unique: true, index: true },
  title:           { type: String, required: true },
  subject:         { type: String, required: true },
  pages:           [{
    pageNum:            Number,
    text:               String,
    isImage:            { type: Boolean, default: false },
    diagramDescription: String,
  }],
  totalPages:      { type: Number, default: 0 },
  diagramPageNums: [Number],
  pdfStorageUrl:   String,
  createdAt:       { type: Date, default: Date.now },
});

module.exports = mongoose.models.Textbook || mongoose.model('Textbook', TextbookSchema);
