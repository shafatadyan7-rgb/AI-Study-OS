export interface GraphSourceChunk {
  chunkId: string;
  chapterId: string | null;
  chapterTitle: string | null;
  section: string | null;
  pageNumber: number;
  text: string;
  sourceType: string;
}

export interface KnowledgeNode {
  id: string;
  label: string;
  kind: 'chapter' | 'section' | 'concept';
  chapterId: string | null;
  /** Pages this node is actually attested on. Never synthesised. */
  pages: number[];
  chunkIds: string[];
}

export interface KnowledgeEdge {
  from: string;
  to: string;
  kind: 'contains' | 'co_occurs';
  /** How many chunks support this edge. Edges below MIN_SUPPORT are dropped. */
  weight: number;
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

const MIN_CO_OCCURRENCE = 2;
const MAX_CONCEPTS_PER_SECTION = 8;

/**
 * Terms introduced by a definition pattern. We only treat something as a concept
 * when the textbook itself marks it as one — "X is defined as", "X বলা হয়".
 * Extracting arbitrary noun phrases would manufacture concepts the book never
 * taught, and every downstream mastery number would then be about a fiction.
 */
const DEFINITION_PATTERNS: RegExp[] = [
  /\b([A-Z][a-zA-Z\s]{2,40}?)\s+is\s+defined\s+as\b/g,
  /\b([A-Z][a-zA-Z\s]{2,40}?)\s+is\s+the\s+rate\s+of\b/g,
  /\b([A-Z][a-zA-Z\s]{2,40}?)\s+refers\s+to\b/g,
  /\b([A-Z][a-zA-Z\s]{2,40}?)\s+means\s+that\b/g,
  /([\u0980-\u09FF\s]{2,40}?)\s*(?:কে|বলা\s*হয়|সংজ্ঞা)/g,
];

const STOPWORD_HEADS = new Set(['the', 'this', 'that', 'it', 'there', 'these', 'those', 'a', 'an']);

function normaliseTerm(raw: string): string | null {
  const term = raw.trim().replace(/\s+/g, ' ').replace(/^(the|a|an)\s+/i, '');
  if (term.length < 3 || term.length > 40) return null;
  const head = term.split(' ')[0]?.toLowerCase() ?? '';
  if (STOPWORD_HEADS.has(head)) return null;
  // Reject fragments that are mostly punctuation or digits.
  if (!/[a-zA-Z\u0980-\u09FF]{3}/.test(term)) return null;
  return term;
}

export function extractConcepts(text: string): string[] {
  const found = new Set<string>();
  for (const re of DEFINITION_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const term = normaliseTerm(m[1] ?? '');
      if (term) found.add(term);
    }
  }
  return [...found];
}

function nodeId(kind: string, key: string): string {
  return `${kind}:${key.toLowerCase().replace(/\s+/g, '-').slice(0, 60)}`;
}

/**
 * Build a graph from a textbook's real structure.
 *
 * Hierarchy edges ("contains") come from the document's own chapter/section
 * nesting. Lateral edges ("co_occurs") come from concepts genuinely appearing in
 * the same chunk, and only when that happens at least MIN_CO_OCCURRENCE times —
 * a single incidental mention is not a relationship.
 */
export function buildKnowledgeGraph(chunks: GraphSourceChunk[]): KnowledgeGraph {
  const nodes = new Map<string, KnowledgeNode>();
  const edgeWeights = new Map<string, KnowledgeEdge>();

  const upsert = (
    id: string, label: string, kind: KnowledgeNode['kind'],
    chapterId: string | null, page: number, chunkId: string,
  ) => {
    const existing = nodes.get(id);
    if (existing) {
      if (!existing.pages.includes(page)) existing.pages.push(page);
      if (!existing.chunkIds.includes(chunkId)) existing.chunkIds.push(chunkId);
      return;
    }
    nodes.set(id, { id, label, kind, chapterId, pages: [page], chunkIds: [chunkId] });
  };

  const addEdge = (from: string, to: string, kind: KnowledgeEdge['kind']) => {
    if (from === to) return;
    const key = `${kind}|${from}|${to}`;
    const existing = edgeWeights.get(key);
    if (existing) existing.weight += 1;
    else edgeWeights.set(key, { from, to, kind, weight: 1 });
  };

  const conceptsPerSection = new Map<string, Set<string>>();

  for (const chunk of chunks) {
    const chapterKey = chunk.chapterTitle ?? chunk.chapterId ?? 'unstructured';
    const chapterNodeId = nodeId('chapter', chapterKey);
    upsert(chapterNodeId, chunk.chapterTitle ?? 'Unstructured', 'chapter', chunk.chapterId, chunk.pageNumber, chunk.chunkId);

    let parentId = chapterNodeId;
    if (chunk.section) {
      const sectionNodeId = nodeId('section', `${chapterKey}-${chunk.section}`);
      upsert(sectionNodeId, chunk.section, 'section', chunk.chapterId, chunk.pageNumber, chunk.chunkId);
      addEdge(chapterNodeId, sectionNodeId, 'contains');
      parentId = sectionNodeId;
    }

    const concepts = extractConcepts(chunk.text);
    const bucket = conceptsPerSection.get(parentId) ?? new Set<string>();

    const conceptIds: string[] = [];
    for (const concept of concepts) {
      if (bucket.size >= MAX_CONCEPTS_PER_SECTION && !bucket.has(concept)) continue;
      bucket.add(concept);
      const id = nodeId('concept', concept);
      upsert(id, concept, 'concept', chunk.chapterId, chunk.pageNumber, chunk.chunkId);
      addEdge(parentId, id, 'contains');
      conceptIds.push(id);
    }
    conceptsPerSection.set(parentId, bucket);

    // Concepts defined in the same chunk are genuinely adjacent in the book.
    for (let i = 0; i < conceptIds.length; i++) {
      for (let j = i + 1; j < conceptIds.length; j++) {
        const [a, b] = [conceptIds[i]!, conceptIds[j]!].sort();
        addEdge(a!, b!, 'co_occurs');
      }
    }
  }

  const edges = [...edgeWeights.values()].filter(
    (e) => e.kind === 'contains' || e.weight >= MIN_CO_OCCURRENCE,
  );

  // Drop nodes left with no edges — an isolated node carries no graph meaning.
  const connected = new Set<string>();
  for (const e of edges) { connected.add(e.from); connected.add(e.to); }

  return {
    nodes: [...nodes.values()].filter((n) => connected.has(n.id) || n.kind === 'chapter'),
    edges,
  };
}
