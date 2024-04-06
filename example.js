import os from 'node:os';
import cluster from 'node:cluster';
import chalk from 'chalk';

import ClusterMessages from './src/cluster-messages.js';

const healthMonitor = new ClusterMessages('health', {
  log: {
    level: 'debug',
    type: 'hash'
  }
});
const workDispatcher = new ClusterMessages('work');

if (cluster.isMaster) {
  console.log(`Primary is running. PID: ${process.pid}`);

  os.cpus().slice(0, 2).forEach(() => cluster.fork());

  setInterval(() => {
    healthMonitor.send('ping', (response) => {
      const { worker, health } = response;
      console.log(`Worker #${chalk.blue(worker)} health status:`, health);
    });
  }, 5000);

  setTimeout(() => {
    workDispatcher.send('work1', { id: 123, duration: 500 }, (response) => {
      const { worker, id } = response;
      console.log(`Worker #${chalk.blue(worker)} finished job #${id}.`);
    });

    workDispatcher.send('work2', { id: 456 });

    workDispatcher.send('work3');
  }, 2500);

} else {
  console.log(`Worker ${cluster.worker.id} started`);

  healthMonitor.on('ping', (_, sendResponse) => {
    sendResponse({
      worker: cluster.worker.id,
      health: Math.random() < 0.8 ? 'good' : 'bad',
    })
  });

  workDispatcher.on('work1', ({ id, duration }, sendResponse) => {
    setTimeout(() => sendResponse({
      worker: cluster.worker.id,
      id
    }), duration);
  });

  workDispatcher.on('work2', ({ id }) => console.log(`Worker #${chalk.blue(cluster.worker.id)} received job #${id}`));

  workDispatcher.on('work3', () => console.log(`Worker #${chalk.blue(cluster.worker.id)} received a job`));
}

/**
 * Output:

➜  cluster-messages git:(master) ✗ node example.js
Primary is running. PID: 5334
Worker 1 started
Worker 2 started
[1] Received message: work1 @ c2304197
[2] Received message: work1 @ c2304197
[master] Sending message: work1 @ c2304197
[master] Sending message: work2 @ 393568ce
[1] Received message: work1 @ c2304197
[2] Received message: work1 @ c2304197
[1] Processing message: work1 @ c2304197
[master] Sending message: work3 @ 38bf766d
[2] Processing message: work1 @ c2304197
[1] Received message: work2 @ 393568ce
[2] Received message: work2 @ 393568ce
[1] Received message: work2 @ 393568ce
[2] Received message: work2 @ 393568ce
[1] Processing message: work2 @ 393568ce
[2] Processing message: work2 @ 393568ce
Worker #1 received job #456
Worker #2 received job #456
[1] Received message: work3 @ 38bf766d
[2] Received message: work3 @ 38bf766d
[1] Received message: work3 @ 38bf766d
[2] Received message: work3 @ 38bf766d
[1] Processing message: work3 @ 38bf766d
[2] Processing message: work3 @ 38bf766d
Worker #1 received a job
Worker #2 received a job
[2] Sending response: { worker: 2, id: 123 }
[1] Sending response: { worker: 1, id: 123 }
[master] Received message: work1 @ 83833be6
[master] Received message: work1 @ 83833be6
[master] Processing message: work1 @ 83833be6
Worker #2 finished job #123.
[master] Received message: work1 @ 719d057a
[master] Received message: work1 @ 719d057a
[master] Processing message: work1 @ 719d057a
Worker #1 finished job #123.
[master] Sending message: ping @ 94485156
[1] Received message: ping @ 94485156
[2] Received message: ping @ 94485156
[1] Processing message: ping @ 94485156
[2] Processing message: ping @ 94485156
[1] Sending response: { worker: 1, health: 'bad' }
[2] Sending response: { worker: 2, health: 'good' }
[1] Received message: ping @ 94485156
[2] Received message: ping @ 94485156
[master] Received message: ping @ cabaa9ae
[master] Processing message: ping @ cabaa9ae
Worker #1 health status: bad
[master] Received message: ping @ cabaa9ae
[master] Received message: ping @ 3068b86e
[master] Processing message: ping @ 3068b86e
Worker #2 health status: good
[master] Received message: ping @ 3068b86e

 */
