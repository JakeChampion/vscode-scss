import * as path from 'path';

import { TextDocument } from 'vscode-languageserver';

import { ICache } from './cache';
import { ISettings } from '../types/settings';
import { readFile, fileExists } from '../utils/fs';
import { parseDocument } from './parser';

export default class ScannerService {
	constructor(private readonly _cache: ICache, private readonly _settings: ISettings) {}

	public async scan(files: string[], recursive = true): Promise<void> {
		const iterator = new Set(files);

		for (let filepath of iterator) {
			const originalFilepath = filepath;

			let isExistFile = await this._fileExists(filepath);

			const partialFilepath = this._formatPartialFilepath(filepath);
			const isPartialFile = filepath === partialFilepath;

			if (!isExistFile && !isPartialFile) {
				filepath = partialFilepath;
				isExistFile = await this._fileExists(filepath);
			}

			if (!isExistFile) {
				this._cache.drop(filepath);
				this._cache.drop(partialFilepath);

				continue;
			}

			const content = await this._readFile(filepath);
			const document = TextDocument.create(originalFilepath, 'scss', 1, content);
			const { symbols } = parseDocument(document, null, this._settings);

			this._cache.set(filepath, symbols);

			if (!recursive || !this._settings.scanImportedFiles) {
				continue;
			}

			for (const symbol of symbols.imports) {
				if (symbol.dynamic || symbol.css) {
					continue;
				}

				iterator.add(symbol.filepath);
			}
		}
	}

	protected _readFile(filepath: string): Promise<string> {
		return readFile(filepath);
	}

	protected _fileExists(filepath: string): Promise<boolean> {
		return fileExists(filepath);
	}

	private _formatPartialFilepath(filepath: string): string {
		const original = path.parse(filepath);

		return path.format({
			...original,
			base: '_' + original.base
		});
	}
}
