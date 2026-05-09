type Feedback = { priority: number; type: string; point: string; color: string };

export type ShareAnswerParams = {
  subject: string;
  summary: string;
  result: string;
};

export type ShareCompareParams = {
  subject: string;
  score: number;
  passed: boolean;
  feedbacks: Feedback[];
};

export function buildAnswerShareText({ subject, summary, result }: ShareAnswerParams): string {
  const lines: string[] = [];
  lines.push(`【CPA採点結果】${subject}`);
  if (summary) {
    lines.push('');
    lines.push(`📝 解説まとめ\n${summary}`);
  }
  const plainResult = result.replace(/#{1,6}\s*/g, '').replace(/\*\*/g, '').trim();
  if (plainResult) {
    lines.push('');
    lines.push(`📊 採点結果\n${plainResult}`);
  }
  lines.push('');
  lines.push('#CPA試験 #答案採点');
  return lines.join('\n');
}

export function buildCompareShareText({ subject, score, passed, feedbacks }: ShareCompareParams): string {
  const lines: string[] = [];
  lines.push(`【CPA比較添削】${subject}`);
  lines.push('');
  lines.push(`スコア: ${score}点　${passed ? '✅ 合格ライン達成' : '❌ 合格ライン未達'}`);
  const topFeedbacks = feedbacks.slice(0, 3);
  if (topFeedbacks.length > 0) {
    lines.push('');
    lines.push('主な指摘:');
    topFeedbacks.forEach(fb => {
      lines.push(`• [${fb.type}] ${fb.point}`);
    });
  }
  lines.push('');
  lines.push('#CPA試験 #比較添削');
  return lines.join('\n');
}
