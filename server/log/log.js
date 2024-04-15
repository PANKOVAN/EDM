const $edm = require('../edm');
const helpers = require('../helpers');

class Log {

    static stat = {};

    /**
     * Возвращает логгер
     */
    static get() {
        if (!Log._log_) {
            Log._log_ = new Log();
        }
        return Log._log_;
    }

    constructor(connection) {
        this.connection = connection;
        //this.connection.hidetrace = true;
        this.settings = helpers.getSettings().log || {};
    }
    init() {
        this._init = true;
    }
    async put(type, vtype, value, jvalue, user) {
        await this.putAsync(type, vtype, value, jvalue, user);
    }
    async putAsync(type, vtype, value, jvalue, user) {
        if (this._init) {
            if (true /*!this._inPut*/) {
                this._inPut = true;
                if (!value && typeof jvalue == 'string') {
                    value = jvalue;
                    jvalue = undefined;
                }

                if (jvalue) {
                    let svalue = helpers.safeJson(jvalue);
                    jvalue = JSON.stringify(svalue);
                }

                if (this.settings[type] === false) return;
                if ((this.settings[type] || {})[vtype] === false) return;

                if (this.settings.console && this.settings.console[type]) {
                    if (type == 'EXC' || type == 'ERR') console.error(type, vtype, value);
                    else console.debug(type, vtype, value);
                }
                try {
                    if (!this.connection) {
                        let edm = $edm.getEDMData({ id: -100, login: 'madmin', name: 'madmin' });
                        this.connection = await edm.getConnection('mlog');
                    }
                    let connection = this.connection;
                    connection.hideTrace = true;
                    connection.hideException = true;
                    let curTable = `_log_${helpers.dateToYYYYMMDD(new Date())}`; // + (new Date).getMinutes().toString();
                    if (curTable != this.ncurTable) {
                        let f = await connection.query(`SELECT 1 from information_schema.tables where table_schema='mlog' and table_name=$tablename`, { tablename: curTable }, true, true);
                        // Создать таблицу если ее еще нет
                        if (!f) {
                            this._inCreate = true;
                            let model = connection.edm.models['mlog'];
                            let table = connection.edm.classes['log'];
                            connection.exec(`
                                        CREATE TABLE IF NOT EXISTS "mlog"."${curTable}" ( 
                                        "type" VARCHAR(32) NULL,
                                        "vtype" VARCHAR(32) NULL,
                                        "stype" VARCHAR(32) NULL,
                                        "value" TEXT NOT NULL DEFAULT ''::text ,
                                        "jvalue" JSONB NULL,
                                        "time" TIMESTAMP NOT NULL DEFAULT now() ,
                                        "user" INTEGER NULL
                                        );
                                        CREATE INDEX "foreign_index_mlog_${curTable}_type" 
                                        ON "mlog"."${curTable}" (
                                        "type" ASC
                                        );
                                        CREATE INDEX "foreign_index_mlog_${curTable}_vtype" 
                                        ON "mlog"."${curTable}" (
                                        "vtype" ASC
                                        );
                                        CREATE INDEX "foreign_index_mlog_${curTable}_stype" 
                                        ON "mlog"."${curTable}" (
                                        "stype" ASC
                                        );
                                        `);
                            // Удалить таблицы с превышенным сроком хранения
                            let logTables = await connection.select(`select table_name from information_schema.tables where table_schema='mlog' and table_name like '_log_%' order by table_name`, {}, undefined, true, true);
                            let max = this.settings.maxLogs || 10;
                            while (logTables.length > max) {
                                let t = logTables.shift().table_name;
                                await connection.exec(`DROP TABLE IF EXISTS "mlog"."${t}"`, {}, true, true);
                            }
                        }
                        else {
                            this.curTable = curTable;
                        }
                    }

                    let values = {
                        type: type,
                        stype: this.settings.stype || '',
                        vtype: vtype || '',
                        value: (value || '').toString(),
                        jvalue: jvalue,
                        user: user ? (user.id || user) : undefined
                    }

                    if (this.curTable) {
                        let f = await connection.query(`insert into "mlog"."${this.curTable}" ("type", "stype", "vtype", "value", "jvalue", "user") values($type, $stype, $vtype, $value, $jvalue, $user) returning 1`, values, undefined, true, true);
                        if (!f) this.curTable = undefined;
                    }

                }
                catch (e) {
                    console.error('LOG ERROR!!!', e);
                }
                this._inPut = false;
            }
        }
        else {
            //console.error(`!!! NOT INIT LOG ${type} ${vtype}, ${value}`);
        }
    }
    async stat(type, vtype, value = 1, interval, sum) {

        interval = interval || (1000 * 60);
        if (sum == undefined) sum = true;

        if (this.settings[type] === false) return;
        if ((this.settings[type] || {})[vtype] === false) return;

        let t = Date.now();
        if (!Log.stat[type]) Log.stat[type] = {};
        if (!Log.stat[type][vtype]) Log.stat[type][vtype] = { t: t, v: 0 };

        let o = Log.stat[type][vtype];
        if (sum) o.v = (o.v || 0) + value;
        else o.v = value;
        if (o.t + interval < t) {
            o.t = t;
            await this.putAsync(type, vtype, undefined, o.v);
            o.v = 0;
        }


    }

    async getLogs(connection) {
        let result = await connection.select(`select table_name from information_schema.tables where table_schema='mlog' and table_name like '_log_%' order by table_name desc`);
        result = result.map(r => {
            let d = r.table_name.substring(5)
            return {
                logName: r.table_name,
                date: `${d.substring(6, 8)}.${d.substring(4, 6)}.${d.substring(0, 4)}`
            }
        })
        return result;
    }
    async selectLogs(connection, logName, params) {
        return await connection.selectObj('log', params, undefined, true, true,
            (sql, name, params, mode) => {
                if (mode == 'from') sql = sql.replace('"log"', `"${logName}"`);
                return sql;
            });
    }

}
module.exports = Log;
