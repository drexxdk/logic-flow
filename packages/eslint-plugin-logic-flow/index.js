const terminalGotoRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require goto(...) to be the last statement in its block.',
    },
    schema: [],
    messages: {
      terminalGoto: 'Code after goto(...) in the same block will never execute.',
    },
  },
  create(context) {
    return {
      ExpressionStatement(node) {
        const terminalCall =
          node.expression.type === 'CallExpression'
            ? node.expression
            : node.expression.type === 'AwaitExpression' &&
                node.expression.argument.type === 'CallExpression'
              ? node.expression.argument
              : undefined;

        if (!terminalCall) {
          return;
        }

        if (terminalCall.callee.type !== 'Identifier') {
          return;
        }

        if (terminalCall.callee.name !== 'goto' && terminalCall.callee.name !== 'dispatch') {
          return;
        }

        const parent = node.parent;

        if (!parent) {
          return;
        }

        const statements =
          parent.type === 'BlockStatement'
            ? parent.body
            : parent.type === 'SwitchCase'
              ? parent.consequent
              : undefined;

        if (!statements) {
          return;
        }

        const index = statements.indexOf(node);

        if (index < 0) {
          return;
        }

        const remainingStatements = statements.slice(index + 1);
        const unreachableStatements = remainingStatements.filter(
          (statement) => statement.type !== 'ReturnStatement' || statement.argument !== null,
        );

        for (const statement of unreachableStatements) {
          context.report({ node: statement, messageId: 'terminalGoto' });
        }
      },
    };
  },
};

const plugin = {
  meta: {
    name: 'eslint-plugin-logic-flow',
  },
  rules: {
    'terminal-goto': terminalGotoRule,
  },
};

plugin.configs = {
  recommended: {
    plugins: {
      'logic-flow': plugin,
    },
    rules: {
      'logic-flow/terminal-goto': 'error',
    },
  },
};

export { terminalGotoRule };
export default plugin;
