const cluster = require('cluster')
const ClusterMessages = require('./index')

let messages = new ClusterMessages()

if(cluster.isMaster){
    console.log(`Master ${process.pid} is running`)

    for(let i = 0; i < require('os').cpus().length; i++){
        cluster.fork()
    }

    messages.on('addTwoNumbers', function(data, callback){
        callback(data.x + data.y)
    })

    /* Timeout to wait for workers to fork.
     * This event is emitted from the master to all the workers. */
    setTimeout(function(){
        messages.send('getWorkerPID', null, function(response){
            console.log(`Worker with ID #${response.id} has PID of ${response.pid}`)
        })
    }, 3000)
}
 else {
    console.log(`Worker ${cluster.worker.process.pid} started`)

    let data = {
        x: Math.round(Math.random()  * 100),
        y: Math.round(Math.random()  * 100)
    }

    /* Timeout is to wait for all the workers to spawn. */
    setTimeout(function(){
        messages.send('addTwoNumbers', data, function(response){
            console.log(`${data.x} + ${data.y} = ${response}`)
        })
    }, 3000)

    messages.on('getWorkerPID', function(data, sendResponse){
        sendResponse({
            id: cluster.worker.id,
            pid: cluster.worker.process.pid
        })
    })
}

/**
 OUTPUT:

 user@NAME ~/dir/cluster-messages (master)
 $ node example.js
 Master 11844 is running
 Worker 5320 started
 Worker 13044 started
 Worker 16480 started
 Worker 15840 started
 Worker 8080 started
 Worker 14792 started
 Worker 6744 started
 Worker 2376 started
 Worker with ID #1 has PID of 5320
 Worker with ID #2 has PID of 13044
 Worker with ID #3 has PID of 15840
 Worker with ID #6 has PID of 2376
 Worker with ID #4 has PID of 8080
 Worker with ID #7 has PID of 6744
 Worker with ID #5 has PID of 16480
 Worker with ID #8 has PID of 14792
 32 + 4 = 36
 12 + 56 = 68
 45 + 62 = 107
 29 + 17 = 46
 9 + 26 = 35
 36 + 80 = 116
 40 + 63 = 103
 65 + 49 = 114
 */