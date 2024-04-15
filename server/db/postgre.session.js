'use strict'
/**
 * Библиотека EDM. Сервер. Хранение сессий в PostgreSQL
 */
const helpers = require('../helpers');
const settings = helpers.getSettings();
const postgresql = require('../db/postgre');

module.exports = function (session) {
    const Store = session.Store;
    const noop = function () { };

    class PostgreSQLSessionStore extends Store {
        constructor(options = {}) {
            super(options);
            this.serializer = options.serializer || JSON;
            this.lastRemovedTime = 0;
            this.db = options.db;
            if (typeof this.db == 'string') this.db = settings.db[this.db];
            this.init();
        }
        get(sid, cb = noop) {
            let $this = this;

            $this._getPoolPromise().then(function () {
                return $this._removeOld();
            }).then(function () {
                return $this.pool.query(`select * from "session" where "id"=$1`, [sid]);
            }).then(function (sqlresult) {
                const rows = sqlresult.rows;
                if (rows.length == 1) {
                    let data = rows[0];
                    let utime = parseInt(data['utime']);
                    let value = JSON.parse(data['value']);
                    let t = parseInt(new Date().getTime() / 1000);
                    if (value.user) value.user.lastActivity = t;
                    value = JSON.stringify(value);
                    if (Math.abs(t - utime > 120)) {
                        $this.pool.query(`update "session" set "utime"=$2, "value"=$3 where "id"=$1 and "value"<>$3`, [sid, t, value]).catch(function (err) { }).catch((e) => { });
                    }
                }
                return sqlresult;
            }).then(function (sqlresult) {
                const rows = sqlresult.rows;
                if (rows.length == 0) {
                    //cb();
                    return null;
                }
                else if (rows.length == 1) {
                    let data = rows[0];
                    return $this.serializer.parse(data['value']);
                }
                else throw new Exception('Ошибка при обращении к сессии');
            }).then(function (value) {
                cb(null, value);
            }).catch(function (err) {
                cb(err);
            });
        }
        set(sid, sess, cb = noop) {
            let $this = this;
            let value = $this.serializer.stringify(sess);

            $this._getPoolPromise().then(function () {
                return $this._removeOld();
            }).then(function () {
                return $this.pool.query(`select * from "session" where "id"=$1`, [sid]);
            }).then(function (sqlresult) {
                const rows = sqlresult.rows;
                let t = parseInt(new Date().getTime() / 1000);
                if (value) {
                    value = JSON.parse(value);
                    if (value.user) value.user.lastActivity = t;
                    value = JSON.stringify(value);
                }
                if (rows.length == 1) {
                    return $this.pool.query(`update "session" set "utime"=$2, "value"=$3 where "id"=$1 and "value"<>$3`, [sid, t, value]).catch((e) => { });
                }
                else if (rows.length == 0) {
                    return $this.pool.query(`insert into "session" ("id", "utime", "value") values ($1, $2, $3)`, [sid, t, value]).catch((e) => { });
                }
                else throw new Exception('Ошибка при обращении к таблице session');
            }).then(function () {
                cb(null, value);
            }).catch(function (err) {
                cb(err);
            });
        }
        touch(sid, sess, cb = noop) {
            return cb();
        }
        destroy(sid, cb = noop) {
            let $this = this;

            $this._getPoolPromise().then(function () {
                return $this._removeOld();
            }).then(function () {
                return $this.pool.query(`delete from "session" where "id"=$1`, [sid]).catch((e) => { });
            }).then(function () {
                return cb();
            }).catch(function (err) {
                cb(err);
            });
        }
        clear(cb = noop) {
            let $this = this;

            $this._getPoolPromise().then(function () {
                return $this.pool.query(`delete from "session"`, []).catch((e) => { });
            }).then(function () {
                return cb();
            }).catch(function (err) {
                cb(err);
            });
        }
        length(cb = noop) {
            let $this = this;

            $this._getPoolPromise().then(function () {
                return $this._removeOld();
            }).then(function () {
                return $this.pool.query(`select count(*) as count from "session"`, []);
            }).then(function (sqlresult) {
                const rows = sqlresult.rows;
                const data = rows[0];
                cb(null, data['count']);
            }).catch(function (err) {
                cb(err);
            });
        }
        all(cb = noop) {
            let $this = this;

            $this._getPoolPromise().then(function () {
                return $this._removeOld();
            }).then(function () {
                return $this.pool.query(`select * from "session" order by id`);
            }).then(function (sqlresult) {
                const rows = sqlresult.rows;
                let result = {};
                for (let i = 0; i < rows.length; i++) {
                    let data = rows[i];
                    let value = $this.serializer.parse(data['value']);
                    // result.push(value);
                    result[data.id] = value;
                }
                cb(null, result);
            }).catch(function (err) {
                cb(err);
            });
        }
        _removeOld() {
            let ttl = settings.lifeTime || 86400;
            if (ttl > 0) {
                let t = parseInt(new Date().getTime() / 1000);
                if (Math.abs(t - this.lastRemovedTime) > 120) {
                    this.lastRemovedTime = t;
                    let $this = this;
                    $this._getPoolPromise().then(function () {
                        return $this.pool.query(`delete from "session" where "utime" < $1`, [t - ttl]).catch((e) => { });
                    });
                }
            }
        }
        _getPoolPromise() {
            let $this = this;

            let result = new Promise(function (resolve, reject) {
                resolve();
            });
            return result.then(function () {
                if (!$this.pool) {
                    $this.pool = postgresql.getPool($this.db);
                    return $this.pool.query(`create table if not exists "session" (
                        "id" varchar(64) not null default '',
                        "utime" bigint not null default 0,
                        "value" text,
                        primary key ("id")
                        )`, []).then(function () {
                        $this.pool.query(`create index if not exists "session_utime" on "session" ("utime")`, []);
                    });
                }
            }).then(function () { return $this.pool });
        }
        init() {
            this._getPoolPromise();
        }
    }
    return PostgreSQLSessionStore;
}  