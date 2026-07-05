export type BankMappingInput = {
  id: string;
  name: string;
  parentId: string | null;
  qGroup: number;
  level: number;
  questionCount: number;
  descendantQuestionCount: number;
};

export type BankMapping = {
  bankId: string;
  subjectCategory: '社科' | '信息技术' | '英语' | '其他';
  subjectName: string;
  bankName: string;
  rawName: string;
  parentId: string | null;
  qGroup: number;
  visible: boolean;
  status: 'active' | 'hidden';
  difficulty: 'unknown';
  examPurpose: string;
  questionTypes: string[];
  audience: string;
  keywords: string[];
  description: string;
  notes: string;
  questionCount: number;
  descendantQuestionCount: number;
};

const SOCIAL_QGROUPS = new Set([200, 201, 202, 203, 204]);
const TECH_QGROUPS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 20, 30, 66]);
const ENGLISH_QGROUPS = new Set([97, 82]);

const STRUCTURAL_NAME_PATTERNS = [
  /^(单选题|多选题|判断题|填空题|编程题|基本操作|综合应用|测试|考试2)$/,
  /^第\d+章$/,
  /^Unit\s*\d+$/i,
  /^Passage\s*\d+$/i,
  /^Conversation\s+(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d+)$/i,
];

export function generateBankMapping(input: BankMappingInput): BankMapping {
  const subjectCategory = getSubjectCategory(input.qGroup);
  const subjectName = getSubjectName(input.name, input.qGroup, subjectCategory);
  const structural = isStructuralNode(input.name);
  const hasQuestions = input.questionCount > 0 || input.descendantQuestionCount > 0;
  const visible = !structural && hasQuestions;

  return {
    bankId: input.id,
    subjectCategory,
    subjectName,
    bankName: input.name,
    rawName: input.name,
    parentId: input.parentId,
    qGroup: input.qGroup,
    visible,
    status: visible ? 'active' : 'hidden',
    difficulty: 'unknown',
    examPurpose: getExamPurpose(input.name),
    questionTypes: [],
    audience: input.name.includes('零基础') ? 'beginner' : 'unknown',
    keywords: getKeywords(input.name, subjectName, subjectCategory, input.qGroup),
    description: `${subjectName}题库自动映射`,
    notes: '',
    questionCount: input.questionCount,
    descendantQuestionCount: input.descendantQuestionCount,
  };
}

function getSubjectCategory(qGroup: number): BankMapping['subjectCategory'] {
  if (SOCIAL_QGROUPS.has(qGroup)) return '社科';
  if (TECH_QGROUPS.has(qGroup)) return '信息技术';
  if (ENGLISH_QGROUPS.has(qGroup)) return '英语';
  return '其他';
}

function getSubjectName(name: string, qGroup: number, category: BankMapping['subjectCategory']): string {
  if (qGroup === 66 || name.includes('Python')) return 'Python';
  if (name.includes('C++') || qGroup === 8) return 'C++';
  if (qGroup === 7 || name.includes('C语言') || name.includes('C程序')) return 'C语言';
  if (qGroup === 1 || name.includes('Excel')) return 'Excel';
  if (qGroup === 2 || name.includes('PPT') || name.includes('PowerPoint')) return 'PowerPoint';
  if (qGroup === 0 || name.includes('Office') || name.includes('Word') || name.includes('计算机基础')) {
    if (name.includes('Word')) return 'Word';
    if (name.includes('计算机基础')) return '计算机基础';
    return 'Office';
  }
  if (qGroup === 97 || qGroup === 82) {
    if (name.includes('高级英语')) return '高级英语';
    if (name.includes('四级')) return '大学英语四级';
    return '大学英语';
  }
  if (qGroup === 201) return '思想道德与法治';
  if (qGroup === 200) return name.includes('中国近现代史') ? '中国近现代史纲要' : '社科';
  if (qGroup === 204) return '习近平新时代中国特色社会主义思想概论';
  return category;
}

function isStructuralNode(name: string): boolean {
  const normalized = name.trim();
  return STRUCTURAL_NAME_PATTERNS.some((pattern) => pattern.test(normalized));
}

function getExamPurpose(name: string): string {
  for (const purpose of ['期末', '补考', '等级', '竞赛', '机考']) {
    if (name.includes(purpose)) return purpose;
  }
  return 'unknown';
}

function getKeywords(
  name: string,
  subjectName: string,
  category: BankMapping['subjectCategory'],
  qGroup: number,
): string[] {
  const keywords = [subjectName, category, String(qGroup)];
  keywords.push(...Array.from(name.matchAll(/20\d{2}/g), (match) => match[0]));

  for (const word of [
    'Python',
    'C++',
    'C语言',
    'C程序',
    'Excel',
    'PPT',
    'PowerPoint',
    'Office',
    'Word',
    '计算机基础',
    '高级英语',
    '四级',
    '大学英语',
    '中国近现代史',
    '思想道德与法治',
    '习近平新时代中国特色社会主义思想概论',
  ]) {
    if (name.includes(word)) keywords.push(word);
  }

  return Array.from(new Set(keywords.filter(Boolean)));
}
