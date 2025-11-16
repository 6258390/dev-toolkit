import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    plugins: {
      import: importPlugin,
      'local-rules': {
        rules: {
          // Rule 1: Block arrow functions with underscore prefix
          'no-underscore-arrow': {
            meta: {
              type: 'problem',
              docs: {
                description: 'Disallow arrow functions with underscore prefix',
                category: 'Stylistic Issues',
              },
              messages: {
                noUnderscoreArrow: 'Arrow functions should not use underscore prefix. Use function declarations instead: function {{name}}() { ... }',
              },
              schema: [],
            },
            create(context) {
              return {
                VariableDeclarator(node) {
                  // Check: const _name = () => {}
                  if (node.id.type === 'Identifier' && node.id.name.startsWith('_') && node.init && (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')) context.report({ node: node.id, messageId: 'noUnderscoreArrow', data: { name: node.id.name } });
                },
              };
            },
          },

          // Rule 2: Enforce single // Implementation comment after all export statements
          'implementation-comment': {
            meta: {
              type: 'problem',
              docs: {
                description: 'Require exactly one // Implementation comment after export statements and before function definitions',
                category: 'Stylistic Issues',
              },
              messages: {
                missingComment: 'Missing "// Implementation" comment. Add one comment after all exports and before function definitions.',
                multipleComments: 'Only one "// Implementation" comment allowed per file. Found {{count}} comments.',
                wrongPosition: '"// Implementation" comment must be placed after all exports and before first function definition.',
              },
              schema: [],
            },
            create(context) {
              const sourceCode = context.sourceCode || context.getSourceCode();
              return {
                Program(node) {
                  // Find all top-level function declarations with _ prefix
                  const functions = node.body.filter(n => n.type === 'FunctionDeclaration' && n.id && n.id.name.startsWith('_'));
                  if (functions.length === 0) return;
                  // Find all exports
                  const exports = node.body.filter(n => n.type === 'ExportNamedDeclaration' || n.type === 'ExportDefaultDeclaration');
                  const lastExport = exports.length > 0 ? exports[exports.length - 1] : null;
                  const firstFunction = functions[0];
                  // Find all "// Implementation" comments
                  const allComments = sourceCode.getAllComments();
                  const implComments = allComments.filter(c => c.type === 'Line' && c.value.trim() === 'Implementation');
                  // Check count
                  if (implComments.length === 0) return context.report({ node: firstFunction, messageId: 'missingComment' });
                  if (implComments.length > 1) return context.report({ node: implComments[1], messageId: 'multipleComments', data: { count: implComments.length } });
                  // Check position: must be after exports and before first function
                  const comment = implComments[0];
                  const afterExports = !lastExport || comment.range[0] > lastExport.range[1];
                  const beforeFunctions = comment.range[0] < firstFunction.range[0];
                  if (!afterExports || !beforeFunctions) context.report({ node: comment, messageId: 'wrongPosition' });
                },
              };
            },
          },

          // Rule 3: Block export default with _ prefix functions
          'no-export-underscore': {
            meta: {
              type: 'problem',
              docs: {
                description: 'Disallow exporting functions with underscore prefix using export default',
                category: 'Stylistic Issues',
              },
              messages: {
                noExportUnderscore: 'Do not export functions with underscore prefix. Use "export const name = {{name}}()" pattern instead.',
              },
              schema: [],
            },
            create(context) {
              return {
                ExportDefaultDeclaration(node) {
                  // Check: export default _createCLI()
                  let functionName = null;
                  if (node.declaration.type === 'CallExpression' && node.declaration.callee.type === 'Identifier' && node.declaration.callee.name.startsWith('_')) functionName = node.declaration.callee.name;
                  // Check: export default _createCLI
                  else if (node.declaration.type === 'Identifier' && node.declaration.name.startsWith('_')) functionName = node.declaration.name;
                  // Check: export default function _name() {}
                  else if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id && node.declaration.id.name.startsWith('_')) functionName = node.declaration.id.name;
                  if (functionName) context.report({ node, messageId: 'noExportUnderscore', data: { name: functionName } });
                },
              };
            },
          },

          // Rule 4: Require underscore prefix for all top-level function declarations
          'require-underscore-prefix': {
            meta: {
              type: 'problem',
              docs: {
                description: 'Require underscore prefix for all top-level function declarations',
                category: 'Stylistic Issues',
              },
              messages: {
                missingUnderscore: 'Function "{{name}}" must have underscore prefix. Use: function _{{name}}() { ... }',
              },
              schema: [],
            },
            create(context) {
              return {
                Program(node) {
                  const topLevelFunctions = node.body.filter(n => n.type === 'FunctionDeclaration' && n.id);
                  topLevelFunctions.forEach(funcNode => {
                    if (!funcNode.id.name.startsWith('_')) context.report({ node: funcNode.id, messageId: 'missingUnderscore', data: { name: funcNode.id.name } });
                  });
                },
              };
            },
          },

          // Rule 5: Enforce export const pattern with _ function call
          'export-pattern': {
            meta: {
              type: 'problem',
              docs: {
                description: 'Enforce export const x = _fn() pattern',
                category: 'Stylistic Issues',
              },
              messages: {
                notCallExpression: 'Export "{{name}}" must call a function. Use: export const {{name}} = _functionName();',
                notUnderscoreFunction: 'Export "{{name}}" must call a function with underscore prefix. Use: export const {{name}} = _functionName();',
              },
              schema: [],
            },
            create(context) {
              return {
                ExportNamedDeclaration(node) {
                  if (!node.declaration || node.declaration.type !== 'VariableDeclaration') return;
                  node.declaration.declarations.forEach(declarator => {
                    if (!declarator.init) return context.report({ node: declarator.id, messageId: 'notCallExpression', data: { name: declarator.id.name } });
                    if (declarator.init.type !== 'CallExpression') return context.report({ node: declarator.id, messageId: 'notCallExpression', data: { name: declarator.id.name } });
                    if (declarator.init.callee.type === 'Identifier' && !declarator.init.callee.name.startsWith('_')) context.report({ node: declarator.id, messageId: 'notUnderscoreFunction', data: { name: declarator.id.name } });
                  });
                },
              };
            },
          },
        },
      },
    },
    rules: {
      // Code style
      'quotes': ['error', 'single'],
      'indent': ['error', 2],
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],

      // Import sorting (alphabetical)
      'import/order': ['error', {
        'alphabetize': {
          'order': 'asc',
          'caseInsensitive': true,
        },
        'groups': [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
        ],
      }],
      'import/no-unresolved': 0,

      // Curly braces - never for single statements
      'curly': ['error', 'multi-or-nest', 'consistent'],
      'nonblock-statement-body-position': ['error', 'beside'],

      // Custom rules
      'local-rules/no-underscore-arrow': 'error',
      'local-rules/implementation-comment': 'error',
      'local-rules/no-export-underscore': 'error',
      'local-rules/require-underscore-prefix': 'error',
      'local-rules/export-pattern': 'error',
    },
  },
];
