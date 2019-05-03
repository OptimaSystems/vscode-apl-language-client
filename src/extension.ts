/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
	window,
	commands,
	workspace,
	ExtensionContext
} from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	StreamInfo
} from 'vscode-languageclient';
import {
	ChildProcess,
	spawn
} from 'child_process';
import * as net from 'net';
import * as path from 'path';

let client: LanguageClient;

export async function activate(context: ExtensionContext) {
	const conf = workspace.getConfiguration('apl.server');
	const maxWS = conf.get<string>('maxWS') || '2G';
	
	if (maxWS !== '-1' && !/^\d+[KMG]?$/.exec(maxWS)) {
		const selected = await window.showErrorMessage(
			'The memory limit you\'d provided is not numeric, nor "-1" nor valid Dyalog shorthand notation!',
			'Open settings'
		);
		if (selected === 'Open settings') {
			await commands.executeCommand('workbench.action.openGlobalSettings');
		}
		return;
	}
	const executablePath = conf.get<string>('executablePath') ||
		(/^win/.test(process.platform) ? 'dyalog.exe' : 'mapl');

	const serverPath = conf.get<string>('wsPath') || 
		context.asAbsolutePath(path.join('server', 'apl-language-server.dws'));

	const serverOptions = () => new Promise<ChildProcess | StreamInfo>((resolve) => {
		// Use a TCP socket because of problems with blocking STDIO
		const server = net.createServer(socket => {
			// 'connection' listener
			console.log('APL LS process connected');
			socket.on('end', () => {
				console.log('APL LS process disconnected');
			});
			server.close();
			resolve({ reader: socket, writer: socket });
		});
		// Listen on random port
		server.listen(0, '127.0.0.1', () => {
			// The server is implemented in APL
			
			const adr = server.address();
			const hp = `${adr.address}:${adr.port}`;
			
			let args = [
				serverPath,
				'+s', 
				'-q'
			];
			const stdio = ['pipe', 'ignore', 'ignore'];
			if (/^win/i.test(process.platform)) { args = [serverPath]; stdio[0] = 'ignore'; }

			const childProcess = spawn(executablePath,
				args,
				{
					stdio,
					detached: true,
					env: Object.assign(
						{}, process.env,
						{
							CLASSICMODE: 1,
							SINGLETRACE: 1,
							MAXWS: maxWS,
						//	RIDE_INIT: 'CONNECT::4562',
							RIDE_SPAWNED: '1',
							AUTOCOMPLETE_PREFIXSIZE: 0,
							LSP_TCP: hp,
						},
					),
				},
			);
			childProcess.on('error', (err) => {
				window.showErrorMessage(`Failed launching the APL Language Server\n${err.name}\n${err.message}`);
			});
			return childProcess;
		});
	});

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for APL documents
		documentSelector: [{ scheme: 'file', language: 'apl' }],
		synchronize: {
			// Synchronize the setting section 'languageServerExample' to the server
			configurationSection: 'apl',
			// Notify the server about file changes to APL project files contain in the workspace
			// TODO: is there a way to configure this via the language server protocol?
			fileEvents: [
				workspace.createFileSystemWatcher('**/acreproject.txt'),
				workspace.createFileSystemWatcher('**/*.apl?'),
				workspace.createFileSystemWatcher('**/*.dyalog'),
				workspace.createFileSystemWatcher('**/*.dyapp')
			]
		}
	}

	// Create the language client and start the client.
	let client = new LanguageClient('apl', 'APL Language Server', serverOptions, clientOptions);
	let disposable = client.start();

	// Push the disposable to the context's subscriptions so that the 
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);
}

export function deactivate(): Thenable<void> {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
