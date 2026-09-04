import { renderLiteMarkdown } from './render-lite-markdown';

describe('renderLiteMarkdown', () => {
  it('renders basic markdown to sanitized HTML', async () => {
    const html = await renderLiteMarkdown(
      '# Title\n\n- a\n- b\n\n**bold** and `code`',
    );
    expect(html).toContain('<h1');
    expect(html).toContain('Title');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('converts :emoji: shortcodes', async () => {
    const html = await renderLiteMarkdown('Ship it :rocket:');
    expect(html).toContain('🚀');
  });

  it('turns images into labelled text links', async () => {
    const html = await renderLiteMarkdown('![a diagram](/attachment/x.png)');
    expect(html).not.toContain('<img');
    expect(html).toContain('<a');
    expect(html).toContain('href="/attachment/x.png"');
    expect(html).toContain('🖼');
    expect(html).toContain('a diagram');
  });

  it('unwraps GROWI container directives to their content', async () => {
    const html = await renderLiteMarkdown(':::note\nimportant text\n:::');
    expect(html).not.toContain(':::');
    expect(html).toContain('important text');
  });

  it('drops raw HTML / script (sanitized)', async () => {
    const html = await renderLiteMarkdown(
      'text <script>alert(1)</script> <div onclick="x">y</div>',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
  });
});
