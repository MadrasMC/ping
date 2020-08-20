import { inspect } from 'util';
import { status } from './status';

const pretty = (x: unknown) =>
	inspect(x, { depth: Infinity, colors: process.stdout.isTTY });

const [port = 25565, host = '127.0.0.1', ping = true] = process.argv.slice(2);

status({
	port: Number(port),
	host,
	ping: ping === true || ping === 'true' || ping === '1'
}).then(x => {
	delete x.favicon;
	console.log(pretty(x));
}, console.error);
