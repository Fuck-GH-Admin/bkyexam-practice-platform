export type QuestionType =
  | 'fill_blank'
  | 'single_choice'
  | 'multiple_choice'
  | 'yes_no'
  | 'office_operation'
  | 'programming'
  | 'essay'
  | 'reading'
  | 'cloze'
  | 'operation'
  | 'short_answer'
  | 'ai'
  | 'unknown';

export function normalizeQType(qType: number): QuestionType {
  switch (qType) {
    case 0:
      return 'fill_blank';
    case 1:
      return 'single_choice';
    case 2:
      return 'multiple_choice';
    case 3:
      return 'yes_no';
    case 4:
      return 'office_operation';
    case 5:
      return 'programming';
    case 10:
      return 'essay';
    case 40:
    case 45:
      return 'reading';
    case 47:
      return 'cloze';
    case 48:
    case 49:
      return 'operation';
    case 50:
      return 'short_answer';
    case 70:
    case 72:
      return 'ai';
    default:
      return 'unknown';
  }
}
