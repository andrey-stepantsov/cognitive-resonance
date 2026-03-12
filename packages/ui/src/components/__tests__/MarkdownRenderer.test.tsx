
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { MarkdownRenderer } from '../MarkdownRenderer';

// Mock MermaidDiagram as it requires browser environment to render
vi.mock('../MermaidDiagram', () => ({
  MermaidDiagram: () => <div data-testid="mermaid-mock">Mermaid</div>
}));

describe('MarkdownRenderer', () => {
  it('renders standard markdown', () => {
    const { container } = render(<MarkdownRenderer content="# Hello World" />);
    expect(container.querySelector('h1')).toHaveTextContent('Hello World');
  });

  it('renders raw HTML tags correctly', () => {
    const content = `
Both tea and coffee are beloved beverages.
<ul>
  <li><b>Caffeine:</b> Generally high.</li>
  <li><b>Flavor:</b> Bold and roasted.</li>
</ul>
    `;
    const { container } = render(<MarkdownRenderer content={content} />);
    
    // Check that ul, li, and b tags were parsed as actual HTML elements
    const ul = container.querySelector('ul');
    expect(ul).toBeInTheDocument();
    
    const listItems = container.querySelectorAll('li');
    expect(listItems.length).toBe(2);
    expect(listItems[0]).toContainHTML('<b>Caffeine:</b> Generally high.');
  });
});
