export type SecondInstanceAction =
  | {
      readonly filePaths: readonly string[];
      readonly kind: 'ensure-window';
    }
  | {
      readonly kind: 'focus-window';
    }
  | {
      readonly filePaths: readonly string[];
      readonly kind: 'open-files';
    };

export const secondInstanceActionFor = (
  filePaths: readonly string[],
  hasMainWindow: boolean,
): SecondInstanceAction => {
  if (!hasMainWindow) {
    return {
      filePaths,
      kind: 'ensure-window',
    };
  }

  return filePaths.length === 0
    ? { kind: 'focus-window' }
    : {
        filePaths,
        kind: 'open-files',
      };
};
