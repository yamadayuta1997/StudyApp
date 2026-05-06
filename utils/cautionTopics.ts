import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'caution_topics_v1';
const STREAK_THRESHOLD = 3;

type TopicState = { streak: number; isCaution: boolean };
// key format: `${subject}::${topic}`
type CautionStorage = Record<string, TopicState>;

export type CautionTopic = { topic: string; subject: string; streak: number };

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

  for (const topic of wrongTopics) {
    const key = `${subject}::${topic}`;
    const current = storage[key] ?? { streak: 0, isCaution: false };
    const newStreak = current.streak + 1;
    storage[key] = { streak: newStreak, isCaution: newStreak >= STREAK_THRESHOLD };
  }

  for (const topic of correctTopics) {
    const key = `${subject}::${topic}`;
    if (storage[key]) {
      storage[key] = { streak: 0, isCaution: false };
    }
  }

  await writeStorage(storage);
  return extractCautionTopics(storage);
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
