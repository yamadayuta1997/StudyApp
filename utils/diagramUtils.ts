export type DiagramPage = {
  pageNum: number;
  text: string;
  isImage?: boolean;
  diagramDescription?: string;
};

/** テキスト量が threshold 未満のページを図解候補として返す */
export function detectImagePageNums(pages: DiagramPage[], textThreshold = 50): number[] {
  return pages
    .filter((p) => (p.text || '').trim().length < textThreshold)
    .map((p) => p.pageNum);
}

/** テキスト + 図解説明を結合して RAG 用コンテンツを生成する */
export function buildPageContent(page: DiagramPage, maxLen = 500): string {
  const base = (page.text || '').trim();
  const diag = page.diagramDescription ? `【図解】${page.diagramDescription.trim()}` : '';
  const combined = base && diag ? `${base}\n${diag}` : base || diag;
  return combined.slice(0, maxLen);
}

/** 図解情報を持つページが 1 件以上あるかを返す */
export function hasAnyDiagram(pages: DiagramPage[]): boolean {
  return pages.some((p) => p.isImage === true || !!p.diagramDescription);
}

/** 図解ページのみを抽出する */
export function filterDiagramPages(pages: DiagramPage[]): DiagramPage[] {
  return pages.filter((p) => p.isImage === true || !!p.diagramDescription);
}
