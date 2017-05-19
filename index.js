const cluster = require('cluster')
const uuid = require('uuid4')

function ClusterMessages(options){
    options = (options || {})

    this.strictMessaging = (options.strictMessaging || false)
    this.metaKey = (options.metaKey || '__meta__')
    this.callbackTimeout = (options.callbackTimeout || 1000 * 60 * 10)
    this.listeners = {}
    this.callbacks = {}

    this.initialise()
}

ClusterMessages.prototype.sendToMaster = function(eventName, data, callback){
    /*
     * Every message will have a meta data property, the name of this key is defined by
     * `metaKey`, any event that does not have this property is ignored.
     *
     * Meta data will contain the worker id so we know where to send a message to
     * after the master receives it.
     */
    let metaData = {
        workerid: cluster.worker.id,
        eventName: eventName
    }

    /*
     * Each message is formed with the following properties:
     * {
     *   data: external data that is passed in,
     *   metaKey: {
     *     id: a unique id to identify the callback that is saved,
     *     workerid: the worker from which the request originated,
     *     eventName: the name of the event
     *   }
     * }
     */
    let message = {
        data: data
    }

    message[this.metaKey] = metaData

    /*
     * If the event being sent contains a function, generate a unique id
     * and save the function to be called at a later date.
     */
    if(typeof(callback) === 'function'){
        let id = uuid()
        this.callbacks[id] = callback
        message[this.metaKey].id = id

        /*
         * This should not actually be needed, but to be 100% safe in case
         * messages between the master and worker processes are lost,
         * delete the callback function after a set timeout to prevent permanent memory hogging.
         */
        setTimeout(function(){
            if(this.callbacks.hasOwnProperty(id)){
                delete this.callbacks[id]
            }
        }, this.callbackTimeout)
    }

    cluster.worker.send(message)
}

ClusterMessages.prototype.onMasterEvent = function(eventName, callback){
    /*
     * If this event has not been defined before, make a new array,
     * if it has add the function to the array.
     * All functions are called to allow for multiple events to be set up under the same name.
     */
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

            // Ignore any messages that don't have an event listener.
            if(!self.listeners.hasOwnProperty(message[self.metaKey].eventName)){
                return
            }

            function emitEvent(callback, index, array){
                /*
                 * Callback is the actual event listener function `.on(name, callback)`, we call it
                 * for all `onMasterEvent` listeners.
                 *
                 * The callback function itself takes a callback parameter that allows the master
                 * to send back a response to the worker.
                 */
                callback(message.data, function(response){
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
            }

            let eventName = message[self.metaKey].eventName

            // Loop over all listeners that are set up and call them.
            self.listeners[eventName].forEach(emitEvent)
        })
    }

    if(cluster.isWorker){
        process.on('message', function(message){
            // Ignore any messages that didn't originate from this module.
            if(!message.hasOwnProperty(self.metaKey)){
                return
            }

            /*
             * At this point, this message will be coming from the master. So we check if
             * we have a callback waiting (from when the worker emitted the event),
             * and if we do we invoke it with the response as a parameter.
             */
            let callbackKey = message[self.metaKey].id
            if(self.callbacks.hasOwnProperty(callbackKey)){
                let response = message[self.metaKey].response
                self.callbacks[callbackKey](response)

                if(message[self.metaKey].deleteCallback){
                    delete self.callbacks[callbackKey]
                }
            }
        })
    }
}

module.exports = ClusterMessages