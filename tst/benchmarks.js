import cluster from 'node:cluster';
import os from 'node:os';

import ClusterMessages from '../src/cluster-messages.js';

const benchmarks = new ClusterMessages();

if (cluster.isMaster) {
  console.log(`Primary is running. PID: ${process.pid}`);

  os.cpus().slice(0, 1).forEach(() => cluster.fork());

  let counter = 0;
  benchmarks.on('pong', (_, sendResponse) => {
    counter++;

    if (counter === 100000) {
        console.timeEnd('100k');
        console.time('200k');
        benchmarks.send('ping');
    } else if (counter === 200000) {
        console.timeEnd('200k');
    } else {
        benchmarks.send('ping');
    }
  });

  setTimeout(() => {
    console.time('100k');
    benchmarks.send('ping')
  }, 2500);

} else {
  console.log(`Worker ${cluster.worker.id} started`);

  benchmarks.on('ping', (_, sendResponse) => {
    benchmarks.send('pong');
  });
}
