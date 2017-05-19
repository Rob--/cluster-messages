# cluster-messages
A helpful Node module to make it easy to send messages between the
master and workers with callbacks.

# Usage

Require the package:
```javascript
let ClusterMessages = require('cluster-messages')`
let messages = new ClusterMessages()
```

If the process is a master, set up event listeners:
```javascript
if(cluster.isMaster){
    messages.onMasterEvent('addTwoNumbers', (data, callback) => {
        callback(data.x + data.y)
    })
}
```

If the process is a worker, send messages to the master:
```javascript
if(cluster.isWorker){
    let data = {
        x: Math.round(Math.random()  * 100),
        y: Math.round(Math.random()  * 100)
    }

    messages.sendToMaster('addTwoNumber', data, response => {
        console.log(`${data.x} + ${data.y} = ${response}`)
    })
}
```