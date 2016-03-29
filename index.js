require('./helper')
let tcp_helper = require('./tcp_helper')
let fs = require('fs')
let express = require('express')
let morgan = require('morgan')
let trycatch = require('trycatch')
let wrap = require('co-express')
let path = require('path')
let mime = require('mime-types')
let mkdirp = require('mkdirp')
let rimraf = require('rimraf')
let archiver = require('archiver')
let argv = require('yargs')
    .default('dir', process.cwd())
    .argv
let net = require('net')
let JsonSocket = require('json-socket')

const ROOT = path.resolve(argv.dir)

let tcpClients = []

function* main() {
    console.log('Starting server...')
    let app = express()
    app.use(morgan('dev'))
    app.use((req, res, next) => {
        trycatch(next, e => {
            console.log(e.stack)
            res.writeHead(500)
            res.end(e.stack)
        })
    })
    app.get('*', wrap(setData), wrap(setDirDetails), wrap(sendHeaders), wrap(read))
    app.head('*', wrap(setData), wrap(sendHeaders), wrap(end))
    app.put('*', wrap(setData), wrap(setDirDetails), wrap(create))
    app.post('*', wrap(setData), wrap(setDirDetails), wrap(update))
    app.del('*', wrap(setData), wrap(remove))
    let port = 8000
    app.listen(port)
    console.log(`LISTENING @ http://127.0.0.1:${port}`)


    let dropbox_tcp_port = 8001;
    let tcp_server = net.createServer();
    tcp_server.listen(dropbox_tcp_port);
    tcp_server.on('connection', function (socket) { //This is a standard net.Socket
        socket = new JsonSocket(socket); //Now we've decorated the net.Socket to be a JsonSocket
        tcpClients.push(socket)
        /*
         socket.on('message', function (message) {
         socket.sendMessage(message);
         });
         */
        socket.sendMessage("Success");
    });

    tcp_helper.initializeWatcher(ROOT, sendClientUpdates);
}

function* setData(req, res, next) {
    let filePath = path.join(ROOT, req.url)
    try {
        let stats = yield fs.promise.stat(filePath)
        req.stats = stats
    } catch (e) {
        if ('ENOENT' == e.code) {
            req.stats = undefined
        }
    }
    req.pathVar = filePath;
    next()
}

function* sendHeaders(req, res, next) {
    if (req.stats) {
        if (req.stats.isDirectory()) {
            let accepts = req.headers['accept'];
            if (accepts.indexOf('application/x-gtar') != -1) {
                res.setHeader('Content-Type', 'application/zip')
            } else {
                let fileNames = JSON.stringify(yield fs.promise.readdir(req.pathVar))
                console.log(fileNames)
                res.setHeader('Content-Length', fileNames.length)
                res.setHeader('Content-Type', 'application/json')
                res.contents = fileNames;
            }
        } else {
            res.setHeader('Content-Length', req.stats.size)
            let contentType = mime.contentType(path.extname(req.pathVar))
            res.setHeader('Content-Type', contentType)
        }
        next()
    } else {
        res.send(400, 'File Does Not Exist')
    }
}

function * end(req, res) {
    res.end()
}

function* read(req, res) {
    let accepts = req.headers['accept'];
    if (req.isDir && accepts.indexOf('application/x-gtar') != -1) {
        console.log('here');
        //res.attachment('download.zip');
        res.setHeader('Content-disposition', 'attachment; filename=download.tar');
       //var tarExtractStream = fs.createWriteStream(ROOT +'/release1.zip');
        let archive = archiver('tar')
        //archive.pipe(tarExtractStream);
        archive.pipe(res);
        /* var files =  yield fs.promise.readdir(req.pathVar)
         for (let file of files) {
         //let loaclFilePath = ROOT + path.sep + file
         archive.file(file, {name: path.basename(file)});
         }
         */
        archive.bulk([
            {expand: true, cwd: req.pathVar, src: ['**']}
        ])
        //src: ['**/*']}
        // archive.directory(req.pathVar)
        archive.finalize()
        //res.end();
      //  let stats = yield fs.promise.stat(ROOT +'/release1.zip')
        //console.log(stats)
       //res.setHeader('Content-Length', stats['size'])
        //res.download('release1.zip');
    } else if (res.contents) {
        res.json(res.contents)
    } else {
        fs.createReadStream(req.pathVar).pipe(res)
    }
}

function* create(req, res) {
    if (req.stats) {
        res.send(405, 'File Exists')
    }
    yield mkdirp.promise(req.dirPath)
    if (!req.isDir) req.pipe(fs.createWriteStream(req.pathVar))
    res.end()
}

function* update(req, res) {
    if (!req.stats) return res.send(405, 'File does not exist')
    if (req.isDir || req.stats.isDirectory()) return res.send(405, 'Path is a directory')
    yield fs.promise.truncate(req.pathVar, 0)
    req.pipe(process.stdout)
    console.log(req)
    req.pipe(fs.createWriteStream(req.pathVar))
    res.end()
}

function* remove(req, res) {
    if (!req.stats) return res.send(400, 'Invalid Path')
    if (req.stats.isDirectory()) {
        yield rimraf.promise(req.pathVar)
    } else {
        yield fs.promise.unlink(req.pathVar)
    }
    res.end()
}

function* setDirDetails(req, res, next) {
    let filePath = req.pathVar
    let endsWithSlash = filePath.charAt(filePath.length - 1) === path.sep
    let hasExt = path.extname(filePath) !== ''
    req.isDir = endsWithSlash || !hasExt
    req.dirPath = req.isDir ? filePath : path.dirname(filePath)
    next()
}


function writeZip(dir, name) {
    var zipName = name + ".zip",
        fileArray = fs.readdir(dir),
        output = fs.createWriteStream(zipName),
        archive = archiver('zip');

    archive.pipe(output);

    fileArray.forEach(function (item) {
        var file = item.path + item.name;
        archive.append(fs.createReadStream(file), {name: item.name});
    });

    archive.finalize(function (err, written) {
        if (err) {
            throw err;
        }
    });
}

function sendClientUpdates(action, path, type, time) {
    var timeInMillis = Date.parse(time);
    for (let tcpClient of tcpClients) {
        tcpClient.sendMessage({action: action, path: path, type: type, updated: time})
    }
}

module.exports = main
