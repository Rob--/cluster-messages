import cluster from 'node:cluster';
import util from 'node:util';
import { createHash } from 'node:crypto';
import chalk from 'chalk';

export const defaultOptions = {
    log: {
        level: 'off',
        type: 'hash'
    },
    metadataKey: '__metadata__',
    metaKey: '__metadata__'
};

export const serialiseMessage = (message, options) => {
    const { eventName } = message[options.metadataKey];
    const hash = createHash('sha256');
    let serialised = util.inspect(message, { colors: true });

    if (options.log && options.log.type === 'hash') {
        serialised = chalk.yellow(hash.update(JSON.stringify(message)).digest('hex').substring(0, 8));
    }

    return `${chalk.blue(eventName)} @ ${serialised}`;
};

export const debug = (options, argsGenerator) => {
    const args = argsGenerator();

    args.unshift(cluster.isMaster ? chalk.green('[master]') : chalk.red(`[${cluster.worker.id}]`));
    if (options.log && ['debug'].includes(options.log.level)) {
        console.log.apply(this, args);
    }
};

export const warn = (options, argsGenerator) => {
    const args = argsGenerator();

    args.unshift(cluster.isMaster ? chalk.green('[master]') : chalk.red(`[${cluster.worker.id}]`));
    if (options.log && ['debug', 'warn'].includes(options.log.level)) {
        console.log.apply(this, args);
    }
};
