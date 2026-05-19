function isFunctionNode(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration'
  );
}

function findEnclosingFunction(node) {
  let current = node.parent;

  while (current) {
    if (isFunctionNode(current)) {
      return current;
    }

    current = current.parent;
  }

  return undefined;
}

function objectPatternDefinesName(pattern, name) {
  return pattern.properties.some((property) => {
    if (property.type !== 'Property') {
      return false;
    }

    if (property.value.type === 'Identifier' && property.value.name === name) {
      return true;
    }

    return property.key.type === 'Identifier' && property.key.name === name;
  });
}

function isFlowCallback(functionNode) {
  if (!functionNode.parent) {
    return false;
  }

  if (
    functionNode.parent.type === 'CallExpression' &&
    functionNode.parent.arguments.includes(functionNode) &&
    functionNode.parent.callee.type === 'Identifier'
  ) {
    return functionNode.parent.callee.name === 'on' || functionNode.parent.callee.name === 'enter';
  }

  if (functionNode.parent.type !== 'Property') {
    return false;
  }

  const propertyName =
    functionNode.parent.key.type === 'Identifier' ? functionNode.parent.key.name : undefined;

  if (propertyName !== 'handle' && propertyName !== 'run') {
    return false;
  }

  let current = functionNode.parent.parent;

  while (current) {
    if (current.type === 'CallExpression' && current.callee.type === 'Identifier') {
      return current.callee.name === 'requestStep';
    }

    current = current.parent;
  }

  return false;
}

function isTrackedTerminalIdentifier(node) {
  if (node.type !== 'Identifier') {
    return false;
  }

  if (node.name !== 'goto' && node.name !== 'dispatch') {
    return false;
  }

  const enclosingFunction = findEnclosingFunction(node);

  if (!enclosingFunction || !isFlowCallback(enclosingFunction)) {
    return false;
  }

  return enclosingFunction.params.some(
    (parameter) =>
      parameter.type === 'ObjectPattern' && objectPatternDefinesName(parameter, node.name),
  );
}

const terminalGotoRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require terminal flow operations to be the last statement in their block.',
    },
    schema: [],
    messages: {
      terminalGoto: 'Code after a terminal flow operation in the same block will never execute.',
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

        if (!isTrackedTerminalIdentifier(terminalCall.callee)) {
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
