const TOKEN =
  /(\/\/[^\n]*)|('[^'\\\n]*(?:\\.[^'\\\n]*)*')|("[^"\\\n]*(?:\\.[^"\\\n]*)*")|\b(async|await|const|let|if|else|return|new|import|from|export|true|false)\b|\b([0-9][0-9_]*(?:\.[0-9]+)?)\b/g;

const TOKEN_CLASSES = ['c', 's', 's', 'k', 'n'] as const;

function escapeHtml(raw: string): string {
  return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// One pass over the escaped text: a later rule must never run over markup an
// earlier rule emitted, or `class="c"` gets highlighted as a string.
export function hl(raw: string): string {
  return escapeHtml(raw).replace(TOKEN, (match, ...groups: (string | undefined)[]) => {
    const index = groups.findIndex((group) => group !== undefined);
    return `<span class="${TOKEN_CLASSES[index]}">${match}</span>`;
  });
}
