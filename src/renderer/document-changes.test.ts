import { describe, expect, it, vi } from 'vitest';

import { captureDocumentSnapshot, isDocumentDirty } from './document-changes';

const createModel = (initialContents: string) => {
  let contents = initialContents;
  let alternativeVersionId = 1;
  const model = {
    getAlternativeVersionId: vi.fn(() => alternativeVersionId),
    getValue: vi.fn(() => contents),
    getValueLength: vi.fn(() => contents.length),
  };

  const edit = (value: string, version = alternativeVersionId + 1): void => {
    contents = value;
    alternativeVersionId = version;
  };

  return { edit, model };
};

describe('document changes', () => {
  it('captures the current model contents and version', () => {
    const { edit, model } = createModel('');
    edit('first line\nsecond line');

    expect(captureDocumentSnapshot(model)).toEqual({
      alternativeVersionId: 2,
      contents: 'first line\nsecond line',
    });
  });

  it.each(['', 'saved text'])('starts clean for %j without rereading contents', (contents) => {
    const { model } = createModel(contents);
    const savedSnapshot = captureDocumentSnapshot(model);
    model.getValue.mockClear();

    expect(isDocumentDirty(model, savedSnapshot)).toBe(false);
    expect(model.getValue).not.toHaveBeenCalled();
    expect(model.getValueLength).not.toHaveBeenCalled();
  });

  it('becomes clean after typing in a new document and deleting all text', () => {
    const { edit, model } = createModel('');
    const savedSnapshot = captureDocumentSnapshot(model);

    edit('temporary text');
    expect(isDocumentDirty(model, savedSnapshot)).toBe(true);

    edit('');
    expect(model.getAlternativeVersionId()).not.toBe(savedSnapshot.alternativeVersionId);
    expect(isDocumentDirty(model, savedSnapshot)).toBe(false);
  });

  it('becomes clean when saved contents are restored by editing instead of undo', () => {
    const { edit, model } = createModel('saved text');
    const savedSnapshot = captureDocumentSnapshot(model);

    edit('different text');
    expect(isDocumentDirty(model, savedSnapshot)).toBe(true);

    edit('saved text');
    expect(isDocumentDirty(model, savedSnapshot)).toBe(false);
  });

  it('keeps deletion of saved contents dirty', () => {
    const { edit, model } = createModel('saved text');
    const savedSnapshot = captureDocumentSnapshot(model);

    edit('');

    expect(isDocumentDirty(model, savedSnapshot)).toBe(true);
  });

  it.each([' ', '\t', '\n', '\r\n'])('keeps whitespace-only changes %j dirty', (contents) => {
    const { edit, model } = createModel('');
    const savedSnapshot = captureDocumentSnapshot(model);

    edit(contents);

    expect(isDocumentDirty(model, savedSnapshot)).toBe(true);
  });

  it('detects different contents with the same length', () => {
    const { edit, model } = createModel('saved text');
    const savedSnapshot = captureDocumentSnapshot(model);

    edit('other text');

    expect(isDocumentDirty(model, savedSnapshot)).toBe(true);
  });

  it('detects line-ending changes', () => {
    const { edit, model } = createModel('first\nsecond');
    const savedSnapshot = captureDocumentSnapshot(model);

    edit('first\r\nsecond');

    expect(isDocumentDirty(model, savedSnapshot)).toBe(true);
  });

  it('avoids reading the full contents when lengths differ', () => {
    const { edit, model } = createModel('saved text');
    const savedSnapshot = captureDocumentSnapshot(model);
    model.getValue.mockClear();

    edit('longer modified text');

    expect(isDocumentDirty(model, savedSnapshot)).toBe(true);
    expect(model.getValue).not.toHaveBeenCalled();
  });

  it('tracks undo and redo around the saved version', () => {
    const { edit, model } = createModel('saved text');
    const savedSnapshot = captureDocumentSnapshot(model);

    edit('changed text', 2);
    expect(isDocumentDirty(model, savedSnapshot)).toBe(true);

    edit('saved text', savedSnapshot.alternativeVersionId);
    expect(isDocumentDirty(model, savedSnapshot)).toBe(false);

    edit('changed text', 2);
    expect(isDocumentDirty(model, savedSnapshot)).toBe(true);
  });

  it('compares against the latest saved snapshot instead of the initial contents', () => {
    const { edit, model } = createModel('initial text');
    edit('saved text');
    const savedSnapshot = captureDocumentSnapshot(model);

    expect(isDocumentDirty(model, savedSnapshot)).toBe(false);

    edit('initial text');
    expect(isDocumentDirty(model, savedSnapshot)).toBe(true);

    edit('saved text');
    expect(isDocumentDirty(model, savedSnapshot)).toBe(false);
  });

  it('keeps edits made after a save snapshot dirty', () => {
    const { edit, model } = createModel('');
    edit('contents sent to save');
    const savingSnapshot = captureDocumentSnapshot(model);

    edit('newer unsaved contents');

    expect(savingSnapshot.contents).toBe('contents sent to save');
    expect(isDocumentDirty(model, savingSnapshot)).toBe(true);
  });
});
