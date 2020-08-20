import { pseudoRandomBytes } from 'crypto';
//@ts-expect-error
import { jspack } from 'jspack';
import { connect, Socket } from 'net';
import { Writable } from 'stream';
import {
	concat,
	fromVarIntStream,
	packet,
	packString,
	readBytes,
	toVarInt,
	unpackStringFromStream
} from './protocol';

/** write bytes to stream, but wait until bytes are written */
export const write = (s: Writable, data: Uint8Array) =>
	new Promise((resolve, reject) =>
		s.write(data, err => (err ? reject(err) : resolve(data.length)))
	);

/** Half-close socket asynchronously */
export const end = (s: Socket) => new Promise(resolve => s.end(resolve));

export interface Chat {
	text: string;
	extra?: Chat[];
}

export interface Status {
	version: {
		name: string;
		protocol: number;
	};
	players: {
		max: number;
		online: number;
		sample?: { name: string; id: string }[];
	};
	description: Chat;
	favicon?: string;
	ping?: number;
}

/** Query for the status object of a Minecraft server */
export const status = async ({
	port = 25565,
	host = '127.0.0.1',
	ping: doPing = true
} = {}) => {
	const socket = connect(port, host);

	// Handshake (https://wiki.vg/Server_List_Ping#Handshake)
	await write(
		socket,
		packet(
			0,
			concat(
				// Protocol Version
				toVarInt(-1),

				// Server Address, unused by server
				packString(host),

				// Server Port, unused by server
				// TODO: Double check if this is encoded correctly
				new Uint8Array(jspack.Pack('H', [port])),

				// Next State (1 = status, 2 = login)
				toVarInt(1)
			)
		)
	);

	// Request (https://wiki.vg/Server_List_Ping#Request)
	await write(socket, packet(0, new Uint8Array()));

	// Response (https://wiki.vg/Server_List_Ping#Response)
	const res = {
		len: await fromVarIntStream(socket),
		id: await fromVarIntStream(socket),
		data: await unpackStringFromStream(
			socket,
			await fromVarIntStream(socket)
		)
	};
	const result: Status = JSON.parse(res.data);
	if (!doPing) {
		await end(socket);
		return result;
	}
	const pingStart = Date.now();

	// Ping (https://wiki.vg/Server_List_Ping#Ping)
	await write(socket, packet(1, new Uint8Array(pseudoRandomBytes(8))));

	// Pong (https://wiki.vg/Server_List_Ping#Pong)
	const pingRes = {
		len: await fromVarIntStream(socket),
		id: await fromVarIntStream(socket),
		data: await readBytes(socket, 8)
	};
	const ping = Date.now() - pingStart;
	await end(socket);
	result.ping = ping;
	return result;
};
