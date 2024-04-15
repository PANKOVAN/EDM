'use strict'
/**
 * Библиотека EDM. Базы данных postgresql.
 */

const helpers = require('../helpers');
const settings = helpers.getSettings();
const sqlabstract = require('./proto');

class PostgreSQLConnection extends sqlabstract.SQLConnection {
    constructor(db, edm) {
        super(db, edm);
        this.type = 'postgresql';
    }

    // getErrorMessage(e) {
    //     if (typeof e != 'object') return e;
    //     if ((e.constructor || {}).name != 'DatabaseError') return e;

    //     if (e.constraint) {
    //         let constraint = e.constraint.toLowerCase();
    //         let message = '';
    //         for (let cn in this.edm.classes) {
    //             let c = this.edm.classes[cn];
    //             for (let fn in c._childs) {
    //                 let f = c._childs[fn];
    //                 if (f._mtype == 'index') {
    //                     if (constraint.endsWith(f._name.toLowerCase())) {
    //                         message = f._label;
    //                         break;
    //                     }
    //                 }
    //             }
    //             if (message) break;
    //         }
    //         if (message) return message;
    //     }
    //     if (e.table) {
    //         let model = this.edm.getModelDef(e.table, 'table', false);
    //         if (model) {
    //             if (e.column) {
    //                 let fld = model._childs[e.column] || {};
    //                 if (e.code == 23502) {
    //                     return `${model._label || e.table}\nНе задано значение поля '${fld._label || e.column}'`;
    //                 }
    //             }
    //         }
    //     }
    //     if (this.edm.edmLss) {
    //         let opr = this.edm.edmLss.getOperation();
    //         if (opr && opr.model && opr.operation) {
    //             if (opr.operation == 'delete') {
    //                 if (e.code == 23503 && e.table) {
    //                     let targetModel = this.edm.getModelDef(e.table, 'table', false);
    //                     let targetTable = (targetModel || {})._label || e.table;
    //                     let message = `Нельзя удалять строку в таблице '${opr.model._label || opr.model._mtype}', на нее есть ссылки в таблице '${targetTable}'!`;
    //                     return message;
    //                 }
    //             }
    //         }
    //     }
    //     return e.message;
    // }
    async free() {
        if (this.client) {
            await this.client.release();
            this.client = undefined;
        }
    }
}

/*
class PostgreSQLLogger extends sqlabstract.SQLLogger {
    constructor(client) {
        super(client);
    }
}
*/

module.exports = {
    /**
     * Инициализация
     */
    sync: async function (model, passing) {
        let pgsync = require('./postgre.sync.js');
        await pgsync.sync(model, undefined, passing);
    },

    /**
     * Получить пул соединений
     */
    getPool: function (dbcfg) {
        if (typeof dbcfg != 'object') dbcfg = settings.db[dbcfg] || settings.db[settings.models['*']];
        if (dbcfg) {
            if (typeof (dbcfg._pool_) == 'undefined') {
                let Pool = require('pg').Pool;
                dbcfg._pool_ = new Pool({
                    user: dbcfg.dbuser || 'postgres',
                    host: dbcfg.dbhost || 'localhost',
                    database: dbcfg.dbname,
                    password: dbcfg.dbpass,
                    port: dbcfg.dbport || 5432,
                    max: 20
                });
                console.debug(`database: ${dbcfg.dbname} (${dbcfg.dbhost})`)
            }
            return dbcfg._pool_;
        }
        throw 'Описатель настроек для postgre не найден';
    },

    getConnection: async function (edm, dbcfg) {
        let connection = new PostgreSQLConnection(this, edm);
        connection.pool = this.getPool(dbcfg);
        connection.client = await this.getPool(dbcfg).connect();
        return connection;
    },

    /*
    getLogger: async function () {
        if (!this._logger) {
            let client = await this.getPool().connect();
            this._logger = new PostgreSQLLogger(client);
        }
        return this._logger;
    }
    */
};