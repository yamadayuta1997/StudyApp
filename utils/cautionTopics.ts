import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'caution_topics_v1';
const STREAK_THRESHOLD = 3;

type TopicState = { streak: number; isCaution: boolean; lastReviewed?: string };
// key format: `${subject}::${topic}`
type CautionStorage = Record<string, TopicState>;

export type CautionTopic = {
  topic: string;
  subject: string;
  streak: number;
  lastReviewed?: string;
  daysSinceReview?: number | null;
};

async function readStorage(): Promise<CautionStorage> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeStorage(data: CautionStorage): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore write errors — non-critical
  }
}

// Update streak states and return current caution topics.
// wrongTopics: topics the student got wrong this session.
// correctTopics: topics the student answered correctly this session.
export async function updateCautionTopics(
  wrongTopics: string[],
  correctTopics: string[],
  subject: string
): Promise<CautionTopic[]> {
  const storage = await readStorage();
  const todayStr = new Date().toISOString().slice(0, 10);

  for (const topic of wrongTopics) {
    const key = `${subject}::${topic}`;
    const current = storage[key] ?? { streak: 0, isCaution: false };
    const newStreak = current.streak + 1;
    storage[key] = { streak: newStreak, isCaution: newStreak >= STREAK_THRESHOLD, lastReviewed: todayStr };
  }

  for (const topic of correctTopics) {
    const key = `${subject}::${topic}`;
    if (storage[key]) {
      storage[key] = { streak: 0, isCaution: false, lastReviewed: todayStr };
    }
  }

  await writeStorage(storage);
  return extractCautionTopics(storage);
}

export async function getOverdueReviewTopics(daysThreshold = 3): Promise<CautionTopic[]> {
  const storage = await readStorage();
  const now = new Date();
  // Use UTC midnight to match the UTC date strings stored by updateCautionTopics
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Object.entries(storage)
    .filter(([, state]) => {
      if (!state.isCaution) return false;
      if (!state.lastReviewed) return true;
      const diffDays = Math.floor((todayUTC - new Date(state.lastReviewed).getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= daysThreshold;
    })
    .map(([key, state]) => {
      const sep = key.indexOf('::');
      const subject = key.slice(0, sep);
      const topic = key.slice(sep + 2);
      const daysSinceReview = state.lastReviewed
        ? Math.floor((todayUTC - new Date(state.lastReviewed).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return { subject, topic, streak: state.streak, lastReviewed: state.lastReviewed, daysSinceReview };
    })
    .sort((a, b) => (b.daysSinceReview ?? 999) - (a.daysSinceReview ?? 999));
}

export async function getCautionTopics(): Promise<CautionTopic[]> {
  const storage = await readStorage();
  return extractCautionTopics(storage);
}

function extractCautionTopics(storage: CautionStorage): CautionTopic[] {
  return Object.entries(storage)
    .filter(([, state]) => state.isCaution)
    .map(([key, state]) => {
      const sep = key.indexOf('::');
      const subject = key.slice(0, sep);
      const topic = key.slice(sep + 2);
      return { subject, topic, streak: state.streak };
    })
    .sort((a, b) => b.streak - a.streak);
}
