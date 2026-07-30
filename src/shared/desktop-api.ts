export const IPC_CHANNELS = {
  editorStateChanged: 'editor:state-changed',
  getEditorState: 'editor:get-state',
} as const;

export interface OpenedDocument {
  readonly contents: string;
  readonly fileName: string;
  readonly filePath: string;
}

export type EditorState =
  | {
      readonly kind: 'empty';
    }
  | {
      readonly document: OpenedDocument;
      readonly kind: 'document';
    }
  | {
      readonly filePath: string;
      readonly kind: 'error';
      readonly message: string;
    };

export interface DesktopApi {
  getEditorState(): Promise<EditorState>;
  onEditorStateChanged(listener: (state: EditorState) => void): () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isEditorState = (value: unknown): value is EditorState => {
  if (!isRecord(value) || typeof value['kind'] !== 'string') {
    return false;
  }

  if (value['kind'] === 'empty') {
    return true;
  }

  if (value['kind'] === 'error') {
    return typeof value['filePath'] === 'string' && typeof value['message'] === 'string';
  }

  if (value['kind'] !== 'document' || !isRecord(value['document'])) {
    return false;
  }

  const document = value['document'];

  return (
    typeof document['contents'] === 'string' &&
    typeof document['fileName'] === 'string' &&
    typeof document['filePath'] === 'string'
  );
};
