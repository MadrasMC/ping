import type { Readable } from 'stream';

/** Serialize a number into a VarInt */
export const toVarInt = (n: number) => {
	const varInt = new Uint8Array(5);
	let i = 0;
	do {
		let tmp = n & 0b01111111;
		n >>>= 7;
		if (n !== 0) {
			tmp |= 0b10000000;
		}
		varInt[i] = tmp;
		i++;
	} while (n !== 0);
	return varInt.slice(0, i);
};

/** Deserialize a number from a VarInt */
export const fromVarInt = (varInt: Uint8Array) => {
	let i = 0;
	let n = 0;
	let tmp = 0;
	do {
		tmp = varInt[i];
		const val = tmp & 0b01111111;
		n |= val << (7 * i);
		i++;
		if (i > 5) {
			throw new Error('varInt too big');
		}
	} while ((tmp & 0b10000000) !== 0);
	return n;
};

/** Deserialize a number from a VarInt arriving from a stream of bytes */
export const fromVarIntStream = (
	stream: Readable,
	read: Uint8Array = new Uint8Array()
): Promise<number> =>
	new Promise(resolve =>
		stream.once('readable', () => {
			const arr = [];
			let byte;
			do {
				byte = stream.read(1);
				if (byte === null) {
					return resolve(
						fromVarIntStream(
							stream,
							concat2(read, new Uint8Array(arr))
						)
					);
				}
				byte = byte[0];
				arr.push(byte);
			} while (byte && (byte & 0b10000000) !== 0);
			return resolve(fromVarInt(concat2(read, new Uint8Array(arr))));
		})
	);

/** Concat two byte arrays */
export const concat2 = (a: Uint8Array, b: Uint8Array) => {
	const res = new Uint8Array(a.length + b.length);
	res.set(a);
	res.set(b, a.length);
	return res;
};

/** Concat N byte arrays */
export const concat = (...args: Uint8Array[]) =>
	args.reduce(concat2, new Uint8Array());

/** Convert a UTF-8 string into Buffer { ...VarInt, ...string } */
export const packString = (str: string) => {
	const bytes = new TextEncoder().encode(str);
	return concat2(toVarInt(bytes.length), bytes);
};

/** read N bytes from a stream asynchronously */
export const readBytes = (
	stream: Readable,
	length: number,
	read: Uint8Array = new Uint8Array()
): Promise<Uint8Array> =>
	new Promise<Uint8Array>(resolve =>
		stream.once('readable', () => {
			const buf = stream.read(length - read.length);
			if (buf === null) {
				return resolve(readBytes(stream, length, read));
			}
			const next = concat2(read, new Uint8Array(buf));
			if (next.length >= length) {
				return resolve(next);
			}
			return resolve(readBytes(stream, length, next));
		})
	);

/** Parse a UTF-8 string of the specified length out of a stream */
export const unpackStringFromStream = async (
	stream: Readable,
	length: number
) => new TextDecoder('utf-8').decode(await readBytes(stream, length));

/** Turn a buffer into a packet with a VarInt packet length and packet ID */
export const packet = (id: number, data: Uint8Array) => {
	const idVarInt = toVarInt(id);
	return concat(toVarInt(data.length + idVarInt.length), idVarInt, data);
};
