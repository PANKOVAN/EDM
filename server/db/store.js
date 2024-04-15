'use strict'
/**
 * Библиотека EDM. Хранилище.
 */

const helpers = require('./helpers');
const pathLib = require('path');
const fs = require('fs');
const fsp = fs.promises;

module.exports = {
    init: function (baseDir) {
        this.baseDir = baseDir;
    },

    /**
     * Возвращает путь к папке, в которой хранятся все статьи ревизии.
     * Изпользуется для файловой системы.
     * Если заданы дополнительные параметры, то к пути добавляются подпапки
     * @param {object} revision ревизия
     */
    getRevisionPath: function (revision /*,folder, folder ....*/) {
        let result = '';
        if (revision) {
            if (typeof revision == 'string') {
                result = revision;
                result = pathLib.join(this.baseDir, result);
            }
            else if (typeof revision == 'object') {
                let idpath = revision.getPath();
                result = pathLib.join(this.baseDir, 'data', idpath);
            }
            for (let i = 1; i < arguments.length; i++) {
                if (arguments[i]) result = pathLib.join(result, arguments[i]);
            }
        }
        return result.replace(/\\/g, '/').replace('/store//store', '/store').replace('/store/store', '/store');
    },
    /**
     * Возвращает путь к папке, в которой хранятся все статьи ревизии.
     * Изпользуется для url.
     * Если заданы дополнительные параметры, то к пути добавляются подпапки.
     * @param {object} revision ревизия
     */
    getStorePath: function (revision /*,folder, folder ....*/) {
        let result = '';
        if (revision) {
            if (typeof revision == 'string') {
                result = revision;
                if (result.startsWith(this.baseDir)) {
                    result = pathLib.join(result.substr(this.baseDir.length + 1));
                }
            }
            else if (typeof revision == 'object') {
                let idpath = revision.getPath();
                result = pathLib.join('store', 'data', idpath);
            }
            for (let i = 1; i < arguments.length; i++) {
                if (arguments[i]) result = pathLib.join(result, arguments[i]);
            }
        }
        return '/' + result.replace(/\\/g, '/').replace(/\#/g, '%23');
    },

    /**
     * Возвращает список файлов ревизии для заданной папки
     * Для каждого файла устанавливает "атрибуты" - массив подстрок имени файла разбитого через точку и переведенного в нижний регистр
     * @param {object} revision ревизия
     */
    getRevisionFolder: async function (revision /*,folder, folder ....*/) {
        let revisionPath = this.getRevisionPath.apply(this, arguments);
        let f = (await (fsp.access(revisionPath).then(() => true).catch(() => false)));
        if (f) {
            let files = await fsp.readdir(revisionPath, { withFileTypes: true });
            files.forEach(file => {
                file.attrs = file.name.toLowerCase().split('.');
            });
            return files;
        }
        return [];
    },
    /**
     * Возвращает список файлов c полными путями (гкд) ревизии для заданной папки 
     * Для каждого файла устанавливает "аттрибуты" - массив подстрок имени файла разбитого через точку и переведенного в нижний регистр
     * @param {object} revision ревизия
     */
    getStoreFolder: async function (revision /*,folder, folder ....*/) {
        let revisionPath = this.getRevisionPath.apply(this, arguments);
        let storePath = this.getStorePath.apply(this, arguments);
        let f = (await (fsp.access(revisionPath).then(() => true).catch(() => false)));
        if (f) {
            let files = await fsp.readdir(revisionPath, { withFileTypes: true });
            files.forEach(file => {
                file.attrs = file.name.toLowerCase().split('.');
                file.path = storePath + '/' + file.name;
            });
            return files;
        }
        return [];
    },
    /**
     * Читает заданный файл
     * @param {object} revision ревизия
     */
    readFile: async function (revision /*,folder, folder ....*/) {
        let revisionPath = this.getRevisionPath(arguments);
        let f = (await (fsp.access(revisionPath).then(() => true).catch(() => false)));
        if (f) return await fsp.readFile(revisionPath);
        return undefined;
    },
    mkDir: async function (dirName) {
        await fsp.mkdir(dirName, { recursive: true });
        let i = 0;
        let d = new Date();
        while (true) {
            i = dirName.indexOf('/', i + 1);
            if (i < 0) break;
            let subName = dirName.substr(0, i);
            if (subName.indexOf('$') > 0) {
                await fsp.utimes(subName, d, d);
            }
        }
        await fsp.utimes(dirName, d, d);
    },
    saveFile: async function (revision, folderName, fileName, srcFileName) {
        let tarFileName = this.getRevisionPath(revision, folderName, fileName).replace(/\\/g, '/');
        srcFileName = srcFileName.replace(/\\/g, '/');
        await this.mkDir(pathLib.dirname(tarFileName));
        console.store(`STORE:  "${srcFileName}" save to  "${tarFileName}"`);
        await fsp.copyFile(srcFileName, tarFileName);
        return tarFileName;
    },
    remove: async function (revision, folderName, fileName) {
        let tarFileName = this.getRevisionPath(revision, folderName, fileName);
        let f = (await (fsp.access(tarFileName).then(() => true).catch(() => false)));
        if (f) {
            console.store(`STORE:  "remove "${tarFileName}"`);
            if (fileName) await fsp.unlink(tarFileName);
            else await fsp.rm(tarFileName, { recursive: true });
        }
        return tarFileName;
    },
    copyRevision: async function (sourceRevision, targetRevision) {
        await this.copyDirectory(this.getRevisionPath(sourceRevision), this.getRevisionPath(targetRevision));
    },
    copyDirectory: async function (source, target, level = 0) {
        let f = (await (fsp.access(target).then(() => true).catch(() => false)));
        if (!f) {
            await this.mkDir(target);
        }
        if (await (fsp.access(source).then(() => true).catch(() => false))) {
            let files = await fsp.readdir(source, { withFileTypes: true });
            for (let i in files) {
                let file = files[i];
                let sourceFile = pathLib.join(source, file.name);
                let targetFile = pathLib.join(target, file.name);
                if (file.isDirectory()) {
                    if (file.name.toLowerCase() != 'import') {
                        await this.copyDirectory(sourceFile, targetFile, level + 1);
                    }
                }
                else {
                    await fsp.copyFile(sourceFile, targetFile);
                }
            }
        }
    },
    deleteRevision: async function (revision) {
        let target = this.getRevisionPath(revision);
        let f = (await (fsp.access(target).then(() => true).catch(() => false)));
        if (f) {
            await fsp.rm(target, { recursive: true });
        }
    },
};
