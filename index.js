const cluster = require('cluster')
const uuid = require('uuid4')

const Message = require('./message')

function ClusterMessages(options){
    options = (options || {})

    this.metaKey =          (options.metaKey || '__meta__')
    this.callbackTimeout =  (options.callbackTimeout || 1000 * 60 * 10)
    this.listeners =        {}
    this.callbacks =        {}

    this.initialise()
}

ClusterMessages.prototype.send = function(eventName, data, callback){
    if(arguments.length == 2 && typeof(data) == 'function'){
        callback = data
    }

    /* Every message will have a meta data property, the name of this key is defined by
     * `metaKey`, any event that does not have this property is ignored. */
    let metaData = {
        eventName: eventName
    }

    if(cluster.isMaster){
        metaData.fromMaster = true
    } else {
        metaData.workerid = cluster.worker.id
    }

    let message = {
        data: data,
        [this.metaKey]: metaData
    }

    /* If the event being sent contains a function, generate a unique id
     * and save the function to be called at a later date. */
    if(typeof(callback) === 'function'){
        let id = uuid()
        this.callbacks[id] = callback
        message[this.metaKey].id = id

        /* This should not actually be needed, but to be 100% safe in case
         * messages between the master and worker processes are lost,
         * delete the callback function after a set timeout to prevent permanent memory hogging. */
        setTimeout(function(){
            if(this.callbacks.hasOwnProperty(id)){
                delete this.callbacks[id]
            }
        }, this.callbackTimeout)
    }

    if(cluster.isMaster){
        for(const id in cluster.workers){
            cluster.workers[id].send(message)
        }
    } else {
        cluster.worker.send(message)
    }
}

ClusterMessages.prototype.on = function(eventName, callback){
    /* If this event has not been defined before, make a new array,
     * if it has add the function to the array.
     * All functions are called to allow for multiple events to be set up under the same name. */
    if(!this.listeners.hasOwnProperty(eventName)){
        this.listeners[eventName] = [callback]
    } else {
        this.listeners[eventName].push(callback)
    }
}

ClusterMessages.prototype.initialise = function(){
    let self = this
    if(cluster.isMaster){
        cluster.on('message', function(worker, message, handle){
            // Ignore any messages that didn't originate from this module.
            if(!message.hasOwnProperty(self.metaKey)){
                return
            }

            if(message[self.metaKey].fromMaster){
                emitCallbacks(self, message)
            }

            // Ignore any messages that don't have an event listener.
            if(!self.listeners.hasOwnProperty(message[self.metaKey].eventName)){
                return
            }

            emitMasterEvents(self, message)
        })
    }

    if(cluster.isWorker){
        process.on('message', function(message){
            // Ignore any messages that didn't originate from this module.
            if(!message.hasOwnProperty(self.metaKey)){
                return
            }

            if(message[self.metaKey].fromMaster){
                emitWorkerEvents(self, message)
            }

            emitCallbacks(self, message)
        })
    }
}

function emitWorkerEvents(self, message){
    let eventName = message[self.metaKey].eventName

    // Loop over all listeners that are set up and call them.
    self.listeners[eventName].forEach(function (callback, index, array){
        /* Callback is the actual event listener function `.on(name, callback)`, we call it
         * for all `onMasterEvent` listeners.
         *
         * The callback function itself takes a callback parameter that allows the master
         * to send back a response to the worker. */
        callback(message.data, function(response){

            // If there is no callback, don't do anything.
            if(!message[self.metaKey].hasOwnProperty('id')){
                return
            }

            // Strip the original message of properties we don't need (data)
            let responseMessage = {
                id: message[self.metaKey].id,
                response: response,
                eventName: message[self.metaKey].eventName,
                fromMaster: true
            }

            // When all event listeners have been called, tell the worker to dispose of the callback.
            if(index == array.length - 1){
                // responseMessage.deleteCallback = true
            }

            cluster.worker.send({
                [self.metaKey]: responseMessage
            })

        })
    })
}

function emitMasterEvents(self, message){
    let eventName = message[self.metaKey].eventName

    // Loop over all listeners that are set up and call them.
    self.listeners[eventName].forEach(function (callback, index, array){
        /* Callback is the actual event listener function `.on(name, callback)`, we call it
         * for all `onMasterEvent` listeners.
         *
         * The callback function itself takes a callback parameter that allows the master
         * to send back a response to the worker. */
        callback(message.data, function(response){

            // If there is no callback, don't do anything.
            if(!message[self.metaKey].hasOwnProperty('id')){
                return
            }

            // Worker (workerid) is an index for `cluster.workers`
            let worker = message[self.metaKey].workerid

            // As forks can die, ensure we can emit a message back to this worker.
            if(!cluster.workers[worker]){
                return
            }

            // Strip the original message of properties we don't need (eventName, data, workerid)
            let responseMessage = {
                id: message[self.metaKey].id,
                response: response
            }

            // When all event listeners have been called, tell the worker to dispose of the callback.
            if(index == array.length - 1){
                responseMessage.deleteCallback = true
            }

            cluster.workers[worker].send({
                [self.metaKey]: responseMessage
            })

        })
    })
}

function emitCallbacks(self, message){
    let callbackKey = message[self.metaKey].id
    if(!self.callbacks.hasOwnProperty(callbackKey)){
        return
    }

    let response = message[self.metaKey].response
    self.callbacks[callbackKey](response)

    if(message[self.metaKey].deleteCallback){
        delete self.callbacks[callbackKey]
    }
}

module.exports = ClusterMessages