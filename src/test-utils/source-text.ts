import ts from "typescript";

const singleQuoteLiteral = (value: string): string =>
	`'${value
		.replaceAll("\\", "\\\\")
		.replaceAll("'", "\\'")
		.replaceAll("\n", "\\n")
		.replaceAll("\r", "\\r")
		.replaceAll("\t", "\\t")}'`;

/**
 * Canonicalize only JavaScript/TypeScript string-literal delimiters for source
 * ownership assertions. It deliberately leaves templates, JSX text, comments,
 * whitespace, and each literal's decoded value intact.
 */
export const normalizeSourceStringDelimiters = (source: string): string => {
	const file = ts.createSourceFile(
		"source.tsx",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const literals: ts.StringLiteral[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isStringLiteral(node) && !ts.isJsxAttribute(node.parent)) {
			literals.push(node);
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	let result = "";
	let previousEnd = 0;
	for (const literal of literals) {
		const start = literal.getStart(file);
		const end = literal.getEnd();
		result += `${source.slice(previousEnd, start)}${singleQuoteLiteral(
			literal.text,
		)}`;
		previousEnd = end;
	}
	return `${result}${source.slice(previousEnd)}`;
};
