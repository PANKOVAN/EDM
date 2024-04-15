'use strict'
/**
 * Библиотека EDM. Базы данных sqlite. Синхронизация
 */
const helpers = require('./helpers');
const { models, classes } = require('./model');
const settings = helpers.getSettings();
module.exports = {
    /**
     * Синхронизировать все
     */
    sync: async function (model, dbcfg) {
        if (!model) {
            for (let n in models) {
                let mmm = models[n];
                let dbname = settings.models[mmm._name] || settings.models['*'];
                if (settings.db[dbname] && (settings.db[dbname].require == 'postgresql' || settings.db[dbname].require == 'sqlite')) {
                    await this.sync(mmm, dbcfg);
                }
            }
            return;
        }
        try {
            let edm = require('./edm').getEDMData();
            try {
                if (typeof dbcfg != 'object') dbcfg = settings.db[dbcfg] || settings.models['*'];
                let connection = await edm.getConnection(model, null, null, dbcfg);
                connection.beginTran();
                // Получить описание последней синхронизированной модели
                let syncInfo = await this.getSyncInfo(connection, model);
                // Синхронизировать модель
                await this.syncModel(connection, model, syncInfo);
                connection.commitTran();
                // Сохранить описание синхронизированной модели
                await connection.free();
            }
            finally {
                await edm.free();
            }
        }
        catch (e) {
            console.error(e);
        }
    },
    /**
     * Получить описание данных о текущем состоянии модели по состоянию структур базы данных.
     * @param {object} model текущая модель
     */
    getSyncInfo: async function (connection, model) {
        let syncInfo = {};
        return syncInfo;
    },
    syncModel: async function (connection, model, syncInfo) {
        console.debug(`SYNC MODEL ${model}`);
        // Запустить pre скрипты
        for (let t in classes) {
            let table = classes[t];
            if (table._mname == model._name && table._mtype == 'script' && table._stype == 'pre' && (table._dbtype || 'sqlite') == 'sqlite') {
                let scripts = table._script;
                if (typeof scripts == 'string') scripts = [scripts];
                if (Array.isArray(scripts)) {
                    for (let i = 0; i < scripts.length; i++) {
                        await connection.query(scripts[i]);
                    }
                }
            }
        }
        // Проход по модели
        for (let t in classes) {
            let table = classes[t];
            // Добавить новую таблицу
            if (table._mname == model._name && table._mtype == 'table' && (table._dbtype || 'sqlite') == 'sqlite') {
                await connection.query(`create table "${table._name}" (id integer primary key);`);
            }
        }
        // Синхронизировать поля таблиц, создать индексы
        for (let t in classes) {
            let table = classes[t];
            if (table._mname == model._name && table._mtype == 'table' && (table._dbtype || 'sqlite') == 'sqlite') {
                await this.syncTable(connection, table, syncInfo[t] || {}, model);
            }
        }
        // Запустить post скрипты
        for (let t in classes) {
            let table = classes[t];
            if (table._mname == model._name && table._mtype == 'script' && table._stype == 'post' && (table._dbtype || 'sqlite') == 'sqlite') {
                let scripts = table._script;
                if (typeof scripts == 'string') scripts = [scripts];
                if (Array.isArray(scripts)) {
                    for (let i = 0; i < scripts.length; i++) {
                        await connection.query(scripts[i]);
                    }
                }
            }
        }
    },
    syncTest: function (curvalue, newvalue) {
        let curvalue1 = (curvalue || '').replace(/\s+|"/g, '');
        let newvalue1 = (newvalue || '').replace(/\s+|"/g, '');
        if (curvalue1.toLowerCase() != newvalue1.toLowerCase()) {
            return true;
        }
        return false;
    },
    syncTable: async function (connection, table, tableInfo, model) {
        if (table && table._mtype == 'table' && (table._dbtype || 'sqlite') == 'sqlite') {
            console.debug(`SYNC TABLE ${table}`);
            // Проход по модели
            for (let c in table._childs) {
                let column = table._childs[c];
                if (column._mtype == 'field' && !column.virtual && (column._dbtype || 'sqlite') == 'sqlite') {
                    let typeString = this.getTypeString(connection, column);
                    let defString = this.getDefString(connection, column, table, model);
                    let nullString = this.getNullString(connection, column);
                    if (!tableInfo.columns) tableInfo.columns = {};
                    if (!tableInfo.indexes) tableInfo.indexes = {};

                    // Добавит новое поле
                    if (column._ptype != 'id') {
                        let sql = `ALTER TABLE "${table._name}" ADD COLUMN "${column._name}" ${typeString} ${nullString}`;
                        if (defString) sql += ` DEFAULT ${defString}`;
                        if (column._ptype == 'ref') {
                            let refString = this.getRefString(connection, column);
                            if (refString) sql += ' ' + refString;
                        }
                        await connection.query(sql);
                    }
                    // Добавить индекс по вторичным ключам
                    if (column._ptype == 'ref') {
                        let indexname = `FOREIGN_INDEX_${model._name}_${table._name}_${column._name}`.toLowerCase();
                        let script = `CREATE INDEX IF NOT EXISTS "${indexname}" ON "${table._name}" ("${column._name}")`;
                        if (!tableInfo.indexes[indexname] || tableInfo.indexes[indexname].script != script || settings._syncreset_) {
                            await connection.query(script);
                        }
                    }
                }
                // Индексы
                else if (column._mtype == 'index' && (column._dbtype || 'sqlite') == 'sqlite') {
                    let indexname = `INDEX_${model._name}_${table._name}_${column._name}`.toLowerCase();
                    let script = `CREATE ${column._unique ? 'UNIQUE' : ''} INDEX "${indexname}" ON "${table._name}" ${column._script}`;
                    if (!tableInfo.indexes[indexname] || tableInfo.indexes[indexname].script != script || settings._syncreset_) {
                        await connection.query(script);
                    }
                }
                // Скрипты
                else if (column._mtype == 'script' && (column._dbtype || 'sqlite') == 'sqlite') {
                    await connection.query(column._script);
                }
            }
        }
    },
    getTypeString: function (connection, column, refMode = false) {
        if (!column) return '';
        return connection.getTypeString(column, refMode);
    },
    getDefString: function (connection, column, table, model) {
        if (!column) return '';
        if (!column._sqldefault && column._ptype != 'id' && column._type != 'guid' && !column._notnull) return '';
        let r = '';
        if (column._sqldefault) r = `(${column._sqldefault})`
        else {
            if (column._notnull) {
                switch (column._type) {
                    case 'string':
                        r = `''`;
                        if (column._default) {
                            if (column._default.startsWith("'")) r = column._default;
                            else r = `'${column._default}'`;
                        }
                        break;
                    case 'int':
                    case 'long':
                    case 'byte':
                    case 'short':
                    case 'float':
                    case 'double':
                    case 'decimal':
                    case 'money':
                    case 'bool':
                        r = `0`;
                        if (column._default) {
                            r = `${column._default}`;
                        }
                        break;
                    case 'datetime':
                    case 'date':
                    case 'time':
                        r = `current_timestamp`;
                        break;
                    case 'guid':
                        r = `(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6)))`;
                        if (column._default) {
                            r = `${column._default}`;
                        }
                        break;
                    default:
                        if (column._ptype == "ref") {
                            if (column._default) {
                                let refDef = connection.edm.getModelDef(column._type);
                                if (!refDef) throw `SQLITE. Определение типа данных. Ссылка ${column._type} не найдена`;
                                let refIdColumn = refDef._childs['id'];
                                if (!refIdColumn) throw `SQLITE. Определение типа данных. Поле id для ${column._type} не найдено`;
                                if (refIdColumn._type == 'string') {
                                    if (column._default.startsWith("'")) r = column._default;
                                    else r = `'${column._default}'`;
                                }
                                else {
                                    r = column._default;
                                }
                            }
                        }
                        break;
                }
            }
        }
        return r;
    },
    getNullString: function (connection, column) {
        if (!column) return '';
        let r = 'NULL';
        if (column._notnull) r = 'NOT NULL';
        return r;
    },
    getRefString: function (connection, column) {
        if (!column) return '';
        let r = '';
        if (column._ptype == 'ref') {
            let refTable = connection.edm.getModelDef(column._type, ['table'], false);
            if (refTable) {
                let valid = "";
                if (column._mode == 'cascade' || column._mode == 'c') valid = 'ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED';
                else if (column._mode == 'restrict' || column._mode == 'r') valid = 'DEFERRABLE INITIALLY DEFERRED';
                else if (column._mode == 'set null' || column._mode == 'n') valid = 'ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED';
                r = `REFERENCES "${refTable._name}" ${valid}`;
            }
        }
        return r;
    }
};