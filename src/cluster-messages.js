import cluster from 'node:cluster';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';

import { defaultOptions, serialiseMessage, debug, warn } from '#utils';

const has = Object.prototype.hasOwnProperty;

class ClusterMessages {
  constructor(instance, options) {
    if (arguments.length === 0) {
      instance = 'global';
    }

    if (typeof instance === 'object') {
      options = instance;
      instance = 'global';
    }

    this.instance = instance;
    this.options = {...defaultOptions, ...(options || {})};

    this.listeners = {};
    this.callbacks = {};

    this.listen();
  }

  /**
   * Start listening for messages.
   */
  listen() {
    if (cluster.isMaster || cluster.isPrimary) {
      cluster.on('message', (worker, message) => this.handleMessage(message, worker));
    } else {
      process.on('message', (message) => this.handleMessage(message));
    }
  }

  /**
   * Emits an event.
   * - From a worker: event is sent to the primary
   * - From primary: event is broadcasted to workers
   * 
   * @param {string} eventName name of the event
   * @param {any} data event data
   * @param {function} callback response handler
   */
  send(eventName, data, callback) {
    if (arguments.length === 2 && typeof data === 'function') {
      // eslint-disable-next-line
      callback = data;
    }

    const metadata = {
      instance: this.instance,
      eventName
    };

    if (!cluster.isMaster) {
      metadata.workerid = cluster.worker.id;
    }

    const message = {
      [this.options.metadataKey]: metadata,
      data,
    };

    if (typeof callback === 'function') {
      const callbackId = uuidv4();
      this.callbacks[callbackId] = callback;
      message[this.options.metadataKey].callbackId = callbackId;
    }

    // debug(this.options, () => ['Sending message:', serialiseMessage(message, this.options)]);

    if (cluster.isMaster || cluster.isPrimary) {
      Object.entries(cluster.workers).forEach(([workerId, worker]) => worker.send(message));
    } else {
      process.send(message);
    }
  }

  /**
   * Registers an event listener.
   * - From a worker: listens to events from the primary
   * - From primary: listens to events from all workers
   * 
   * @param {string} eventName event name
   * @param {function} callback event handler
   */
  on(eventName, callback) {
    this.listeners[eventName] = [callback, ...(this.listeners[eventName] || [])];
  }

  /**
   * Handles an internal message by triggering event handlers (for requests) and response handlers (for responses).
   * 
   * @param {object} message message
   * @param {worker} worker worker
   * @returns
   */
  handleMessage(message, worker) {
    // debug(this.options, () => ['Received message:', serialiseMessage(message, this.options)]);

    // Ignore any messages that didn't originate from this module.
    if (!has.call(message, this.options.metadataKey)) {
      return;
    }

    // Ignore any messages that originated from other cluster-messages instances
    if (message[this.options.metadataKey].instance !== this.instance) {
      return;
    }

    // debug(this.options, () => ['Processing message:', serialiseMessage(message, this.options)]);

    if (has.call(message[this.options.metadataKey], 'response')) {
      // If this is a response, we trigger the callback in the initial emit call
      this.triggerResponseHandlers(message);
    } else {
      // If this is a request, we trigger the event listeners
      this.triggerEventListeners(message);
    }
  }

  /**
   * Generates a function that is used to send a response back to the event emitter.
   * 
   * @param {object} requestMessage request message
   * @returns sendResponse function
   */
  generateSendResponse(requestMessage) {
    return (response) => {
      // debug(this.options, () => ['Sending response:', response]);

      // If there is no callback, don't do anything.
      if (!has.call(requestMessage[this.options.metadataKey], 'callbackId')) {
        return;
      }

      if (cluster.isMaster || cluster.isPrimary) {
        // As forks can die, ensure we can emit a message back to this worker.
        if (!cluster.workers[requestMessage[this.options.metadataKey].workerid]) {
          return;
        }
      }

      // Strip the original message of properties we don't need (eventName, data, workerid)
      const metadata = {
        callbackId: requestMessage[this.options.metadataKey].callbackId,
        instance: this.instance,
        eventName: requestMessage[this.options.metadataKey].eventName,
        response,
      };

      const message = {
        [this.options.metadataKey]: metadata,
      };

      if (cluster.isMaster || cluster.isPrimary) {
        const { workerid } = requestMessage[this.options.metadataKey];
        cluster.workers[workerid].send(message);
      } else {
        process.send(message);
      }      
    };
  }

  /**
   * Handles requests.
   * Trigger all of the registered event listeners for a given event.
   * 
   * @param {object} message message
   * @returns
   */
  triggerEventListeners(message) {
    const { eventName } = message[this.options.metadataKey];

    if (!has.call(this.listeners, eventName)) {
      warn(this.options, () => [
        chalk.yellow('cluster-messages received event with no registered listener:'),
        serialiseMessage(message, this.options)
      ]);
      return;
    }

    // Loop over all listeners and call them
    // Callback function provides the data and the `sendResponse` function
    this.listeners[eventName].forEach(callback => callback(message.data, this.generateSendResponse(message)));
  }

  /**
   * Handles responses.
   * Trigger all of the registered response handlers for a given event.
   * 
   * @param {object} message message
   * @returns
   */
  triggerResponseHandlers(message) {
    const { callbackId } = message[this.options.metadataKey];

    if (!has.call(this.callbacks, callbackId)) {
      return;
    }

    this.callbacks[callbackId](message[this.options.metadataKey].response);
  }
}

export default ClusterMessages;
