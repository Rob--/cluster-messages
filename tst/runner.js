import cluster from 'node:cluster';
import os from 'node:os';
import chalk from 'chalk';

import ClusterMessages from '../src/cluster-messages.js';
import Tracker from './tracker.js';

const START_DELAY = 3000;

const benchmarks = [
  { instance: new ClusterMessages('1'), workers: 1, messages: 300000, increment: 100000 },
  { instance: new ClusterMessages('2'), workers: 2, messages: 300000, increment: 100000  },
  { instance: new ClusterMessages('3'), workers: 3, messages: 300000, increment: 100000  },
  { instance: new ClusterMessages('4'), workers: 4, messages: 300000, increment: 100000  },
  { instance: new ClusterMessages('5'), workers: 5, messages: 300000, increment: 100000  },
  { instance: new ClusterMessages('6'), workers: 6, messages: 300000, increment: 100000  }
];

const runFromPrimary = ({ instance, workers, messages, increment }, done, benchmarkIndex) => {
  const workerCount = Math.min(workers, os.cpus().length);

  os.cpus().slice(0, workerCount).forEach(() => cluster.fork({ BENCHMARK_INDEX: benchmarkIndex}));

  let tracker = new Tracker();
  instance.on('pong', (_, sendResponse) => {
    tracker.increment();

    if (!tracker.done()) {
      instance.send('ping');
    } else {
      if (tracker.capture()) {
        console.log(chalk.green(`Throughput: ${tracker.throughput().toLocaleString()}/s`));

        console.log(chalk.red(`Cleaning up benchmark #${benchmarkIndex + 1}`));
        Object.entries(cluster.workers)
          .forEach(([workerId, worker]) => worker.kill());

        done();
      }
    }
  });

  setTimeout(() => {
    tracker.record(messages, increment);
    instance.send('ping');
  }, START_DELAY);
};

const runFromWorker = ({ instance, workers }) => {
  instance.on('ping', (_, sendResponse) => {
    instance.send('pong');
  });
};

if (cluster.isPrimary) {
  benchmarks.reduce(async (previousValue, currentValue, index) => {
    await previousValue;

    const benchmark = benchmarks[index];
    console.log(chalk.cyan(`Executing benchmark #${index + 1}: ${benchmark.workers} @ ${benchmark.messages}`))
  
    return new Promise((resolve) => runFromPrimary(benchmarks[index], resolve, index));
  }, Promise.resolve())
} else {
  runFromWorker(benchmarks[process.env.BENCHMARK_INDEX]);
}

/**
 * Output:
 * 
 * ➜  cluster-messages git:(master) ✗ node tst/runner.js
Executing benchmark #1: 1 @ 300000
[Tracker] Hit 100000 in 1082ms
[Tracker] Hit 200000 in 2169ms
[Tracker] Hit 300000 in 3259ms
Throughput: 92,052.777/s
Cleaning up benchmark #1
Executing benchmark #2: 2 @ 300000
[Tracker] Hit 100000 in 205ms
[Tracker] Hit 200000 in 381ms
[Tracker] Hit 300000 in 562ms
Throughput: 533,807.829/s
Cleaning up benchmark #2
Executing benchmark #3: 3 @ 300000
[Tracker] Hit 100000 in 317ms
[Tracker] Hit 200000 in 685ms
[Tracker] Hit 300000 in 1058ms
Throughput: 283,553.875/s
Cleaning up benchmark #3
Executing benchmark #4: 4 @ 300000
[Tracker] Hit 100000 in 407ms
[Tracker] Hit 200000 in 879ms
[Tracker] Hit 300000 in 1376ms
Throughput: 218,023.256/s
Cleaning up benchmark #4
Executing benchmark #5: 5 @ 300000
[Tracker] Hit 100000 in 466ms
[Tracker] Hit 200000 in 975ms
[Tracker] Hit 300000 in 1530ms
Throughput: 196,078.431/s
Cleaning up benchmark #5
Executing benchmark #6: 6 @ 300000
[Tracker] Hit 100000 in 539ms
[Tracker] Hit 200000 in 1154ms
[Tracker] Hit 300000 in 1817ms
Throughput: 165,107.32/s
 */