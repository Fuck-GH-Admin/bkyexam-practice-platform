export type NormalizedAnswer =
  | { kind: 'option_ids'; value: string[] }
  | { kind: 'yes_no'; value: boolean }
  | { kind: 'raw'; value: string };

const YES_ID = '11111111-1111-1111-1111-111111111111';
const NO_ID = '22222222-2222-2222-2222-222222222222';

export function normalizeAnswer(qType: number, answerRaw: string): NormalizedAnswer {
  if (qType === 1 || qType === 2) {
    return {
      kind: 'option_ids',
      value: answerRaw
        .split(',')
        .map((answer) => answer.trim())
        .filter(Boolean),
    };
  }

  if (qType === 3) {
    if (answerRaw === YES_ID) {
      return { kind: 'yes_no', value: true };
    }

    if (answerRaw === NO_ID) {
      return { kind: 'yes_no', value: false };
    }
  }

  return { kind: 'raw', value: answerRaw };
}
