const cluster = require('cluster')

function Message(eventName, data, fromType){
    this.metaData = {
        eventName: eventName,
        from: fromType
    }

    this.data = data

    if(fromType == type.worker){
        this.metaData.workerid = cluster.worker.id
    }
}

Message.prototype.setCallbackId = function(id){
    this.metaData.callbackId = id
}

let type = {
    WORKER: 0, MASTER: 1
}

Message.prototype.WORKER = type.WORKER
Message.prototype.MASTER = type.MASTER

module.exports = Message