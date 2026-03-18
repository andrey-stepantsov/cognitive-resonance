import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { MermaidDiagram } from './MermaidDiagram';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors"
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  // Normalize literal '\n' sequences that might have been double-escaped by the LLM JSON output
  const normalizedContent = content.replace(/\\n/g, '\n');

  return (
    <>
      {/* @ts-ignore - ReactMarkdown types are incompatible with React 19 in this specific version */}
      <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        pre({ children }: any) {
          return <>{children}</>;
        },
        code({ node, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';
          const codeStr = String(children).replace(/\n$/, '');

          if (match && language === 'mermaid') {
            return (
              <MermaidDiagram chart={codeStr} />
            );
          }

          if (match) {
            return (
              <div className="rounded-md overflow-hidden my-4 border border-zinc-700/50 w-full max-w-full min-w-0">
                 <div className="bg-zinc-800/80 px-3 py-1.5 text-xs text-zinc-400 border-b border-zinc-700/50 flex justify-between items-center w-full">
                   <span>{language}</span>
                   <CopyButton text={codeStr} />
                 </div>
                {/* @ts-ignore - SyntaxHighlighter types are incompatible with React 19 in this specific version */}
                <SyntaxHighlighter
                  style={vscDarkPlus as any}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
                  codeTagProps={{ style: { background: 'transparent' } }}
                  className="!m-0 text-sm"
                >
                  {codeStr}
                </SyntaxHighlighter>
              </div>
            );
          }

          return (
            <code {...props} className={`${className || ''} bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded text-sm font-mono`}>
              {children}
            </code>
          );
        },
        p({ node, children, ...props }: any) {
          const text = String(children);
          const match = text.match(/^\[Remote Artefact\] Draft proposed: (.+) for (.+)$/);
          if (match) {
             const [, branch, path] = match;
             return (
               <div className="my-4 border border-indigo-500/30 bg-indigo-500/10 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                  <div className="p-2.5 bg-indigo-500/20 rounded-lg shrink-0">
                    <Check className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-indigo-300">Remote Artefact Generated</p>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      Saved to <code className="text-indigo-300 bg-black/20 px-1 py-0.5 rounded font-mono">{path}</code> on branch <code className="text-indigo-300 bg-black/20 px-1 py-0.5 rounded font-mono">{branch}</code>
                    </p>
                  </div>
                  <button className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors shrink-0 shadow shadow-indigo-500/20">
                    View
                  </button>
               </div>
             );
          }
          return <p {...props}>{children}</p>;
        }
      }}
    >
      {normalizedContent}
      </ReactMarkdown>
    </>
  );
};
