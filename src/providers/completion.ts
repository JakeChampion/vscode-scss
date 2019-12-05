'use strict';

import { CompletionList, CompletionItemKind, TextDocument, Files } from 'vscode-languageserver';

import { IMixin } from '../types/symbols';
import { ISettings } from '../types/settings';
import StorageService from '../services/storage';

import { parseDocument } from '../services/parser';
import { getSymbolsCollection } from '../utils/symbols';
import { getCurrentDocumentImportPaths, getDocumentPath } from '../utils/document';
import { getCurrentWord, getLimitedString, getTextBeforePosition } from '../utils/string';
import { getVariableColor } from '../utils/color';

// RegExp's
const rePropertyValue = /.*:\s*/;
const reEmptyPropertyValue = /.*:\s*$/;
const reQuotedValueInString = /['"](?:[^'"\\]|\\.)*['"]/g;
const reMixinReference = /.*@include\s+(.*)/;
const reComment = /^(\/(\/|\*)|\*)/;
const reQuotes = /['"]/;

/**
 * Returns `true` if the path is not present in the document.
 */
function isImplicitly(symbolsDocument: string, documentPath: string, documentImports: string[]): boolean {
	return symbolsDocument !== documentPath && documentImports.indexOf(symbolsDocument) === -1;
}

/**
 * Return Mixin as string.
 */
function makeMixinDocumentation(symbol: IMixin): string {
	const args = symbol.parameters.map(item => `${item.name}: ${item.value}`).join(', ');
	return `${symbol.name}(${args}) {\u2026}`;
}

/**
 * Check context for Variables suggestions.
 */
function checkVariableContext(
	word: string,
	isInterpolation: boolean,
	isPropertyValue: boolean,
	isEmptyValue: boolean,
	isQuotes: boolean
): boolean {
	if (isPropertyValue && !isEmptyValue && !isQuotes) {
		return word.includes('$');
	} else if (isQuotes) {
		return isInterpolation;
	}

	return word[0] === '$' || isInterpolation || isEmptyValue;
}

/**
 * Check context for Mixins suggestions.
 */
function checkMixinContext(textBeforeWord: string, isPropertyValue: boolean): boolean {
	return !isPropertyValue && reMixinReference.test(textBeforeWord);
}

/**
 * Check context for Function suggestions.
 */
function checkFunctionContext(
	textBeforeWord: string,
	isInterpolation: boolean,
	isPropertyValue: boolean,
	isEmptyValue: boolean,
	isQuotes: boolean,
	settings: ISettings
): boolean {
	if (isPropertyValue && !isEmptyValue && !isQuotes) {
		const lastChar = textBeforeWord.substr(-2, 1);
		return settings.suggestFunctionsInStringContextAfterSymbols.indexOf(lastChar) !== -1;
	} else if (isQuotes) {
		return isInterpolation;
	}

	return false;
}

/**
 * Do Completion :)
 */
export function doCompletion(
	document: TextDocument,
	offset: number,
	settings: ISettings,
	storage: StorageService
): CompletionList {
	const completions = CompletionList.create([], false);

	const documentPath = Files.uriToFilePath(document.uri) || document.uri;
	if (!documentPath) {
		return null;
	}

	const resource = parseDocument(document, offset, settings);

	storage.set(documentPath, resource.symbols);

	const symbolsList = getSymbolsCollection(storage);
	const documentImports = getCurrentDocumentImportPaths(symbolsList, documentPath);
	const currentWord = getCurrentWord(document.getText(), offset);
	const textBeforeWord = getTextBeforePosition(document.getText(), offset);

	// Drop suggestions inside `//` and `/* */` comments
	if (reComment.test(textBeforeWord.trim())) {
		return completions;
	}

	// Is "#{INTERPOLATION}"
	const isInterpolation = currentWord.includes('#{');

	// Information about current position
	const isPropertyValue = rePropertyValue.test(textBeforeWord);
	const isEmptyValue = reEmptyPropertyValue.test(textBeforeWord);
	const isQuotes = reQuotes.test(textBeforeWord.replace(reQuotedValueInString, ''));

	// Check contexts
	const isVariableContext = checkVariableContext(
		currentWord,
		isInterpolation,
		isPropertyValue,
		isEmptyValue,
		isQuotes
	);
	const isFunctionContext = checkFunctionContext(
		textBeforeWord,
		isInterpolation,
		isPropertyValue,
		isEmptyValue,
		isQuotes,
		settings
	);
	const isMixinContext = checkMixinContext(textBeforeWord, isPropertyValue);

	// Variables
	if (settings.suggestVariables && isVariableContext) {
		symbolsList.forEach(symbols => {
			const isImplicitlyImport = isImplicitly(symbols.document, documentPath, documentImports);
			const fsPath = getDocumentPath(documentPath, isImplicitlyImport ? symbols.filepath : symbols.document);

			symbols.variables.forEach(variable => {
				const color = getVariableColor(variable.value);
				const completionKind = color ? CompletionItemKind.Color : CompletionItemKind.Variable;

				// Add 'implicitly' prefix for Path if the file imported implicitly
				let detailPath = fsPath;
				if (isImplicitlyImport && settings.implicitlyLabel) {
					detailPath = settings.implicitlyLabel + ' ' + detailPath;
				}

				// Add 'argument from MIXIN_NAME' suffix if Variable is Mixin argument
				let detailText = detailPath;
				if (variable.mixin) {
					detailText = `argument from ${variable.mixin}, ${detailText}`;
				}

				completions.items.push({
					label: variable.name,
					kind: completionKind,
					detail: detailText,
					documentation: getLimitedString(color ? color.toString() : variable.value)
				});
			});
		});
	}

	// Mixins
	if (settings.suggestMixins && isMixinContext) {
		symbolsList.forEach(symbols => {
			const isImplicitlyImport = isImplicitly(symbols.document, documentPath, documentImports);
			const fsPath = getDocumentPath(documentPath, isImplicitlyImport ? symbols.filepath : symbols.document);

			symbols.mixins.forEach(mixin => {
				// Add 'implicitly' prefix for Path if the file imported implicitly
				let detailPath = fsPath;
				if (isImplicitlyImport && settings.implicitlyLabel) {
					detailPath = settings.implicitlyLabel + ' ' + detailPath;
				}

				completions.items.push({
					label: mixin.name,
					kind: CompletionItemKind.Function,
					detail: detailPath,
					documentation: makeMixinDocumentation(mixin),
					insertText: mixin.name
				});
			});
		});
	}

	// Functions
	if (settings.suggestFunctions && isFunctionContext) {
		symbolsList.forEach(symbols => {
			const isImplicitlyImport = isImplicitly(symbols.document, documentPath, documentImports);
			const fsPath = getDocumentPath(documentPath, isImplicitlyImport ? symbols.filepath : symbols.document);

			symbols.functions.forEach(func => {
				// Add 'implicitly' prefix for Path if the file imported implicitly
				let detailPath = fsPath;
				if (isImplicitlyImport && settings.implicitlyLabel) {
					detailPath = settings.implicitlyLabel + ' ' + detailPath;
				}

				completions.items.push({
					label: func.name,
					kind: CompletionItemKind.Interface,
					detail: detailPath,
					documentation: makeMixinDocumentation(func),
					insertText: func.name
				});
			});
		});
	}

	return completions;
}
