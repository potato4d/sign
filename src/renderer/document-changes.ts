import type { editor } from 'monaco-editor';

type DocumentModel = Pick<
  editor.ITextModel,
  'getAlternativeVersionId' | 'getValue' | 'getValueLength'
>;

export interface DocumentSnapshot {
  readonly alternativeVersionId: number;
  readonly contents: string;
}

export const captureDocumentSnapshot = (model: DocumentModel): DocumentSnapshot => ({
  alternativeVersionId: model.getAlternativeVersionId(),
  contents: model.getValue(),
});

export const isDocumentDirty = (model: DocumentModel, savedSnapshot: DocumentSnapshot): boolean => {
  if (model.getAlternativeVersionId() === savedSnapshot.alternativeVersionId) {
    return false;
  }

  return (
    model.getValueLength() !== savedSnapshot.contents.length ||
    model.getValue() !== savedSnapshot.contents
  );
};
