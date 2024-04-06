import chalk from 'chalk';

class Tracker {
    constructor() {
        this.counter = 0;
        this.startTime = 0;
        this.checkpoint = 0;
        this.target = 0;
        this.endTime = 0;
        this.interval = 0;
        this.captured = false;
    }

    increment() {
        this.counter += 2;

        if (this.counter % this.interval === 0) {
            const endTime = new Date().getTime();
            console.log(chalk.yellow(`[Tracker] Hit ${this.counter} in ${endTime - this.startTime}ms`))
            this.checkpoint = new Date().getTime();
        }

        if (this.counter === this.target) {
            this.endTime = new Date().getTime();
        }
    }

    throughput() {
        const duration = this.endTime - this.startTime;
        return (this.target / duration) * 1000;
    }

    done() {
        return this.counter >= this.target;
    }

    capture() {
        if (!this.captured) {
            this.captured = true;
            return this.captured;
        }

        return false;
    }

    record(target, interval = 100000) {
        if (interval % 2 === 1) {
            console.error('Interval should be even number.');
        }

        this.target = target;
        this.interval = interval;
        this.startTime = this.checkpoint = new Date().getTime();
    }
}

export default Tracker;
