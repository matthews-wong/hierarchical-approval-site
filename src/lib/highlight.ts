export function hl(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/(\/\/[^\n]*)/g, '<span class="c">$1</span>')
    .replace(/('[^'\\]*(?:\\.[^'\\]*)*')/g, '<span class="s">$1</span>')
    .replace(/("[^"\\]*(?:\\.[^"\\]*)*")/g, '<span class="s">$1</span>')
    .replace(/\b(async|await|const|let|if|else|return|new|import|from|export|true|false)\b/g, '<span class="k">$1</span>')
    .replace(/\b([0-9][0-9_]*(?:\.[0-9]+)?)\b/g, '<span class="n">$1</span>');
}
