import { z } from 'zod';

export const ApiContractVersionV1 = 'v1' as const;

export const CanonicalUuidV1Schema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  'Expected a lowercase canonical UUID',
);

export const CaseInsensitiveUuidV1Schema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'Expected a UUID',
);

export const OpaqueOptionIdV1Schema = z.string().min(1);

export const SubmittedAnswerV1Schema = z.union([
  z.array(OpaqueOptionIdV1Schema),
  z.boolean(),
  z.string(),
]);
export type SubmittedAnswerV1 = z.infer<typeof SubmittedAnswerV1Schema>;

export const CorrectAnswerV1Schema = SubmittedAnswerV1Schema;
export type CorrectAnswerV1 = z.infer<typeof CorrectAnswerV1Schema>;
