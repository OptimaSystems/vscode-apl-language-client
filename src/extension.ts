/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

// import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	StreamInfo
} from 'vscode-languageclient';
import { ChildProcess, spawn } from 'child_process';
import * as net from 'net';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	const conf = workspace.getConfiguration('apl');
    const executablePath = conf.get<string>('executablePath') || 'mapl';

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
			
			let args = ['+s', '-q'];
			const stdio = ['pipe', 'ignore', 'ignore'];
			if (/^win/i.test(process.platform)) { args = []; stdio[0] = 'ignore'; }
            
			const childProcess = spawn(executablePath, 
			// 	[
            //     context.asAbsolutePath(path.join('vendor', 'felixfbecker', 'language-server', 'bin', 'php-language-server.php')),
            //     '--tcp=127.0.0.1:' + server.address().port,
            //     '--memory-limit=' + memoryLimit
			// ],
				args, 
				{
					stdio,
					detached: true,
					env: Object.assign(
						{}, process.env, 
						{
							CLASSICMODE: 1,
							SINGLETRACE: 1,
							RIDE_INIT: 'SERVE::4562',
							RIDE_SPAWNED: '1',
							AUTOCOMPLETE_PREFIXSIZE: 0,
							LSP_TCP: hp,
						},
					),
				},
			);
            childProcess.stderr.on('data', (chunk: Buffer) => {
                console.error(chunk + '');
            });
            childProcess.stdout.on('data', (chunk: Buffer) => {
                console.log(chunk + '');
            });
            return childProcess;
        });
	});
	
	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	// let serverOptions: ServerOptions = {
	// 	run: { module: serverModule, transport: TransportKind.ipc },
	// 	debug: {
	// 		module: serverModule,
	// 		transport: TransportKind.ipc,
	// 		options: debugOptions
	// 	}
	// };

	// let args: string[] = ['+s','-q','>/dev/null'];
	// let options: ExecutableOptions = {
	// 	env: {
	// 		CLASSICMODE: 1,
	// 		SINGLETRACE: 1,
	// 		RIDE_INIT: 'SERVE::4502'
	// 	},
	// 	detached: true
	// }
	// // If the extension is launched in debug mode then the debug server options are used
	// // Otherwise the run options are used
	// let serverOptions: ServerOptions = {
	// 	run : { command: serverMain, args, options, transport },
	// 	debug : { command: serverMain, args, options, transport }
	// }
	
	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for F# documents
		documentSelector: [{scheme: 'file', language: 'apl'}],
		synchronize: {
			// Synchronize the setting section 'languageServerExample' to the server
			configurationSection: 'apl',
			// Notify the server about file changes to F# project files contain in the workspace
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

// function binName() {
// 	if (process.platform === 'win32')
// 		return path.join('dyalog.exe');
// 	else
// 		return path.join('Applications','Dyalog-17.0.app','Contents','Resources','Dyalog','mapl');	
// }