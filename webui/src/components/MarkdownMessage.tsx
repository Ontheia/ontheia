/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Wolfgang Brangl <https://ontheia.ai>
 *
 * This file is part of Ontheia.
 *
 * Ontheia is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Ontheia is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Ontheia.  If not, see <https://www.gnu.org/licenses/>.
 *
 * For commercial licensing inquiries, please see LICENSE-COMMERCIAL.md
 * or contact https://ontheia.ai
 */
import React, { type ComponentPropsWithoutRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { defaultSchema, type Schema } from 'hast-util-sanitize';
import { Check, Copy } from 'lucide-react';
import { copyText } from '@/lib/clipboard';

type MdNode = {
  type?: string;
  value?: string;
  children?: MdNode[];
  data?: Record<string, any>;
};

type MarkdownMessageProps = {
  content: string;
  className?: string;
};

type MarkdownMessageComponentProps = MarkdownMessageProps & {
  showCopyButton?: boolean;
  copyIcon?: React.ReactNode;
  onCopy?: (content: string) => void;
  showCodeCopyButton?: boolean;
  copyLabel?: string;
};

// Simple remark plugin to convert ==highlight== to <mark>...</mark>
function remarkHighlight() {
  return (tree: MdNode) => {
    const isLiteral = (node?: MdNode) =>
      node?.type === 'inlineCode' || node?.type === 'code' || node?.type === 'link';

    const splitText = (value: string): MdNode[] => {
      const parts = value.split(/(==[^=]+==)/g);
      return parts
        .filter((part) => part.length > 0)
        .map((part) => {
          const match = part.match(/^==([^=]+)==$/);
          if (!match) {
            return { type: 'text', value: part };
          }
          return {
            type: 'mark',
            data: { hName: 'mark' },
            children: [{ type: 'text', value: match[1] }]
          };
        });
    };

    const visit = (node?: MdNode) => {
      if (!node || !node.children || isLiteral(node)) return;
      node.children = node.children.flatMap((child) => {
        if (child.type === 'text' && typeof child.value === 'string') {
          return splitText(child.value);
        }
        visit(child);
        return [child];
      });
    };

    visit(tree);
  };
}

const markdownSchema: Schema = {
  ...defaultSchema,
  tagNames: Array.from(
    new Set([
      ...(defaultSchema.tagNames ?? []),
      'p',
      'ul',
      'ol',
      'li',
      'em',
      'strong',
      'blockquote',
      'hr',
      'br',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'mark'
    ])
  ),
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ['className']],
    pre: [...(defaultSchema.attributes?.pre ?? []), ['className']],
    span: [...(defaultSchema.attributes?.span ?? []), ['className']],
    ul: [...(defaultSchema.attributes?.ul ?? []), ['className']],
    ol: [...(defaultSchema.attributes?.ol ?? []), ['className']],
    li: [...(defaultSchema.attributes?.li ?? []), ['className']],
    p: [...(defaultSchema.attributes?.p ?? []), ['className']],
    em: [...(defaultSchema.attributes?.em ?? []), ['className']],
    strong: [...(defaultSchema.attributes?.strong ?? []), ['className']],
    blockquote: [...(defaultSchema.attributes?.blockquote ?? []), ['className']],
    h1: [...(defaultSchema.attributes?.h1 ?? []), ['className']],
    h2: [...(defaultSchema.attributes?.h2 ?? []), ['className']],
    h3: [...(defaultSchema.attributes?.h3 ?? []), ['className']],
    h4: [...(defaultSchema.attributes?.h4 ?? []), ['className']],
    h5: [...(defaultSchema.attributes?.h5 ?? []), ['className']],
    h6: [...(defaultSchema.attributes?.h6 ?? []), ['className']],
    table: [...(defaultSchema.attributes?.table ?? []), ['className']],
    thead: [...(defaultSchema.attributes?.thead ?? []), ['className']],
    tbody: [...(defaultSchema.attributes?.tbody ?? []), ['className']],
    tr: [...(defaultSchema.attributes?.tr ?? []), ['className']],
    th: [...(defaultSchema.attributes?.th ?? []), ['className', 'align']],
    td: [...(defaultSchema.attributes?.td ?? []), ['className', 'align']],
    mark: [...(defaultSchema.attributes?.mark ?? []), ['className']],
    img: [['src', /^(https?:|data:image\/)/], 'alt', 'title', 'width', 'height', 'className', 'loading']
  }
};

type CodeComponentProps = ComponentPropsWithoutRef<'code'> & ExtraProps & { inline?: boolean };
type AnchorComponentProps = ComponentPropsWithoutRef<'a'> & ExtraProps;
type ImageComponentProps = ComponentPropsWithoutRef<'img'> & ExtraProps;
type TableComponentProps = ComponentPropsWithoutRef<'table'> & ExtraProps;
type ParagraphComponentProps = ComponentPropsWithoutRef<'p'> & ExtraProps;

type HeadingComponentProps = ComponentPropsWithoutRef<'h1'> & ExtraProps;

type CodeRendererArgs = {
  enableCopy?: boolean;
  onCopy?: (content: string) => void;
};

