'use strict'
/**
 * Библиотека EDM. Базы данных sqlite.
 */

const helpers = require('./helpers');
const settings = helpers.getSettings();
const sqlite3 = require('sqlite3').verbose();
const sqlabstract = require('./sqlabstract.js');
const pathLib = require('path');
const log = require('./log/log').get()

sqlite3.as_open = function (path, mode) {
    return new Promise(function (resolve, reject) {
        let client = new sqlite3.Database(path, mode,
            function (err) {
                if (err) reject(err);
                else resolve(client);
            }
        );
    });
};
// any query: insert/delete/update
sqlite3.as_run = function (client, query, param) {
    return new Promise(function (resolve, reject) {
        client.run(query, param,
            function (err) {
                if (err) reject(err);
                else resolve(true);
            });
    });
};
// first row read
sqlite3.as_get = function (client, query, params) {
    return new Promise(function (resolve, reject) {
        client.get(query, params, function (err, row) {
            if (err) reject(err);
            else resolve(row);
        });
    });
};
// set of rows read
sqlite3.as_all = function (client, query, params) {
    return new Promise(function (resolve, reject) {
        if (params == undefined) params = []
        client.all(query, params, function (err, rows) {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};
sqlite3.as_close = function (client) {
    return new Promise(function (resolve, reject) {
        client.close();
        resolve(true);
    });
};

class SqliteConnection extends sqlabstract.SQLConnection {
    constructor(db, edm) {
        super(db, edm);
        this.type = 'sqlite';
    }
    async free() {
        if (this.db && this.client) {
            await this.db.freeConnection(this);
            this.client = undefined;
            this.db = undefined;
        }
    }
    /**
     * Выполнить sql запрос
     * @param {string} sql - sql запрос
     * @param {*} params - параметры запроса. Если параметрвми запроса является объект, то считается что
     * строка запроса содержит именованные параметры, и происходит их подсдановка. Кроме этого формируются "правильные"
     * имена отношений и из запроса удаляются строки с незаданными параметрами.
     */
    async exec(sql, params, method = 'run') {
        let hideTrace = this.hideTrace;
        let hideException = this.hideException;
        params = params || {};
        sql = sql.sqlite || sql.postgresql || sql;
        if (typeof (sql) != 'string') {
            console.error(sql);
            throw 'Недопустимое значение параметра sql в connection.exec';
        }
        let self = this;
        // Подставить правильные имена отношений (их имена заключены в квадратные скобки)
        sql = sql.replace(/\x5B\w+\x5D/g, function (m) {
            return self.getTableName(m.substr(1, m.length - 2));
        });
        // Формирование "сложного запроса"
        if (typeof (params) == 'object' && !Array.isArray(params)) {
            // Подставим параметры
            // меняем $<имя параметра> на $<номер параметра>
            // меняем $$<имя параметра> на значение параметра в кавычках или список значений в кавычках для массива
            // меняем $[<имя фильтра>, <имя поля>, <тип>, <режим>] на фильтр с номерами параметров

            let params1 = [];
            let indexator = {};
            let $this = this;
            sql = sql.replace()
            sql = (sql + ' ').replace(/\x24{1,2}\w+\W/g, function (m) {
                let r, n, d;
                if (m.startsWith('$$')) {
                    n = m.substr(2, m.length - 3);
                    d = m.substr(m.length - 1, 1);
                    r = $this.prepareParam(params[n]) + d;
                }
                else {
                    n = m.substr(1, m.length - 2);
                    d = m.substr(m.length - 1, 1);
                    let v = params[n];
                    //if (typeof (v) != 'undefined') {
                    let i = indexator[n];
                    if (typeof i == 'undefined') {
                        params1.push(v);
                        i = params1.length;
                        indexator[n] = i;
                    }
                    r = '$' + i + d;
                    //}
                }
                if (typeof r == 'undefined') {
                    throw `Параметр "${n}" в не найден в SQL запросе ${sql}`;
                }
                return r;
            });
            return await this.exec(sql, params1, method);
        }
        // Выполнение запроса с простым списком параметров
        else {
            let result = {};
            try {
                if (this.client) {
                    if (Array.isArray(params)) {
                        for (let i = 0; i < params.length; i++) {
                            // JSON объект заменяем на строку. Объект типа Date не JSON
                            if (params[i] && typeof (params[i]) == 'object' && typeof (params[i].getMonth) != 'function') {
                                params[i] = JSON.stringify(params[i]);
                            }
                        }
                    }
                    if (method == 'run') {
                        await sqlite3.as_run(this.client, sql, params);
                    }
                    else if (method == 'get') {
                        result.rows = [await sqlite3.as_get(this.client, sql, params)];
                    }
                    else {
                        result.rows = await sqlite3.as_all(this.client, sql, params);
                    }
                }
            }
            catch (e) {
                if (!hideException) {
                    //let user = '';
                    //if (this.edm && this.edm.user) user = this.edm.user.login || '';
                    log.put('EXC', 'SQL', e.message, e, (this.edm || {}).user);
                    //func.console.error(`ERROR: ${sql} ${e.message}`, user);
                    throw e;
                }
            }
            return result;
        }
    }
    async query(sql, params) {
        sql = sql.sqlite || sql.postgresql || sql;
        if (typeof (sql) != 'string') {
            console.error(sql);
            throw 'Недопустимое значение параметра sql в connection.query';
        }
        let r = await this.exec(sql, params, 'get');
        let rows = r.rows;
        if (rows && rows.length == 1) {
            for (let n in rows[0]) {
                return rows[0][n];
            };
        }
        return undefined;
    }
    async select(sql, params, callback) {
        sql = sql.sqlite || sql.postgresql || sql;
        if (typeof (sql) != 'string') {
            console.error(sql);
            throw 'Недопустимое значение параметра sql в connection.select';
        }
        let r = await this.exec(sql, params, 'all');
        if (callback) {
            r.rows.forEach(row => callback(row));
        }
        return r.rows;
    }
    async selectObj(name, sql, params, callback) {
        sql = sql.sqlite || sql.postgresql || sql;
        return super.selectObj(name, sql, params, callback);
    }
    async insert(def, upd, callback) {
        let fields = '';
        let values = '';
        let params = [];
        for (let f in def._childs) {
            let field = def._childs[f];
            if (!field.virtual && field._mtype == 'field') {
                let v = upd[f];
                if (field._ptype == 'id' && field._name == 'id' && upd['id'] > 0) {
                    if (fields) {
                        fields += ',';
                        values += ',';
                    }
                    fields += '"' + f + '"';
                    values += this.getParamDef(def, field, params, v);
                }
                else if (field._ptype == 'ref') {
                    if (v && typeof v == 'object') {
                        let data = await this._saveData(v);
                        let id = v.id;
                        if (!id && v._upd_) id = v._upd_.id;
                        if (data.length == 1 && data[0]) v = data[0].id;
                        else v = undefined;
                    }
                    if (typeof v != 'undefined') {
                        if (fields) {
                            fields += ',';
                            values += ',';
                        }
                        fields += '"' + f + '"';
                        values += this.getParamDef(def, field, params, v);
                    }
                }
                else if (!field._ptype || field._ptype == 'props') {
                    if (typeof v != 'undefined') {
                        if (fields) {
                            fields += ',';
                            values += ',';
                        }
                        fields += '"' + f + '"';
                        values += this.getParamDef(def, field, params, v);
                    }
                    else {
                        // if (fields) {
                        //     fields += ',';
                        //     values += ',';
                        // }
                        // fields += '"' + f + '"';
                        // values += 'default';
                    }
                }
            }
            // if (!field.virtual && field._mtype == 'field' && (field._name != 'id' || (field._name == 'id' && upd['id'] > 0))) {
            //     if (field._mtype == 'field') {
            //         let v = upd[f];
            //         if (field._ptype == 'ref') {
            //             if (v && typeof v == 'object') {
            //                 let data = await this._saveData(v);
            //                 let id = v.id;
            //                 if (!id && v._upd_) id = v._upd_.id;
            //                 if (data.length == 1 && data[0]) v = data[0].id;
            //                 else v = undefined;
            //             }
            //             if (typeof v != 'undefined') {
            //                 if (fields) {
            //                     fields += ',';
            //                     values += ',';
            //                 }
            //                 fields += '"' + f + '"';
            //                 values += this.getParamDef(def, field, params, v);
            //             }
            //         }
            //         else if (field._mtype == 'field' /*&& field._name != 'id'*/ && (!field._ptype || field._ptype == 'props')) {
            //             if (typeof v != 'undefined') {
            //                 if (fields) {
            //                     fields += ',';
            //                     values += ',';
            //                 }
            //                 fields += '"' + f + '"';
            //                 values += this.getParamDef(def, field, params, v);
            //             }
            //             else {
            //                 if (fields) {
            //                     fields += ',';
            //                     values += ',';
            //                 }
            //                 fields += '"' + f + '"';
            //                 values += 'default';
            //             }
            //         }
            //     }
            // }
        }

        if (fields) {
            return await this.selectObj(def._name, `insert into ${this.getTableName(def._name)}(${fields}) values(${values}) returning *`, params, callback);
        }
        else {
            return await this.selectObj(def._name, `insert into ${this.getTableName(def._name)} default values returning *`, params, callback);
        }
    }

    // Функции фильтров
    filter_like(fieldName, type, label, values, params) {
        let result = "";
        values.forEach(v => {
            if (v != '') {
                if (result != '') result += " or ";
                result += `lower("${fieldName.replaceAll('.', '"."')}") LIKE $${this.addNamedParam(params, "%" + v + "%")}`;
            }
        }, this);
        if (result != '') return `(${result})`;
        return result;
    }

    getTableName(obj) {
        let def = this.edm.getModelDef(obj, ['table']);
        if (def) return `"${def._name}"`;
        return `"${obj}"`;
    }
    getSelectPref(name, params, queryParams, sqlcallback) {
        let result = '';
        if (params.paginator || params.continue) {
            result = 'count(*) OVER() AS total_count,';
        }
        if (sqlcallback) {
            let r = sqlcallback(name, params, queryParams, result, 'pref');
            if (r != undefined) result = r;
        }
        return result;
    }
    getSelectSuff(name, params, queryParams, sqlcallback) {
        let result = '';
        if (params._first) {
            result = `limit 1`;
        }
        else if (params.paginator || params.continue) {
            let start = params.start || 0;
            let count = params.count || 50;
            result = `limit ${count} offset ${start}`;
        }
        if (sqlcallback) {
            let r = sqlcallback(name, params, queryParams, result, 'suff');
            if (r != undefined) result = r;
        }
        return result;
    }

    getParamDef(name, cname, params, value) {
        let def = this.edm.getModelDef(name);
        if (def._def_) def = def._def_;
        let col = (typeof (cname) == 'string') ? def._childs[cname] : cname;
        if (!col || col._mtype != 'field') throw `Описатель параметра ${cname} для ${def._name} не найден`;
        if (typeof value == 'object' && value !== null && (col._type == 'jsonb' || col._type == 'json')) value = JSON.stringify(value);
        params.push(this.getNullValue(col, true, value));
        return `$${params.length}::${this.getTypeString(col, true)}`;
    }
    getTypeString(column, refMode = false) {
        let r = '';
        if (typeof (column._ptype) == 'undefined' || column._ptype == 'id' || column._ptype == 'props') {
            if (!column._type) return '';
            switch (column._type) {
                case 'string':
                case 'decimal':
                case 'money':
                case 'date':
                case 'datetime':
                case 'time':
                case 'interval':
                case 'guid':
                case 'json':
                case 'jsonb':
                    {
                        r = `TEXT`;
                        break;
                    }
                case 'int':
                case 'long':
                case 'byte':
                case 'short':
                case 'bool':
                    {
                        r = `INTEGER`;
                        break;
                    }
                case 'float':
                case 'double':
                    {
                        r = `REAL`;
                        break;
                    }
                default: {
                    throw `DATA TYPE ${column._type} NOT FOUND`;
                }
            }
        }
        else if (column._ptype == 'ref') {
            let refDef = this.edm.getModelDef(column._type);
            if (!refDef) throw `SQLITE. Определение типа данных. Ссылка ${column._type} не найдена`;
            let refIdColumn = refDef._childs['id'];
            if (!refIdColumn) throw `SQLITE. Определение типа данных. Поле id для ${column._type} не найдено`;
            r = this.getTypeString(refIdColumn, true);
        }
        else if (column._ptype == 'reflist') {
            let refDef = this.edm.getModelDef(column._type);
            if (!refDef) throw `SQLITE. Определение типа данных. Ссылка ${column._type} не найдена`;
            let refIdColumn = refDef._childs['id'];
            if (!refIdColumn) throw `SQLITE. Определение типа данных. Поле id для ${column._type} не найдено`;
            if (refDef._mtype != 'cfg') throw `SQLITE. Определение типа данных. Для reflist возможна ссылка только на конфигурацию (${column._type})`;
            r = `TEXT`;
        }
        else {
            throw `SQLITE. Определение типа данных. Тип поля ${column._pype} не найден`;
        }
        if (!r) {
            throw `SQLITE. Не удалось определить тип данных (${JSON.stringify(column, this.func.jsonReplacer)})`;
        }
        return r;
    }
    getNullValue(column, refMode = false, value) {
        if (typeof (value) != 'undefined' && value !== '') return value;
        if (typeof (column._ptype) == 'undefined' || column._ptype == 'id' || column._ptype == 'props') {
            switch (column._type) {
                case 'string':
                    {
                        break;
                    }
                case 'int':
                    {
                        value = null;
                        break;
                    }
                case 'long':
                    {
                        value = null;
                        break;
                    }
                case 'byte':
                case 'short':
                    {
                        value = null;
                        break;
                    }
                case 'float':
                    {
                        value = null;
                        break;
                    }
                case 'double':
                    {
                        value = null;
                        break;
                    }
                case 'decimal':
                    {
                        value = null;
                        break;
                    }
                case 'money':
                    {
                        value = null;
                        break;
                    }
                case 'datetime':
                    {
                        value = null;
                        break;
                    }
                case 'date':
                    {
                        value = null;
                        break;
                    }
                case 'time':
                    {
                        value = null;
                        break;
                    }
                case 'interval':
                    {
                        value = null;
                        break;
                    }
                case 'bool':
                    {
                        value = false;
                        break;
                    }
                case 'guid':
                    {
                        value = null;
                        break;
                    }
                case 'json':
                    {
                        value = null;
                        break;
                    }
                case 'jsonb':
                    {
                        value = null;
                        break;
                    }
                default: {
                }
            }
        }
        else if (column._ptype == 'ref') {
            let refDef = this.edm.getModelDef(column._type);
            if (!refDef) throw `SQLITE. Определение типа данных. Ссылка ${column._type} не найдена`;
            let refIdColumn = refDef._childs['id'];
            if (!refIdColumn) throw `SQLITE. Определение типа данных. Поле id для ${column._type} не найдено`;
            value = this.getNullValue(refIdColumn, true, value);
        }
        else if (column._ptype == 'reflist') {
            value = null;
        }
        else {
            throw `SQLITE. Определение типа данных. Тип поля ${column._pype} не найден`;
        }
        return value;
    }
}

module.exports = {
    edm: require('./edm'),
    helpers: require('./helpers'),
    cfg: require('./cfg'),

    /**
     * Инициализация
     */
    init: async function (model) {
        if (settings._sync_) {
            let sqlitesync = require('./lite.sync.js');
            await sqlitesync.sync(model);
        }
    },
    getConnection: async function (edm, dbcfg) {
        if (typeof dbcfg != 'object') dbcfg = settings.db[dbcfg] || settings.models['*'];
        let connection = new SqliteConnection(this, edm);
        let dbname = dbcfg.dbname || pathLib.join(settings._storedir_, 'mbuilder.export.db');
        let mode = sqlite3.OPEN_READWRITE;
        if (dbcfg.create) mode = mode | sqlite3.OPEN_CREATE;
        connection.client = await sqlite3.as_open(dbname, mode);
        await sqlite3.as_get(connection.client, "PRAGMA foreign_keys = ON"); // включаем поддержку контроля ссылочной целостности
        await sqlite3.as_get(connection.client, "PRAGMA temp_store = MEMORY"); // временные таблицы в памяти
        return connection;
    },
    freeConnection: async function (connection) {
        if (connection && connection.client) {
            await sqlite3.as_close(connection.client);
            connection.client = undefined;
        }
    }
};
