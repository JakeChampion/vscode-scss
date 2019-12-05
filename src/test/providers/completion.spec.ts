'use strict';

import * as assert from 'assert';

import { CompletionItemKind } from 'vscode-languageserver';

import StorageService from '../../services/storage';
import { doCompletion } from '../../providers/completion';
import * as helpers from '../helpers';

const storage = new StorageService();

storage.set('one.scss', {
	document: 'one.scss',
	filepath: 'one.scss',
	variables: [
		{ name: '$one', value: '1', offset: 0, position: null },
		{ name: '$two', value: null, offset: 0, position: null },
		{ name: '$hex', value: '#fff', offset: 0, position: null },
		{ name: '$rgb', value: 'rgb(0,0,0)', offset: 0, position: null },
		{ name: '$word', value: 'red', offset: 0, position: null }
	],
	mixins: [
		{ name: 'test', parameters: [], offset: 0, position: null }
	],
	functions: [
		{ name: 'make', parameters: [], offset: 0, position: null }
	],
	imports: []
});

describe('Providers/Completion - Basic', () => {
	it('Variables', () => {
		const settings = helpers.makeSettings();
		const document = helpers.makeDocument('$');

		assert.equal(doCompletion(document, 1, settings, storage).items.length, 5);
	});

	it('Mixins', () => {
		const settings = helpers.makeSettings();
		const document = helpers.makeDocument('@include ');

		assert.equal(doCompletion(document, 9, settings, storage).items.length, 1);
	});
});

describe('Providers/Completion - Context', () => {
	it('Empty property value', () => {
		const settings = helpers.makeSettings();
		const document = helpers.makeDocument('.a { content:  }');

		assert.equal(doCompletion(document, 14, settings, storage).items.length, 5);
	});

	it('Non-empty property value without suggestions', () => {
		const settings = helpers.makeSettings();
		const document = helpers.makeDocument('.a { background: url(../images/one.png); }');

		assert.equal(doCompletion(document, 34, settings, storage).items.length, 0);
	});

	it('Non-empty property value with Variables', () => {
		const settings = helpers.makeSettings();
		const document = helpers.makeDocument('.a { background: url(../images/#{$one}/one.png); }');

		assert.equal(doCompletion(document, 37, settings, storage).items.length, 5, 'True');
		assert.equal(doCompletion(document, 42, settings, storage).items.length, 0, 'False');
	});

	it('Discard suggestions inside quotes', () => {
		const settings = helpers.makeSettings();
		const document = helpers.makeDocument('.a { background: url("../images/#{$one}/$one.png"); @include test("test", $one); }');

		assert.equal(doCompletion(document, 44, settings, storage).items.length, 0, 'Hide');
		assert.equal(doCompletion(document, 38, settings, storage).items.length, 6, 'True');
		assert.equal(doCompletion(document, 78, settings, storage).items.length, 5, 'Mixin');
	});

	it('Custom value for `suggestFunctionsInStringContextAfterSymbols` option', () => {
		const settings = helpers.makeSettings({
			suggestFunctionsInStringContextAfterSymbols: '/'
		});
		const document = helpers.makeDocument('.a { background: url(../images/m');

		assert.equal(doCompletion(document, 32, settings, storage).items.length, 1);
	});

	it('Discard suggestions inside single-line comments', () => {
		const settings = helpers.makeSettings();
		const document = helpers.makeDocument('// $');

		assert.equal(doCompletion(document, 4, settings, storage).items.length, 0);
	});

	it('Discard suggestions inside block comments', () => {
		const settings = helpers.makeSettings();
		const document = helpers.makeDocument('/* $ */');

		assert.equal(doCompletion(document, 4, settings, storage).items.length, 0);
	});

	it('Identify color variables', () => {
		const settings = helpers.makeSettings();
		const document = helpers.makeDocument('$');

		const completion = doCompletion(document, 1, settings, storage);

		assert.equal(completion.items[0].kind, CompletionItemKind.Variable);
		assert.equal(completion.items[1].kind, CompletionItemKind.Variable);
		assert.equal(completion.items[2].kind, CompletionItemKind.Color);
		assert.equal(completion.items[3].kind, CompletionItemKind.Color);
		assert.equal(completion.items[4].kind, CompletionItemKind.Color);
	});
});

describe('Providers/Completion - Implicitly', () => {
	it('Show default implicitly label', () => {
		const settings = helpers.makeSettings();
		const document = helpers.makeDocument('$');

		assert.equal(doCompletion(document, 1, settings, storage).items[0].detail, '(implicitly) one.scss');
	});

	it('Show custom implicitly label', () => {
		const settings = helpers.makeSettings({
			implicitlyLabel: '👻'
		});
		const document = helpers.makeDocument('$');

		assert.equal(doCompletion(document, 1, settings, storage).items[0].detail, '👻 one.scss');
	});

	it('Hide implicitly label', () => {
		const settings = helpers.makeSettings({
			implicitlyLabel: null
		});
		const document = helpers.makeDocument('$');

		assert.equal(doCompletion(document, 1, settings, storage).items[0].detail, 'one.scss');
	});
});
