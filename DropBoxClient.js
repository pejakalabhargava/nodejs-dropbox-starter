/**
 * Created by bkakran on 3/28/16.
 */
'use strict'
require('./helper')
let tcp_helper = require('./tcp_helper')
let fs = require('fs')
let trycatch = require('trycatch')
let morgan = require('morgan')
let rimraf = require('rimraf')
let mkdirp = require('mkdirp')
let wrap = require('co-express')
let net = require('net')
let jsonSocket = require('json-socket')
let http = require('http')
let request = require('request');
let tar = require('tar-stream')
let path = require('path')
let argv = require('yargs')
    .default('dir', process.cwd())
    .argv
const ROOT = path.resolve(argv.dir)
const _0777 = parseInt('0777', 8);
const opts = {}
opts.mode = _0777;
const SERVER_URL = 'http://127.0.0.1:8000/';

function* main() {
    const dropbox_tcp_port = '8001'
    //tcp_helper.initializeWatcher(ROOT, sendUpdatesToServer);
    let socket = new jsonSocket(new net.Socket())
    socket.connect(dropbox_tcp_port, 'localhost');
    let connection = yield socket.promise.on('connect');

    let options = {
        url: SERVER_URL,
        headers: {'Accept': 'application/x-gtar'}
    }
    //yield rimraf.promise(ROOT)
    yield mkdirp.promise(ROOT, opts)

    var tarExtractStream = fs.createWriteStream(ROOT + '/release.tar');
    request(options, SERVER_URL).pipe(tarExtractStream).on('close', function () {
        console.log('File written!');
        extractContent(ROOT + '/release.tar')
        fs.unlink(ROOT + '/release.tar')
    })

    socket.on('message', function (message) {
        console.log(message)
        switch (message.type) {
            case 'File':
                handleFileChangesFromServer(message);
                //message.path message.updated message.action
                break
            case 'Directory':
                handleDirectoryChangesFromServer(message);
                break
        }
    })
}

function sendUpdatesToServer(action, path, type, time) {

}
function handleFileChangesFromServer(message) {
    if (message.action === 'write') {
        var fileStream = fs.createWriteStream(ROOT + path.sep + message.path);
        request(SERVER_URL + message.path, SERVER_URL).pipe(fileStream);
    } else if (message.action === 'remove') {
        fs.unlink(ROOT + path.sep + message.path)
    }
}
function handleDirectoryChangesFromServer(message) {

    let dirPath = ROOT + path.sep + message.path;

    if (message.action === 'write') {
        mkdirp(dirPath)
    } else if (message.action === 'remove') {
        rimraf(dirPath, function (err) {
            if (err) {
                throw err;
            }
            // done
        })
    }
}

function extractContent(tarFilePath) {
    var tarballExtract = tar.extract();
    tarballExtract.on('entry', function (header, stream, callback) {
        let filepath = ROOT + path.sep + header.name;
        let type = header['type'];
        if (type === 'directory') {
            mkdirp(filepath, opts)
        } else {
            let writeStream = fs.createWriteStream(filepath);
            stream.on('data', function (data) {
                writeStream.write(data)
            });
        }
        stream.on('end', function () {
            callback();
        });
        stream.resume();
    });
    tarballExtract.on('finish', function () {
        console.log('Done')
    });

    fs.createReadStream(tarFilePath).pipe(tarballExtract);
}
module.exports = main