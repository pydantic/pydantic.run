import * as monaco from 'monaco-editor'

import type { CodeFile } from './types'

export const { KeyMod, KeyCode } = monaco

monaco.editor.defineTheme('custom-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#1e1f2e',
  },
})

export class Editor {
  private readonly editor: monaco.editor.IStandaloneCodeEditor
  private readonly languages: monaco.languages.ILanguageExtensionPoint[]

  constructor(element: HTMLElement, file: CodeFile | undefined) {
    this.languages = monaco.languages.getLanguages()
    this.editor = monaco.editor.create(element, {
      value: file ? file.content : '',
      language: this.getLanguage(file),
      theme: 'custom-dark',
      automaticLayout: true,
      minimap: {
        enabled: false,
      },
    })
  }

  getValue(): string {
    return this.editor.getValue()
  }

  addCommand(keybinding: monaco.KeyCode, handler: () => void) {
    this.editor.addCommand(keybinding, handler)
  }

  onDidChangeModelContent(handler: () => void) {
    this.editor.onDidChangeModelContent(handler)
  }

  focus() {
    this.editor.focus()
  }

  setFile(file: CodeFile) {
    const language = this.getLanguage(file)
    console.log('setFile', file, language)
    if (language) {
      monaco.editor.setModelLanguage(this.editor.getModel()!, language)
    }
    this.editor.setValue(file.content)
  }

  private getLanguage(file: CodeFile | undefined): string {
    if (!file) {
      return 'txt'
    }
    const nameParts = file.name.split('.')
    if (nameParts.length >= 2) {
      const fileExtension = '.' + nameParts[nameParts.length - 1]
      if (fileExtension === '.toml') {
        // monaco doesn't yet support toml, use ruby as a workaround 🤮
        // https://github.com/microsoft/monaco-editor/issues/2798#issuecomment-2390998775
        return 'ruby'
      }
      for (const { extensions, id } of this.languages) {
        if (extensions && extensions.includes(fileExtension)) {
          return id
        }
      }
    }
    if (file.content.length > 0) {
      const contentFirstLine = file.content.split('\n')[0]
      for (const { firstLine, id } of this.languages) {
        if (firstLine) {
          const firstLineRegex = new RegExp(firstLine)
          if (firstLineRegex.test(contentFirstLine)) {
            return id
          }
        }
      }
    }
    return 'txt'
  }
}
