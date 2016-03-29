let chokidar = require('chokidar');
let path_lib = require('path')

function initializeWatcher(dir, callbackfn) {
    let watcher = chokidar.watch(dir, {
        ignored: /[\/\\]\./,
        persistent: true
    })

    watcher
        .on('add', (path, stats) => {
            console.log(`File ${path} has been added` + new Date().toISOString())
            callbackfn("write", path_lib.relative(dir, path), "File", Date.now())
        })
        .on('change', (path, stats) => {
            console.log(`File ${path} has been changed` + new Date().toISOString())
            callbackfn("write", path_lib.relative(dir, path), "File", Date.now())
        })
        .on('unlink', (path) => {
            console.log(`File ${path} has been removed`)
            callbackfn("remove", path_lib.relative(dir, path), "File", Date.now())
        })
        .on('addDir', (path, stats) => {
            console.log(`Directory ${path} has been added` + new Date().toISOString())
            callbackfn("write", path_lib.relative(dir, path), "Directory", Date.now())
        })
        .on('unlinkDir', (path) => {
            console.log(`Directory ${path} has been removed`)
            callbackfn("remove", path_lib.relative(dir, path), "Directory", Date.now())
        })
        .on('ready', () => console.log('Initial scan complete. Ready for changes'));
     // Get list of actual paths being watched on the filesystem
     var watchedPaths = watcher.getWatched();
}
module.exports.initializeWatcher = initializeWatcher