// In a chat context H1/H2 are visually too dominant and often appear without
// the user asking for markdown. Downscale both to H3 so structure is preserved
// but the output doesn't start with a page-title-sized line.
function DownscaledHeading({ children, ...rest }: HeadingComponentProps) {
  const { node: _node, ...htmlProps } = rest as any;
  return <h3 className="markdown-h3" {...htmlProps}>{children}</h3>;
}

const createMarkdownComponents = ({ enableCopy, onCopy }: CodeRendererArgs): Components => ({
  h1: DownscaledHeading,
  h2: DownscaledHeading,
  p(paragraphProps) {
    const { node, children, ...rest } = paragraphProps as ParagraphComponentProps;
    const hasBlockChild =
      Array.isArray(node?.children) &&
      node!.children.some((child: any) => {
        if (!child || typeof child !== 'object') return false;
        if (child.type === 'element') {
          return child.tagName === 'code' || child.tagName === 'pre' || child.tagName === 'div';
        }
        return false;
      });
    if (hasBlockChild) {
      return <>{children}</>;
    }
    return (
      <p {...rest}>
        {children}
      </p>
    );
  },
  code(codeProps) {
    const { inline, className: codeClassName, children, ...props } = codeProps as CodeComponentProps;
    if (inline) {
      return (
        <code className={['markdown-inline-code', codeClassName].filter(Boolean).join(' ')} {...props}>
          {children}
        </code>
      );
    }
    const language = codeClassName?.replace('language-', '') ?? undefined;
    const label = language && language.trim().length > 0 ? language.trim() : 'Code';
    const codeText = String(children).trimEnd();
    const isSingleLine = !codeText.includes('\n');
    if (isSingleLine) {
      return (
        <code className={['markdown-inline-code', codeClassName].filter(Boolean).join(' ')} {...props}>
          {children}
        </code>
      );
    }
    return (
      <div className="markdown-code-block-wrapper" data-language={language}>
        <div className="markdown-code-block-header">
          <span className="markdown-code-label">{label}</span>
        </div>
        {enableCopy && (
          <CodeCopyButton
            onCopy={async () => {
              const ok = await copyText(codeText);
              if (ok) {
                onCopy?.(codeText);
              }
            }}
          />
        )}
        <pre className="markdown-code-block">
          <code {...props} className={codeClassName}>
            {children}
          </code>
        </pre>
      </div>
    );
  },
  a(anchorProps) {
    const { children, ...props } = anchorProps as AnchorComponentProps;
    return (
      <a {...props} className="markdown-link" rel="noreferrer" target="_blank">
        {children}
      </a>
    );
  },
  img(imageProps) {
    const props = imageProps as ImageComponentProps;
    return <img {...props} className="markdown-image" loading="lazy" />;
  },
  table(tableProps) {
    const { children } = tableProps as TableComponentProps;
    return (
      <div className="markdown-table-wrapper">
        <table>{children}</table>
      </div>
    );
  }
});

const COPY_DEFAULT_DELAY_MS = 2000;

export function MarkdownMessage({
  content,
  className,
  showCopyButton,
  copyIcon,
  onCopy,
  showCodeCopyButton,
  copyLabel
}: MarkdownMessageComponentProps) {
  const { t } = useTranslation(['chat', 'common']);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      const ok = await copyText(content);
      if (ok) {
        setCopied(true);
        onCopy?.(content);
        window.setTimeout(() => setCopied(false), COPY_DEFAULT_DELAY_MS);
      }
    } catch (error) {
      console.warn(t('copyFailed'), error);
    }
  }, [content, onCopy, t]);

  return (
    <div className={['markdown-message', className].filter(Boolean).join(' ')}>
      {(showCopyButton ?? false) && (
        <button
          type="button"
          className="markdown-copy-button markdown-copy-button--message"
          onClick={handleCopy}
          aria-label={copied ? t('common:copied') : t('copyMessage')}
          data-copied={copied ? 'true' : 'false'}
        >
          {copied ? (
            <Check className="markdown-copy-icon" aria-hidden="true" />
          ) : (
            copyIcon ?? <Copy className="markdown-copy-icon" aria-hidden="true" />
          )}
        </button>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkHighlight]}
        rehypePlugins={[[rehypeSanitize, markdownSchema]]}
        components={createMarkdownComponents({
          enableCopy: showCodeCopyButton,
          onCopy
        })}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
const CodeCopyButton = ({ onCopy }: { onCopy: () => Promise<void> }) => {
  const { t } = useTranslation(['chat']);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await onCopy();
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_DEFAULT_DELAY_MS);
    } catch (error) {
      console.warn(t('copyFailed'), error);
    }
  }, [onCopy, t]);

  return (
    <button
      type="button"
      className="markdown-copy-button markdown-copy-button--code"
      aria-label={copied ? t('codeCopied') : t('copyCode')}
      onClick={handleCopy}
      data-copied={copied ? 'true' : 'false'}
    >
      {copied ? (
        <Check aria-hidden="true" width={14} height={14} />
      ) : (
        <Copy aria-hidden="true" width={14} height={14} />
      )}
    </button>
  );
};
