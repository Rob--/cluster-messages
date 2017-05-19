const cluster = require('cluster')
const ClusterMessages = require('./index')

let messages = new ClusterMessages()

if(cluster.isMaster){
    console.log(`Master ${process.pid} is running`)

    for(let i = 0; i < require('os').cpus().length; i++){
        cluster.fork()
    }

    messages.onMasterEvent('addTwoNumbers', function(data, callback){
        callback(data.x + data.y)
    })
} else {
    console.log(`Worker ${cluster.worker.process.pid} started`)

    let data = {
        x: Math.round(Math.random()  * 100),
        y: Math.round(Math.random()  * 100)
    }

    messages.sendToMaster('addTwoNumbers', data, function(response){
        console.log(`${data.x} + ${data.y} = ${response}`)
    })
}