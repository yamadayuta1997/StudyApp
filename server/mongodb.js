const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.warn('[mongodb] MONGODB_URI が未設定です。MongoDB 機能は無効になります。');
}

let mongoClient = null;

async function connectMongo() {
  if (!MONGODB_URI) return null;
  if (mongoose.connection.readyState === 1) return mongoose;
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('[mongodb] 接続成功');
    mongoClient = mongoose;
    return mongoClient;
  } catch (e) {
    console.error('[mongodb] 接続失敗:', e.message);
    return null;
  }
}

module.exports = { connectMongo, isMongoEnabled: !!MONGODB_URI };
