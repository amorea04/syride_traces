import { describe, expect, it } from 'vitest';
import { escapeHtml } from '@/lib/html';

describe('escapeHtml', () => {
  it('échappe les caractères du HTML', () => {
    expect(escapeHtml(`<b onclick="x">A&B's</b>`)).toBe('&lt;b onclick=&quot;x&quot;&gt;A&amp;B&#39;s&lt;/b&gt;');
  });
  it('laisse le texte simple intact', () => {
    expect(escapeHtml('Mont Test')).toBe('Mont Test');
  });
});
