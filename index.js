const cluster = require('cluster');
const uuid = require('uuid4');

const has = Object.prototype.hasOwnProperty;

class ClusterMessages {
  constructor(options) {
    this.options = options || {};

    this.metaKey = this.options.metaKey || '__meta__';
    this.callbackTimeout = this.options.callbackTimeout || 1000 * 60 * 10;
    this.listeners = {};
    this.callbacks = {};

    this.initialise();
  }

  send(eventName, data, callback) {
    if (arguments.length === 2 && typeof data === 'function') {
      // eslint-disable-next-line
      callback = data;
    }

    /* Every message will have a meta data property, the name of this key is defined by
    * `metaKey`, any event that does not have this property is ignored. */
    const metaData = { eventName };

    if (cluster.isMaster) {
      metaData.fromMaster = true;
    } else {
      metaData.workerid = cluster.worker.id;
    }

    const message = {
      [this.metaKey]: metaData,
      data,
    };

    /* If the event being sent contains a function, generate a unique id
    * and save the function to be called at a later date. */
    if (typeof callback === 'function') {
      const id = uuid();
      this.callbacks[id] = callback;
      message[this.metaKey].id = id;

      /* This should not actually be needed, but to be 100% safe in case
       * messages between the master and worker processes are lost,
       * delete the callback function after a set timeout to prevent permanent memory hogging. */
      setTimeout(() => {
        if (has.call(this.callbacks, id)) {
          delete this.callbacks[id];
        }
      }, this.callbackTimeout);
    }

    if (cluster.isMaster) {
      // eslint-disable-next-line
      for (const id in cluster.workers) {
        cluster.workers[id].send(message);
      }
    } else {
      cluster.worker.send(message);
    }
  }

  on(eventName, callback) {
    /* If this event has not been defined before, make a new array,
     * if it has add the function to the array.
     * All functions are called to allow for multiple events to be set up under the same name. */
    if (!has.call(this.listeners, eventName)) {
      this.listeners[eventName] = [callback];
    } else {
      this.listeners[eventName].push(callback);
    }
  }

  initialise() {
    if (cluster.isMaster) {
      cluster.on('message', (worker, message) => {
        // Ignore any messages that didn't originate from this module.
        if (!has.call(message, this.metaKey)) {
          return;
        }

        if (message[this.metaKey].fromMaster) {
          this.emitCallbacks(message);
        }

        // Ignore any messages that don't have an event listener.
        if (!has.call(this.listeners, message[this.metaKey].eventName)) {
          return;
        }

        this.emitMasterEvents(message);
      });
    }

    if (cluster.isWorker) {
      process.on('message', (message) => {
        // Ignore any messages that didn't originate from this module.
        if (!has.call(message, this.metaKey)) {
          return;
        }

        if (message[this.metaKey].fromMaster) {
          this.emitWorkerEvents(message);
        }

        this.emitCallbacks(message);
      });
    }
  }

  emitWorkerEvents(message) {
    const { eventName } = message[this.metaKey];

    // Loop over all listeners that are set up and call them.
    this.listeners[eventName].forEach((callback, index, array) => {
      /* Callback is the actual event listener function `.on(name, callback)`, we call it
      * for all `onMasterEvent` listeners.
      *
      * The callback function itself takes a callback parameter that allows the master
      * to send back a response to the worker. */
      callback(message.data, (response) => {
        // If there is no callback, don't do anything.
        if (!has.call(message[this.metaKey], 'id')) {
          return;
        }

        // Strip the original message of properties we don't need (data)
        const responseMessage = {
          id: message[this.metaKey].id,
          eventName: message[this.metaKey].eventName,
          fromMaster: true,
          response,
        };

        // When all event listeners have been called, tell the worker to dispose of the callback.
        if (index === array.length - 1) {
          // responseMessage.deleteCallback = true
        }

        cluster.worker.send({
          [this.metaKey]: responseMessage,
        });
      });
    });
  }

  emitMasterEvents(message) {
    const { eventName } = message[this.metaKey];

    // Loop over all listeners that are set up and call them.
    this.listeners[eventName].forEach((callback, index, array) => {
      /* Callback is the actual event listener function `.on(name, callback)`, we call it
      * for all `onMasterEvent` listeners.
      *
      * The callback function itself takes a callback parameter that allows the master
      * to send back a response to the worker. */
      callback(message.data, (response) => {
        // If there is no callback, don't do anything.
        if (!has.call(message[this.metaKey], 'id')) {
          return;
        }

        // Worker (workerid) is an index for `cluster.workers`
        const { workerid } = message[this.metaKey];

        // As forks can die, ensure we can emit a message back to this worker.
        if (!cluster.workers[workerid]) {
          return;
        }

        // Strip the original message of properties we don't need (eventName, data, workerid)
        const responseMessage = {
          id: message[this.metaKey].id,
          response,
        };

        // When all event listeners have been called, tell the worker to dispose of the callback.
        if (index === array.length - 1) {
          responseMessage.deleteCallback = true;
        }

        cluster.workers[workerid].send({
          [this.metaKey]: responseMessage,
        });
      });
    });
  }

  emitCallbacks(message) {
    const { id } = message[this.metaKey];

    if (!has.call(this.callbacks, id)) {
      return;
    }

    const { response } = message[this.metaKey];
    this.callbacks[id](response);

    if (message[this.metaKey].deleteCallback) {
      delete this.callbacks[id];
    }
  }
}

module.exports = ClusterMessages;
