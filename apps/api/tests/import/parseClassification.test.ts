import { describe, expect, it } from 'vitest';
import { parseClassificationLine } from '../../src/import/parseClassification';

describe('parseClassificationLine', () => {
  it('parses an active classification line', () => {
    expect(parseClassificationLine('abbd9a75-0214-4f01-ad64-f1fdda8a7753|单选题|1431958d-fd83-4e4e-8254-5ea78cb5af3c|0|0|False')).toEqual({
      id: 'abbd9a75-0214-4f01-ad64-f1fdda8a7753',
      name: '单选题',
      parentId: '1431958d-fd83-4e4e-8254-5ea78cb5af3c',
      qGroup: 0,
      sort: 0,
      isDeleted: false,
    });
  });

  it('converts root parent IDs to null', () => {
    expect(parseClassificationLine('abbd9a75-0214-4f01-ad64-f1fdda8a7753|根|00000000-0000-0000-0000-000000000000|0|0|False')).toMatchObject({
      parentId: null,
    });
  });

  it('strips a leading UTF-8 BOM from classification IDs', () => {
    expect(parseClassificationLine('\uFEFFabbd9a75-0214-4f01-ad64-f1fdda8a7753|单选题|1431958d-fd83-4e4e-8254-5ea78cb5af3c|0|0|False')).toMatchObject({
      id: 'abbd9a75-0214-4f01-ad64-f1fdda8a7753',
    });
  });

  it('throws on invalid numeric fields', () => {
    expect(() => parseClassificationLine('abbd9a75-0214-4f01-ad64-f1fdda8a7753|单选题|1431958d-fd83-4e4e-8254-5ea78cb5af3c|x|0|False')).toThrow(
      /Invalid classification qGroup/,
    );
    expect(() => parseClassificationLine('abbd9a75-0214-4f01-ad64-f1fdda8a7753|单选题|1431958d-fd83-4e4e-8254-5ea78cb5af3c|0|x|False')).toThrow(
      /Invalid classification sort/,
    );
  });

  it('throws on invalid boolean fields', () => {
    expect(() => parseClassificationLine('abbd9a75-0214-4f01-ad64-f1fdda8a7753|单选题|1431958d-fd83-4e4e-8254-5ea78cb5af3c|0|0|yes')).toThrow(
      /Invalid classification isDeleted/,
    );
  });
});
