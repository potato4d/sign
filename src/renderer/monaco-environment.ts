import CssWorker from 'monaco-editor/language/css/css.worker.js?worker';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') {
      return new JsonWorker();
    }

    if (label === 'css' || label === 'less' || label === 'scss') {
      return new CssWorker();
    }

    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new HtmlWorker();
    }

    if (label === 'javascript' || label === 'typescript') {
      return new TypeScriptWorker();
    }

    return new EditorWorker();
  },
};
