import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface CodeExample {
  readonly title: string;
  readonly xstateCode: string;
  readonly logicFlowCode: string;
  readonly typedReasons: readonly string[];
}

interface CodeComparisonProps {
  readonly example: CodeExample;
}

const codeTheme = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    margin: 0,
    background: 'transparent',
    fontSize: '0.84rem',
    lineHeight: 1.55,
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    fontSize: '0.84rem',
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
  },
};

const typedLineMarker = '/* @typed */ ';

function extractTypedCode(rawCode: string): {
  code: string;
  typedLineNumbers: number[];
} {
  const typedLineNumbers: number[] = [];
  const code = rawCode
    .split('\n')
    .map((line, index) => {
      if (!line.includes(typedLineMarker)) {
        return line;
      }

      typedLineNumbers.push(index + 1);

      return line.replace(typedLineMarker, '');
    })
    .join('\n');

  return { code, typedLineNumbers };
}

SyntaxHighlighter.registerLanguage('tsx', tsx);

export function CodeComparison({ example }: CodeComparisonProps) {
  const { code, typedLineNumbers } = extractTypedCode(example.logicFlowCode);
  const typedLines = new Set(typedLineNumbers);

  return (
    <section className="comparison-block" aria-label={`${example.title} code comparison`}>
      <div className="comparison-heading-row">
        <h3>{example.title}</h3>
        <span className="comparison-legend">
          Highlighted lines show typed advantages in logic-flow
        </span>
      </div>

      <div className="comparison-grid">
        <article className="comparison-panel">
          <div className="comparison-panel-header">
            <span className="comparison-panel-label">XState</span>
            <p>Configuration-driven equivalent</p>
          </div>
          <div className="comparison-code-shell">
            <SyntaxHighlighter
              language="tsx"
              style={codeTheme}
              showLineNumbers
              wrapLines
              lineProps={() => ({
                className: 'comparison-code-line',
              })}
            >
              {example.xstateCode}
            </SyntaxHighlighter>
          </div>
        </article>

        <article className="comparison-panel comparison-panel-logic-flow">
          <div className="comparison-panel-header">
            <span className="comparison-panel-label">logic-flow</span>
            <p>Code-first version with local typing</p>
          </div>
          <div className="comparison-code-shell">
            <SyntaxHighlighter
              language="tsx"
              style={codeTheme}
              showLineNumbers
              wrapLines
              lineProps={(lineNumber: number) => ({
                className: typedLines.has(lineNumber)
                  ? 'comparison-code-line comparison-code-line-typed'
                  : 'comparison-code-line',
              })}
            >
              {code}
            </SyntaxHighlighter>
          </div>
          <ul className="typed-advantages-list">
            {example.typedReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
