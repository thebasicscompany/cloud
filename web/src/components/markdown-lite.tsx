import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown renderer used by the run Output panel and the Documents reader.
 * Backed by react-markdown + remark-gfm so it handles the full common
 * markdown surface (links, fenced code blocks, tables, task lists,
 * autolinks, blockquotes, strikethrough, etc.). No `dangerouslySetInnerHTML`
 * — react-markdown escapes every leaf node automatically.
 */
export function MarkdownLite({ text }: { text: string }) {
  return (
    <article className="space-y-3 text-sm leading-relaxed text-foreground/90">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h1 className="font-semibold text-xl" {...props} />,
          h2: (props) => <h2 className="font-semibold text-lg" {...props} />,
          h3: (props) => <h3 className="font-medium text-base" {...props} />,
          h4: (props) => <h4 className="font-medium text-sm" {...props} />,
          p: (props) => <p className="text-foreground/90" {...props} />,
          a: ({ href, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
              {...props}
            />
          ),
          ul: (props) => <ul className="ml-5 list-disc space-y-1" {...props} />,
          ol: (props) => <ol className="ml-5 list-decimal space-y-1" {...props} />,
          li: (props) => <li className="text-foreground/90" {...props} />,
          blockquote: (props) => (
            <blockquote
              className="border-l-4 border-primary/25 pl-3 text-muted-foreground italic"
              {...props}
            />
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return (
                <code className={`${className ?? ""} font-mono text-xs`} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: (props) => (
            <pre
              className="overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs"
              {...props}
            />
          ),
          table: (props) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="border border-border bg-muted/50 px-2 py-1 text-left text-xs"
              {...props}
            />
          ),
          td: (props) => (
            <td className="border border-border px-2 py-1 text-xs" {...props} />
          ),
          hr: () => <hr className="my-2 border-border" />,
          strong: (props) => <strong className="font-semibold" {...props} />,
          em: (props) => <em className="italic" {...props} />,
          img: ({ alt, ...props }) => (
            <img alt={alt ?? ""} className="max-w-full rounded-md border border-border" {...props} />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </article>
  );
}
