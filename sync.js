const path = require('path');
let dirname = process.argv[2] || path.join(__dirname, '..')
module.paths.push(dirname);
require('./server/edm').sync(dirname);

