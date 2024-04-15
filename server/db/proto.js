'use strict'


const log = require('../log/log').get()

//TODO При записи в базу по пустой ссылке на конфигурацию нужно делать null а сейчас или '' или null
//TODO Автогенерация SQL для логических полей
//TODO Если в поиск где должен сгенериться like в качестве параметра передать строку с незакрытой скобкой то все плохо 


const helpers = require('../helpers');


class FieldDefList extends Array {
    values() {
        let o = this.find(o => o.name == n);
        if (o) return o.values;
        return undefined;
    }
}

class PositionParams extends Array {
}

/**
 * Соединение или контроллер базы данных. Вся работа с базой данных должна осуществляться через с помощью экземпляра класса.
 * Этот класс, хотя и содержит реализацию для postgre, может использоваться только как прототип для контроллеров разных типов баз.
 */
class SQLConnection {
    /**
     * Конструктор
     * Не вызывайте конструктор напрямую используйте метод getConnection() EDMData
     * @param {obj} db настройки базы данных
     * @param {EDMData} edm 
     */
    //TODO поменять имена func, edm
    constructor(db, edm) {
        this.edm = edm;
        this.db = db;
        this.func = helpers;
        this.tranCount = 0;
        this.type = 'protosql';
    }
    /**
     * Освожает ресурсы
     */
    async free() {
        // if (this.client) {
        //     await this.client.release();
        //     this.client = undefined;
        // }
    }
    /**
     * Начало транзакции
     */
    async beginTran() {
        if (this.tranCount < 0) this.tranCount = 0;
        if (this.tranCount == 0) {
            await this.exec('BEGIN');
        }
        this.tranCount++;
    }
    /**
     * Запершение транзакции
     */
    async commitTran() {
        this.tranCount--;
        if (this.tranCount == 0) {
            await this.exec('COMMIT');
        }
    }
    /**
     * Откат транзакции
     */
    async roolbackTran() {
        await this.exec('ROLLBACK');
        this.tranCount = 0;
    }
    /**
     * Подготовка параметров запроса к базе данных для исключения sql инъекции
     * @param {any} param исходные параметры запроса
     * @returns {any} подготовленные параметры
     */
    prepareParam(param) {
        let r;
        if (typeof param != 'undefined') {
            if (typeof param._value_ != 'undefined') param = param._value_;
            if (Array.isArray(param)) {
                r = '';
                for (let i in param) {
                    let p = param[i];
                    if (p.id != undefined) p = p.id;
                    if (r) r += ',';
                    r += "'" + p.toString().replace(/\'/g, "''") + "'";
                }
            }
            else {
                if (param.id != undefined) param = param.id;
                r = "'" + param.toString().replace(/\'/g, "''") + "'";
            }
        }
        return r;
    }
    /**
     * Выполняет sql запрос с параметрами, которые заданы массивом, в теле запрса параметры заданы $1, $2 и т.д.
     * Подстановка параметров производится по номеру параметра в массиве. Результат возвращается как принять в
     * дрейвере базы данных
     *  
     * @param {string} sql - sql запрос c нумерованными параметрами 
     * @param {array} params -  список параметров
     * @returns {array}
     */
    async _exec(sql, params) {
        let hideTrace = this.hideTrace;
        let hideException = this.hideException;
        sql = sql[this.type] || sql;
        if (typeof (sql) != 'string') {
            console.error(sql);
            throw new Error('Недопустимое значение параметра sql в connection.exec');
        }
        let result;
        try {
            if (this.debug) {
                console.debug(this.debugSql(sql));
                console.debug(params);
            }
            if (this.client) {
                result = await this.client.query(sql, params);
            }
            else {
                result = await this.db.getPool().query(sql, params);
            }
            if (!hideTrace) log.stat('STAT', 'SQL');
        }
        catch (e) {
            if (!hideException) {
                log.put('EXC', 'SQL', e.message + '\n' + this.debugSql(sql), e, (this.edm || {}).user);
                console.error(e.message + '\n' + this.debugSql(sql));
                throw e;
            }
        }
        return result;
    }

    debugSql(sql) {
        //sql = sql.replaceAll(',', ',\n');
        sql = sql.replaceAll(/select/gi, 'select\n');
        sql = sql.replaceAll(/from/gi, '\nfrom\n');
        sql = sql.replaceAll(/where/gi, '\nwhere\n');
        sql = sql.replaceAll(/group by/gi, '\ngroup by\n');
        sql = sql.replaceAll(/order by/gi, '\norder by\n');
        sql = sql.replaceAll(/left join/gi, '\nleft join');
        sql = sql.replaceAll(/ and /gi, '\n and ');
        return sql;
    }

    /**
     * Выполняет запрос, используя именованный или специальный список параметров. 
     * В качестве шаблона может выступать имя класса.
     * 
     * @param {string} sql - шаблон запроса
     * @param {any} params - специальный или ассоциированный список параметров
     * @returns {array} результат запроса, как возвращает драйвер базы данных
     */
    async exec(sql, params) {
        if (params && params.constructor && params.constructor.name == 'PositionParams') return await this._exec(sql, params);
        params = this.prepareListParams(undefined, params);
        sql = sql[this.type] || sql;
        if (typeof (sql) != 'string') {
            console.error(sql);
            throw new Error('Недопустимое значение параметра sql в connection.exec');
        }
        // Формирование запроса по шаблону
        sql = this.prepareSQLFilters(sql, params);
        let namedParams = (params.find(p => p._namedparams_) || {})._namedparams_ || {};
        for (let param of params) {
            if (param.name && !this.isSpecParamName(param.name)) {
                namedParams[param.name] = param.values;
            }
        }
        // Подставить правильные имена отношений (их имена заключены в квадратные скобки)

        let self = this;
        sql = sql.replace(/\x5B\w+\x5D/g, function (m) {
            return self.getTableName(m.substr(1, m.length - 2));
        });
        // Формирование "сложного запроса"
        // Подставим параметры
        // меняем $<имя параметра> на $<номер параметра>
        // меняем $$<имя параметра> на значение параметра в кавычках или список значений в кавычках для массива
        // меняем $[<имя фильтра>, <имя поля>, <тип>, <режим>] на фильтр с номерами параметров

        let params1 = [];
        let indexator = {};
        let $this = this;
        sql = (sql + ' ').replace(/\x24{1,2}\w+\W/g, function (m) {
            let r, n, d;
            if (m.startsWith('$$')) {
                n = m.substr(2, m.length - 3);
                d = m.substr(m.length - 1, 1);
                let v = namedParams[n];
                if (v == undefined) {
                    for (let n1 in namedParams) {
                        if (n1.endsWith('.' + n)) {
                            v = namedParams[n1];
                            break;
                        }
                    }
                }
                r = $this.prepareParam(v) + d;
            }
            else {
                n = m.substr(1, m.length - 2);
                d = m.substr(m.length - 1, 1);
                let v = namedParams[n];
                //if (typeof (v) != 'undefined') {
                let i = undefined;  //indexator[n];
                if (typeof i == 'undefined') {
                    params1.push(v);
                    i = params1.length;
                    indexator[n] = i;
                }
                r = '$' + i + d;
                //}
            }
            if (typeof r == 'undefined') {
                throw new Error(`Параметр "${n}" в не найден в SQL запросе ${sql}`);
            }
            return r;
        });
        return await this._exec(sql, params1, !!params.find(p => p.name == 'debug'));
    }

    /**
     * Используется для формирования специального списка параметров 
     * @param {array} params специальный список параметров
     * @param {any} value значение параметра
     * @returns {string} имя добавленного параметра
     */
    addNamedParam(params, value) {
        let namedParams = params.find(p => p._namedparams_);
        if (!namedParams) {
            namedParams = { _namedparams_: {} };
            params.push(namedParams);
        }
        namedParams = namedParams._namedparams_;

        let count = 0;
        for (let p in namedParams) {
            if (namedParams[p] == value) return p;
            count++;
        }
        let name = `A${count}`;
        namedParams[name] = value;
        return name;
    }

    /**
     * Выполняет запрос, используя именованный или специальный список параметров. 
     * В качестве шаблона может выступать имя класса. Запрос должен возвращать ровно 1 строку. 
     * Результатом работы будет скалярное значение соответствующее первому полю в запросе
     * 
     * @param {string} sql 
     * @param {any} params 
     * @returns {any} значение
     */
    async query(sql, params) {
        params = this.prepareListParams(undefined, params);
        sql = sql[this.type] || sql;
        if (typeof (sql) != 'string') {
            console.error(sql);
            throw new Error('Недопустимое значение параметра sql в connection.query');
        }
        let r = (await this.exec(sql, params)) || {};
        let rows = r.rows || [];
        if (rows && rows.length == 1) {
            for (let n in rows[0]) {
                return rows[0][n];
            };
        }
        return undefined;
    }

    /**
     * Возвращае массив EDMObj из результата запроса, который вернул драйвер базы данных
     * @param {string} name имя класса
     * @param {array} rows результат запроса к базе данных
     * @returns {array} массив EDMObj
     */
    getListObj(name, rows) {
        let def = this.edm.getModelDef(name, ['table']);
        let data = [];
        for (let row of rows) {
            let obj = this.edm.newObj(def, row);
            if (obj._values_._new) delete obj._values_._new;
            if (row.total_count) obj._total_count = row.total_count;
            if (obj) data.push(obj);
        };
        return data;
    }

    /**
     * Выполняет запрос, используя именованный или специальный список параметров. 
     * В качестве шаблона может выступать имя класса. Результатом запроса будет массив объектов 
     * как возвращает драйвер базы данных.
     * 
     * @param {string} sql запрос
     * @param {any} params параметры запроса
     * @param {function} sqlcallback функция обратного вызова для управления процессом автогенерации
     * @returns {array} результат запроса
     */
    async select(sql, params, sqlcallback) {
        // Вместо sql можно задавать класс(имя таблицы)
        let def = this.edm.getModelDef(sql, ['table'], false);
        if (def) {
            sql = this.prepareSQL(def._name, params, sqlcallback);
        }
        else if (typeof sql == 'string' && sql.split(/\W/).length == 1) {
            throw new Error(`Тип данных "${sql}" не определен`);
        }
        params = this.prepareListParams(undefined, params);
        sql = sql[this.type] || sql;
        if (typeof (sql) != 'string') {
            console.error(sql);
            throw new Error('Недопустимое значение параметра sql в connection.select');
        }
        let r = await this.exec(sql, params) || {};
        return r.rows || [];
    }
    /**
     * Выполняет запрос, используя именованный или специальный список параметров. 
     * В качестве шаблона может выступать имя класса. Результатом запроса будет массив EDMObj 
     * Если шаблон не задан, то для автогенерации используется имя класса
     * 
     * @param {string} name имя класса
     * @param {string} sql запрос
     * @param {any} params параметры запроса
     * @param {function} sqlcallback функция обратного вызова для управления процессом автогенерации
     * @returns {array} массив EDMObj
     */
    async selectObj(name, sql, params, sqlcallback) {
        let def = this.edm.getModelDef(name, ['table']);
        params = this.prepareListParams(name, params);
        if (sql) {
            sql = sql[this.type] || sql;
            if (typeof (sql) != 'string') {
                console.error(sql);
                throw new Error('Недопустимое значение параметра sql в connection.selectObj');
            }
        }
        let rows = await this.select(sql || name, params, undefined, sqlcallback);
        return this.getListObj(def, rows);
    }

    /**
     * Выполняет запрос, используя именованный или специальный список параметров. 
     * В качестве шаблона может выступать имя класса. Результатом запроса EDMObj соответствующий первой строке запроса.
     * Если шаблон не задан, то для автогенерации используется имя класса. 
     * 
     * @param {string} name имя класса
     * @param {string} sql запрос
     * @param {any} params параметры запроса
     * @param {function} sqlcallback функция обратного вызова для управления процессом автогенерации
     * @returns {EDMObj} EDMObj
     */
    async selectOneObj(name, sql, params, sqlcallback) {
        return (await this.selectObj(name, sql, params, sqlcallback))[0];
    }


    /**
     * Проверяет наличие заданной строки в базе даннных и возвращает его id
     * @param {any} name - имя таблицы(класса), описатель или EDMObj
     * @param {any} values - EDMObj или объект
     * @returns {any} id объекта или undefined
     */
    async exists(name, values) {
        if (!values && typeof name == 'object') values = name;
        let def = this.edm.getModelDef(name || values, ['table']);
        let id = undefined;
        if (values.id) id = await this.query(`select id from [${def._name}] where id=$id`, { id: values.id });
        else if (values.gid) id = await this.query(`select id from [${def._name}] where gid=$gid`, { gid: values.gid });
        return id;
    }
    /**
     * Добавляет новую строку в таблицу базы данных, если строка с таким id уже есть в базе, то производится update.
     * Если id не задан, то в базе создается новый объект с уникальным id
     * @param {any} name имя класса или EDMObj
     * @param {object} values EDMObj или значения свойств которого, соответствует полям модели. 
     * @returns {array} массив из одного добавленного объекта
     */
    async insertObj(name, values) {
        if (!values && typeof name == 'object') values = name;
        let def = this.edm.getModelDef(name || values, ['table']);
        let rows = await this.insert(def, values?._values_ || values);
        let data = this.getListObj(def, rows);
        // Проверке валидности
        for (let o of data) {
            if (o.afterInsert) await o.afterInsert();
            await this.validateObj(o);
        }
        return data;
    }
    /**
     * Добавляет новую строку в таблицу базы данных, если строка с таким id уже есть в базе, то производится update.
     * Если id не задан, то в базе создается новый объект с уникальным id
     * @param {any} name имя класса
     * @param {object} values объект значения свойств которого, соответствует полям модели. 
     * @returns {array} массив из одного добавленной строки базы
     */
    async insert(name, values) {
        if (!values && typeof name == 'object') values = name;
        let def = this.edm.getModelDef(name || values, ['table']);
        let fields = '';
        let logFields = '';
        let params = new PositionParams();
        let fieldValues = '';
        let idDef = '';
        for (let f in def._childs) {
            let field = def._childs[f];
            if (!field.virtual && field._mtype == 'field') {
                let v = values[f];
                if (field._ptype == 'id' && field._name == 'id') {
                    if (v != undefined) {
                        if (fields) {
                            fields += ',';
                            fieldValues += ',';
                        }
                        fields += '"' + f + '"';
                        idDef = this.getParamDef(def, field, params, v);
                        fieldValues += idDef;
                    }
                }
                else if (field._ptype == 'ref' || field._ptype == 'reflist') {
                    if (Array.isArray(v)) {
                        v = v.map(o => { return o.id || o }).join(',');
                    }
                    else if (v && typeof v == 'object') {
                        v = v.id;
                    }
                    if (v == undefined && field._type == 'user' && field._notnull) {
                        v = this.edm.user?.id;
                    }
                    if (typeof v != 'undefined') {
                        if (fields) {
                            fields += ',';
                            fieldValues += ',';
                        }
                        fields += '"' + f + '"';
                        fieldValues += this.getParamDef(def, field, params, v);
                    }
                }
                else if (!field._ptype || field._ptype == 'props' || field._ptype == 'reflist') {
                    if (typeof v != 'undefined') {
                        if (fields) {
                            fields += ',';
                            fieldValues += ',';
                        }
                        fields += '"' + f + '"';
                        fieldValues += this.getParamDef(def, field, params, v);
                    }
                    // else {
                    //     if (fields) {
                    //         fields += ',';
                    //         fieldValues += ',';
                    //     }
                    //     fields += '"' + f + '"';
                    //     fieldValues += 'default';
                    // }
                }
            }
            if (def._log) {
                if (!field.virtual && field._mtype == 'field' && field._ptype != 'props' && field._ptype != 'reflist') {
                    if (logFields) logFields += ',';
                    logFields += '"' + f + '"';
                }
            }
        }

        let rows = undefined;
        let isUpdate = false;
        if (fields) {
            if (!idDef) {
                rows = await this.select(`insert into ${this.getTableName(def._name)}(${fields}) values(${fieldValues})  returning *`, params);
            }
            else {
                rows = await this.select(`insert into ${this.getTableName(def._name)}(${fields}) select ${fieldValues} where not exists(select 1 from ${this.getTableName(def._name)} where id=${idDef})  returning *`, params);
                if (rows.length == 0) {
                    isUpdate = true;
                    rows = await this.update(name, values);
                }
            }
        }
        else {
            rows = await this.select(`insert into ${this.getTableName(def._name)} default values returning *`, params);
        }

        // // Запись в LOG
        // if (!isUpdate && def._log && logFields) {
        //     for (let o of rows) {
        //         await this.exec(`insert into "${def._mname}"."_log_${def._name}" ("_log_opr_type", "_log_upd_time", "_log_upd_user", ${logFields}) select 'I', now(), $user, ${logFields} from "${def._mname}"."${def._name}" where id=$id`, { id: o.id, user: this.edm.user.id });
        //     }
        // }

        return rows;
    }
    /**
     * Изменяет строку в таблице базы данных.
     * @param {any} name имя класса или EDMObj
     * @param {object} values EDMObj или значения свойств которого, соответствует полям модели. 
     * @returns {array} массив из одного EDMObj
     */
    async updateObj(name, values) {
        if (!values && typeof name == 'object') values = name;
        if (!values?.id) values = Object.assign({ id: name.id }, values);
        let def = this.edm.getModelDef(name || values, ['table']);

        // Проверка на readonly
        let readOnlyFields = {};
        await this.isReadOnlyObj(def, values.id, readOnlyFields);
        let rows = await this.update(def, values?._values_ || values, readOnlyFields);
        let data = this.getListObj(def, rows);

        // Проверке валидности
        for (let o of data) {
            if (o.afterUpdate) await o.afterUpdate();
            await this.validateObj(o);
        }
        return data;
    }
    /**
     * Изменяет строку в таблице базы данных
     * @param {any} name имя класса
     * @param {object} values объект значения свойств которого, соответствует полям модели. 
     * @returns {array} массив из одной строки базы данных
     */
    async update(name, values, readOnlyFields) {
        if (!values && typeof name == 'object') values = name;
        if (!values?.id) values = Object.assign({ id: name.id }, values);
        let def = this.edm.getModelDef(name || values, ['table']);
        let fields = '';
        let logFields = '';

        // Подготовить параметры
        let params = new PositionParams();
        for (let f in def._childs) {
            let field = def._childs[f];
            if (!field.virtual && (!readOnlyFields || !readOnlyFields[f])) {
                if (field._ptype == 'ref' || field._ptype == 'reflist') {
                    let v = values[f];
                    if (Array.isArray(v)) {
                        v = v.map(o => { return o.id || o }).join(',');
                    }
                    else if (v && typeof v == 'object') {
                        v = v.id;
                    }
                    if (typeof v != 'undefined') {
                        if (!v) v = null;
                        if (fields) fields += ',';
                        fields += `"${f}"=` + this.getParamDef(def, field, params, v);
                    }
                }
                else if (field._mtype == 'field' && field._name != 'id' && (!field._ptype || field._ptype == 'props' || field._ptype == 'reflist')) {
                    let v = values[f];
                    if (typeof v != 'undefined') {
                        if (fields) fields += ',';
                        fields += `"${f}"=` + this.getParamDef(def, field, params, v);
                    }
                }
            }

            if (def._log) {
                if (!field.virtual && field._mtype == 'field' && field._ptype != 'props' && field._ptype != 'reflist') {
                    if (logFields) logFields += ',';
                    logFields += '"' + f + '"';
                }
            }
        }
        let id = values.id;

        // Запись в LOG первоначального состояния
        if (def._log && logFields) {
            await this.exec(`insert into "${def._mname}"."_log_${def._name}" ("_log_opr_type", "_log_upd_time", "_log_upd_user", ${logFields}) select 'F', null, null, ${logFields} from "${def._mname}"."${def._name}" where id=$id and not exists(select 1 from "${def._mname}"."_log_${def._name}" where id=$id)`, { id: id });
        }

        let rows;
        if (fields) rows = await this.select(`update ${this.getTableName(def._name)} set ${fields} where id=${this.getParamDef(def._name, 'id', params, id)} returning *`, params);
        else rows = await this.select(`select * from ${this.getTableName(def._name)} where id=${this.getParamDef(def._name, 'id', params, id)} `, params);

        if (rows.length == 0) {
            rows = await this.insert(name, values, readOnlyFields);
        }
        else {
            // Запись в LOG
            if (def._log && logFields) {
                for (let o of rows) {
                    await this.exec(`insert into "${def._mname}"."_log_${def._name}" ("_log_opr_type", "_log_upd_time", "_log_upd_user", ${logFields}) select 'U', now(), $user, ${logFields} from "${def._mname}"."${def._name}" where id=$id`, { id: o.id, user: this.edm.user.id });
                }
            }
        }

        return rows;
    }

    /**
     * Проверяет валидность EDMObj в соответствии с правилами валидации, которые описаны в модели.
     * В случае ошибки создается исключение.
     * @param {EDMObj} obj EDMObj
     */
    async validateObj(obj) {
        if (obj) {

            let def = obj._def_;
            if (def._proto_ && Object.hasOwn(def._proto_, 'isvalidatedef')) {
                await this.addRef();
            }

            if (obj.isvalidatedef) {
                let error = '';
                let f = obj.isvalidatedef();
                if (f === true && obj.isvalidate) f = obj.isvalidate();
                if (f !== true) {
                    if (f != undefined) {
                        if (f === false) f = `\n!!!Ошибки при проверке!!!`;
                        error += `\n${f}`;
                    }
                }
                for (let fn in def._childs) {
                    let fdef = def._childs[fn];
                    if (fdef._mtype == 'field' && !fdef.virtual) {
                        f = obj.isvalidatedef(fdef._name);
                        if (f === true && obj.isvalidate) f = obj.isvalidate(fdef._name);
                        if (f != undefined) {
                            if (f !== true) {
                                if (f === false) f = `\n!!!Ошибки при проверке поля "${fdef._label}"!!!`;
                                error += `\n${f}`;
                            }
                        }
                    }
                }
                if (error) {
                    error = `${def._label}${error}`;
                    throw error;
                }
            }
        }
    }
    async isReadOnlyObj(def, id, readOnlyFields, callBeforeDelete) {
        let error = '';
        if (id && def._proto_) {
            let f1 = Object.hasOwn(def._proto_, 'isreadonly');
            let f2 = false;
            let f3 = callBeforeDelete && def._proto_.beforeDelete !== undefined;
            if (readOnlyFields) {
                for (let fn in def._childs) {
                    let fdef = def._childs[fn];
                    if (fdef._mtype == 'field' && !fdef.virtual && def._proto_[`isreadonly.${fdef._name}`] != undefined) {
                        f2 = true;
                        break;
                    }
                }
            }
            if (f1 || f2 || f3) {
                let data = await this.selectObj(def._name, `select * from ${this.getTableName(def._name)} where id=$1`, [id]);
                await this.addRef();
                if (data.length > 0) {
                    let obj = data[0];
                    if (obj.isreadonly) {
                        let f = obj.isreadonly();
                        if (f != undefined) {
                            if (f !== false && f !== undefined) {
                                if (f === true) f = `${obj}\n!!!ТОЛЬКО ЧТЕНИЕ!!!`;
                                error += `\n${f}`;
                            }
                        }
                        if (f2) {
                            for (let fn in def._childs) {
                                let fdef = def._childs[fn];
                                if (fdef._mtype == 'field' && !fdef.virtual) {
                                    f = obj.isreadonly(fdef._name);
                                    if (f != undefined) {
                                        if (f) {
                                            readOnlyFields[fdef._name] = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if (f3) {
                    for (let o of data) {
                        await o.beforeDelete();
                    }
                }
            }
        }
        if (error) {
            error = `${def._label}${error}`;
            throw error;
        }
    }

    /**
     * Удаляет строку из таблицы базы данных.
     * @param {any} name имя класса или EDMObj
     * @param {object} values EDMObj или значения свойств которого, соответствует полям модели. 
     */
    async deleteObj(name, values) {
        if (!values && typeof name == 'object') values = name;
        if (!values?.id) values = Object.assign({ id: name.id }, values);
        let def = this.edm.getModelDef(name || values, ['table']);
        await this.isReadOnlyObj(def, values.id, undefined, true)
        this.delete(def, values);
    }
    /**
     * Удаляет строку из таблицы базы данных.
     * @param {any} name имя класса
     * @param {object} values объект значения свойств которого, соответствует полям модели. 
     * @returns {array} массив из одной строки базы данных
     */
    async delete(name, values) {
        if (!values && typeof name == 'object') values = name;
        if (!values?.id) values = Object.assign({ id: name.id }, values);
        let def = this.edm.getModelDef(name || values, ['table']);
        // Запись в LOG
        if (def._log) {
            let logFields = '';
            for (let f in def._childs) {
                let field = def._childs[f];
                if (!field.virtual && field._mtype == 'field' && field._ptype != 'props' && field._ptype != 'reflist') {
                    if (logFields) logFields += ',';
                    logFields += '"' + f + '"';
                }
            }
            if (logFields) {
                await this.exec(`insert into "${def._mname}"."_log_${def._name}" ("_log_opr_type", "_log_del_time", "_log_del_user", ${logFields}) select 'D', now(), $user, ${logFields} from "${def._mname}"."${def._name}" where id=$id`, { id: values.id, user: this.edm.user.id });
            }
        }
        let params = new PositionParams();
        await this.exec(`delete from ${this.getTableName(def._name)} where id=${this.getParamDef(def._name, 'id', params, values.id)}`, params);
    }

    async join(upd, def) {
        this.beginTran();
        try {
            // Меняем все ссылки на mainid
            let classes = this.edm.classes;
            for (let cn in classes) {
                let c = classes[cn];
                for (let fn in c._childs) {
                    let f = c._childs[fn];
                    if (f._ptype == 'ref' && f._type == upd._type) {
                        await this.exec(`update [${c._name}] set "${f._name}"=$mainid where "${f._name}" in ($$joinid)`, upd);
                    }
                }
            }
            // Удаляем joinid
            await this.exec(`delete from [${upd._type}] where "id" in ($$joinid)`, upd);
            this.commitTran();
        }
        finally {
            this.roolbackTran();
        }
    }

    /**
     * Сохранение изменений. Все изменения будут выполнены в рамках одной транзакции
     * @param {array} updates массив изменений
     * @returns {array} список измененных объектов
     */
    async saveData(updates) {
        let data
        try {
            await this.beginTran();
            data = await this._saveData(updates);
            await this.commitTran();
        }
        catch (e) {
            await this.roolbackTran();
            data = [];
            throw e;
        }
        return data;
    }

    /**
     * Сохранение изменений. Все изменения будут выполнены вне транзакции.
     * @param {array} updates массив изменений
     * @returns {array} список измененных объектов
     */
    async _saveData(updates) {

        let data = [];
        for (let i in updates) {
            let upd = updates[i];
            let operation = upd._operation || 'update';
            let type = upd._type;
            if (type) {
                let def = this.edm.getModelDef(type, ['table'], false);
                if (def) {
                    if (typeof (this[operation]) != 'function') throw new Error(`Запись изменений. Операция "${operation}" не поддерживается`);
                    let _data = await this[`${operation}Obj`](def._name, upd);
                    if (!updates.id && _data && _data[0] && _data[0].id) updates.id = _data[0].id;
                    if (operation == 'delete' || operation == 'remove') _data = [];
                    data = data.concat(_data);
                }
            }
        }
        return data;
    }

    /**
     * Разрешение неразрешенных ссылок.
     */
    async addRef() {
        let count = 5;
        while (count > 0 && (await this.selectRefs(this.edm.getUndefinedRef()))) {
            count--;
        }
    }

    isSpecParamName(name) {
        return !name || '_#$@%'.includes(name[0]);
    }
    getFieldDefList(name, paths, isFilters = false) {
        let result = [];
        if (name && paths) {
            if (!Array.isArray(paths)) paths = [paths];
            for (let path of paths) {
                let result1 = [];
                result.push(result1);
                let names = path.split('@')[0].split('.');
                if (isFilters) names.push('id');
                let def = this.edm.classes[name];
                if (!def) throw new Error(`Автогенерация. Имя главной таблицы "${name}" задано неправильно `);
                result1.push({ def: def, cdef: undefined });
                for (let i = 0; i < names.length; i++) {
                    let n = names[i];
                    if (def) {
                        let cdef = undefined;
                        cdef = def._childs[n];
                        if (cdef && cdef._ptype == 'ref') {
                            def = this.edm.classes[cdef._type];
                            result1.push({ def: def, cdef: cdef });
                        }
                        else if (cdef) {
                            result1.push({ def: undefined, cdef: cdef });
                        }
                    }
                }
            }
        }
        return result;
    }
    prepareFieldDefList(name, param) {
        //TODO Если передается объект то нужно поменять его на id
        return param;
    }

    /**
     * Подготовка списка параметров запроса. Параметры в запрос могут передаваться разными способами.
     * Метод prepareListParams позводяет привести их к единому формату, который используется при
     * автоматической генерации запроса.
     * @param {string} name имя класса
     * @param {any} params параметры запросы
     * @returns {array} унифицированный список параметров
     */
    prepareListParams(name, params) {
        if (params && params.constructor && params.constructor.name == 'PositionParams') return params;
        let result = new FieldDefList();

        let def = this.edm.getModelDef(name, ['table'], false);
        let filters = function (name) {
            let name1 = name;
            if (def && def._childs) {
                let cdef = def._childs[name];
                if (cdef && cdef._filters) {
                    return cdef._filters;
                }
            }
            return undefined;
        }

        if (params) {
            if (Array.isArray(params)) {
                if (params.find(p => p._prepare_)) {
                    return params;
                }
                else {
                    for (let param of params) {
                        if (!this.isSpecParamName(param.name)) {
                            result.push(
                                this.prepareFieldDefList(name, {
                                    table: name,
                                    name: param.name,
                                    filters: filters(param.name),
                                    values: param.values,
                                    type: param.type,
                                    label: param.label,
                                })
                            );
                        }
                    }
                }
            }
            else {
                for (let pn in params) {
                    if (!this.isSpecParamName(pn)) {
                        result.push(
                            this.prepareFieldDefList(name, {
                                table: name,
                                name: pn.startsWith('filter.') ? pn.substring(7) : pn,
                                filters: filters(pn.startsWith('filter.') ? pn.substring(7) : pn),
                                values: params[pn],
                            })
                        );
                    }
                }
            }
        }
        result.push({ _prepare_: true });
        return result;
    }

    /**
     * Возвращает  секцию "select" - начало запроса.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} name - имя класса 
     * @param {array} params - список параметров запорса
     * @param {function} sqlcallback - функция обратного вызова для корректировки результата работы
     * @returns {string} секция "select"
     */
    prepareSQLPref(name, params, sqlcallback) {

        if (!Array.isArray(params)) throw new Error(`Автогенерация. Параметра заданы неправильно (prepareSQLPref)`);

        let sql = '';
        if (params.find(p => p.name == 'paginator' || p.name == 'continue')) sql = 'count(*) OVER() AS total_count,';
        if (sqlcallback) sql = sqlcallback.call(this, sql, name, params, 'pref');
        return sql
    }
    /**
     * Возвращает  секцию "fields" - список полей запроса.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} name - имя класса 
     * @param {array} params - список параметров запорса
     * @param {function} sqlcallback - функция обратного вызова для корректировки результата работы
     * @returns {string} секция "fields"
     */
    prepareSQLFields(name, params, sqlcallback) {

        if (!Array.isArray(params)) throw new Error(`Автогенерация. Параметра заданы неправильно (prepareSQLFields)`);

        let sql = `"${name}".*`;
        for (let param of params) {
            let paramName = param.name;
            if (!this.isSpecParamName(paramName)) {

                let ns = paramName.split('@');
                paramName = ns[0];
                let suff = ns[1];
                let def = this.edm.classes[param.table];
                if (def) {
                    let cdef = def._childs[paramName];
                    if (cdef) {
                        if (cdef._mtype == 'field' && cdef.virtual) {
                            if (cdef._asis) {
                                sql += `\n, $vfield(${paramName}->@${cdef._asis})$`;
                            }
                            else {
                                if (param.filters)
                                    for (let defList of this.getFieldDefList(name, param.filters, true)) {
                                        if (defList.length >= 2) {
                                            let def1 = defList[defList.length - 2].def;
                                            let cdef1 = defList[defList.length - 1].cdef;
                                            if (cdef1 && cdef1._mtype == 'field') {
                                                sql += `\n, $vfield(${paramName}->"${def1._name}"."${cdef1._name}")$`;
                                                break;
                                            }
                                        }
                                    }
                            }

                        }
                    }
                }

            }
        }

        if (sqlcallback) sql = sqlcallback.call(this, sql, name, params, 'fields');
        return sql
    }
    /**
     * Возвращает  секцию "from" - список связанных таблиц участвующих в запросе.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} name - имя класса 
     * @param {array} params - список параметров запорса
     * @param {function} sqlcallback - функция обратного вызова для корректировки результата работы
     * @returns {string} секция "from"
     */
    prepareSQLFrom(name, params, sqlcallback) {

        if (!Array.isArray(params)) throw new Error(`Автогенерация. Параметры заданы неправильно (prepareSQLFrom)`);

        let sql = `${this.getTableName(name)} "${name}" `;
        let joins = {};

        for (let param of params) {
            let paths = undefined;

            if (param.filters) {
                paths = this.getFieldDefList(name, param.filters, true);
            }
            else {
                paths = this.getFieldDefList(name, param.name);
            }

            if (paths) {
                for (let defList of paths) {
                    let alias = '';
                    let alias1 = '';
                    for (let i = 1; i < defList.length; i++) {
                        let o = defList[i - 1];
                        let c = defList[i];
                        if (alias) alias += '.';
                        alias += c.cdef._name;
                        if (c.def && c.cdef && c.def._mtype == 'table' && !(i == defList.length - 1)) {
                            let join = ` left join ${this.getTableName(c.def._name)} "${alias}"  on "${alias1 || o.def._name}"."${c.cdef._name}" = "${alias}"."id"`;
                            //let join = ` left join ${this.getTableName(c.def._name)} "${c.def._name}"  on "${o.def._name}"."${c.cdef._name}" = "${c.def._name}"."id"`;
                            //TODO let join = ` left join ${this.getTableName(c.def._name)} "${c.def._name}${i ? i : ''}"  on "${o.def._name}${(i - 1 > 0) ? i - 1 : ''}"."${c.cdef._name}" = "${c.def._name}${i ? i : ''}"."id"`;
                            if (!joins[join]) {
                                joins[join] = true;
                                sql += '\n' + join;
                            }
                        }
                        if (alias1) alias1 += '.';
                        alias1 += c.cdef._name;
                    }
                }
            }
        }

        if (sqlcallback) sql = sqlcallback.call(this, sql, name, params, 'from');
        return sql
    }
    getSuff(paramName, cdef) {
        let result = '';
        if (cdef._ptype == 'ref' || cdef._ptype == 'id') {
            result = 'in';
        }
        else if (cdef._ptype == 'reflist') {
            result = 'overlap';
        }
        else {
            switch (cdef._type) {
                case 'string':
                    result = 'like'
                    break;
                case 'int':
                case 'long':
                case 'byte':
                case 'short':
                case 'float':
                case 'double':
                case 'decimal':
                case 'money':
                    result = 'interval'
                    break;
                case 'date':
                case 'datetime':
                    result = 'date'
                    break;
                case 'bool':
                    result = 'bool'
                    break;
                case 'guid':
                    result = 'eq'
                    break;
                default: {
                    throw new Error(`Автогенерация. Поле "${paramName}" с типом "${cdef._type}" не может участвовать в автогенерации`);
                }
            }
        }
        return result;
    }
    /**
     * Возвращает  секцию "where" - условия отбора.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} name - имя класса 
     * @param {array} params - список параметров запорса
     * @param {function} sqlcallback - функция обратного вызова для корректировки результата работы
     * @returns {string} секция "where"
     */
    prepareSQLWhere(name, params, sqlcallback) {

        if (!Array.isArray(params)) throw new Error(`Автогенерация. Параметра заданы неправильно (prepareSQLWhere)`);

        let sql = '';
        for (let param of params) {
            let paramName = param.name;
            if (param.name && param.name.endsWith('@order')) continue;
            if (!this.isSpecParamName(paramName)) {

                let ns = paramName.split('@');
                paramName = ns[0];
                let suff = ns[1] || '';
                if (suff != 'order') {
                    let def = this.edm.classes[param.table];
                    let mainAlias = param.table;
                    let alias = '';
                    let nt = paramName.split('.');
                    let i = 0;
                    if (nt.length > 1) {
                        paramName = nt.pop();
                        for (let n of nt) {
                            i++;
                            let cdef = def._childs[n];
                            if (cdef && cdef._mtype == 'field' && cdef._ptype == 'ref') {
                                def = this.edm.classes[cdef._type];
                                if (alias) alias += '.'
                                alias += n;
                            }
                        }
                    }
                    if (def) {
                        let cdef = def._childs[paramName];
                        if (cdef) {
                            if (cdef._mtype == 'field') {
                                if (!cdef.virtual) {
                                    suff = suff || this.getSuff(paramName, cdef)
                                    if (cdef.virtual) sql += '\n' + ` and $${suff}(${paramName}->"${cdef._name}")$`
                                    else sql += '\n' + ` and $${suff}(${paramName}->"${alias || mainAlias}"."${cdef._name}")$`
                                    //else sql += '\n' + ` and $${suff}(${paramName}->"${def._name}"."${cdef._name}")$`
                                    //TODO else sql += '\n' + ` and $${suff}(${paramName}->"${def._name}${i ? i : ''}"."${cdef._name}")$`
                                }
                            }
                            else if (cdef._mtype == 'filter') {
                                if (cdef._asis) {
                                    let asis = cdef._asis;
                                    if (typeof asis == 'function') {
                                        asis = asis(this);
                                    }
                                    sql += `\n and $asis(${paramName}->@${asis})$`;
                                }
                                else if (param.filters)
                                    for (let defList of this.getFieldDefList(name, param.filters, true)) {
                                        if (defList.length >= 2) {
                                            let def1 = defList[defList.length - 2].def;
                                            let cdef1 = defList[defList.length - 1].cdef;
                                            if (cdef1 && cdef1._mtype == 'field') {
                                                suff = suff || this.getSuff(paramName, cdef1)
                                                sql += `\n and $${suff}(${paramName}->"${def1._name}"."${cdef1._name}")$`
                                                //TODO sql += `\n and $${suff}(${paramName}->"${def1._name}${i ? i : ''}"."${cdef1._name}")$`
                                                break;
                                            }
                                        }
                                    }
                            }
                        }
                    }
                }
            }
        }

        if (sqlcallback) sql = sqlcallback.call(this, sql, name, params, 'where');
        return sql
    }
    /**
     * Возвращает  секцию "order" - правила сортировки.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} name - имя класса 
     * @param {array} params - список параметров запорса
     * @param {function} sqlcallback - функция обратного вызова для корректировки результата работы
     * @returns {string} секция "order"
     */
    prepareSQLOrder(name, params, sqlcallback) {

        if (!Array.isArray(params)) throw new Error(`Автогенерация. Параметра заданы неправильно (prepareSQLOrder)`);

        let sql = '';
        for (let param of params) {
            let paramName = param.name;
            if (!this.isSpecParamName(paramName)) {

                let ns = paramName.split('@');
                paramName = ns[0];
                let suff = ns[1];

                let def = this.edm.classes[param.table];
                if (def) {
                    let cdef = def._childs[paramName];
                    if (cdef) {
                        if (cdef._mtype == 'order') {
                            if (cdef._asis) {
                                sql += `\n, $order(${paramName}->@${cdef._asis})$`;
                            }
                            else {
                                if (param.filters) {
                                    for (let defList of this.getFieldDefList(name, param.filters, true)) {
                                        let i = 0;
                                        if (defList.length >= 2) {
                                            i++;
                                            let def1 = defList[defList.length - 2].def;
                                            let cdef1 = defList[defList.length - 1].cdef;
                                            if (cdef1 && cdef1._mtype == 'field') {
                                                sql += `\n, $order(${paramName}->"${def1._name}"."${cdef1._name}")$`;
                                                //TODO sql += `\n, $order(${paramName}->"${def1._name}${i ? i : ''}"."${cdef1._name}")$`;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (cdef._mtype == 'field' && suff == 'order') {
                            if (!cdef.virtual) {
                                sql += `\n, $order(${paramName}->"${def._name}"."${cdef._name}")$`;
                            }
                        }

                    }
                }
            }
        }

        if (sqlcallback) sql = sqlcallback.call(this, sql, name, params, 'order');
        return sql
    }
    /**
     * Возвращает  секцию "суффикс" - окончание запроса.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} name - имя класса 
     * @param {array} params - список параметров запорса
     * @param {function} sqlcallback - функция обратного вызова для корректировки результата работы
     * @returns {string} секция "суффикс"
     */
    prepareSQLSuff(name, params, sqlcallback) {

        if (!Array.isArray(params)) throw new Error(`Автогенерация. Параметра заданы неправильно (prepareSQLSuff)`);

        let sql = '';
        if (params.find(p => p.name == 'paginator' || p.name == 'continue')) {
            let start = (params.find(p => p.name == 'start') || {}).values || 0;
            let count = (params.find(p => p.name == 'count') || {}).values || 50;
            if (isNaN(start)) throw new Error(`Параметр start задан неправильтно`);
            if (isNaN(count)) throw new Error(`Параметр count задан неправильтно`);
            sql = `limit ${count} offset ${start}`;
        }
        if (sqlcallback) sql = sqlcallback.call(this, sql, name, params, 'suff');
        return sql
    }

    /**
     * Возвращает шаблон запроса по имени класса и параметрам запроса. 
     * @param {string} name - имя класса 
     * @param {array} params - список параметров запорса
     * @param {function} sqlcallback - функция обратного вызова для корректировки результата работы
     * @returns {string} секция "select"
     */
    prepareSQL(name, params, sqlcallback) {
        //sqlcallback = undefined;
        let _ = function (pref = '', text = '', suff = '') {
            if (text) return pref + text + suff;
            return '';
        }
        params = this.prepareListParams(name, params);
        let sql = `select
        ${this.prepareSQLPref(name, params, sqlcallback)} 
        ${this.prepareSQLFields(name, params, sqlcallback)} 
        ${_(' from ', this.prepareSQLFrom(name, params, sqlcallback))} 
        ${_(' where true ', this.prepareSQLWhere(name, params, sqlcallback))} 
        ${_(' order by ', this.prepareSQLOrder(name, params, sqlcallback))} 
        ${this.prepareSQLSuff(name, params, sqlcallback)} 
        `;
        if (sqlcallback) sql = sqlcallback.call(this, sql, name, params, 'sql');
        return sql;
    }

    /**
     * Разрешает фильтры в шаблоне запроса. Вместо каждого фильтра поставляются условия, которые это фильтр возвращает.
     * Фильтром считается конструкция вида $myfilter(name->field)$. Для включения нового фильтра или изменения работы 
     * нужно добавить функцию filter_myfilter() или переопределить ее.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} sql шаблон запроса
     * @param {any} params параметры вызова
     * @returns {string} шаблон запроса с подставленными фильтрами
     */
    prepareSQLFilters(sql, params) {
        sql = sql.replaceAll(/\s+/gmi, " ");

        let f = true;
        while (f) {
            f = false;
            let matches = sql.matchAll(/\$(\w+)\(|\)\$/gmi);
            let level = 0;
            let startMatch = undefined;
            let endMatch = undefined;
            for (let m of matches) {
                if (m[0] != ')$') {
                    if (level == 0) {
                        startMatch = m;
                    }
                    level++
                }
                else {
                    level--;
                    if (level == 0) {
                        f = true;
                        endMatch = m;
                        let start = startMatch.index;
                        let end = endMatch.index;
                        let filterName = startMatch[1];
                        let filterContent = sql.substring(start + filterName.length + 2, end);
                        let i = filterContent.indexOf('->');

                        let paramName = (i >= 0) ? filterContent.substring(0, i) : filterContent;
                        let fieldName = (i >= 0) ? filterContent.substring(i + 2) : filterContent;
                        let result = "";
                        // if (filterName != 'asis' && !fieldName.startsWith('@') && !fieldName.startsWith('"')) {
                        //     let names = fieldName.split('.');
                        //     for (let i = 0; i < names.length; i++) {
                        //         if (!names[i].startsWith('"')) names[i] = '"' + names[i] + '"';
                        //     }
                        //     fieldName = names.join('.');
                        // }
                        if (fieldName.startsWith('@')) fieldName = fieldName.substring(1);
                        for (let filter of params) {
                            let bufRes = "";
                            if (filter.name && (filter.name.split('@')[0] == paramName || filter.name.split('@')[0].endsWith('.' + paramName))) {
                                if (this[`filter_${filterName}`]) bufRes = this[`filter_${filterName}`](paramName, fieldName, filter.values, params);
                                else {
                                    throw new Error(`Функция подстановки фильтра не определена для ${filterName}`);
                                }
                            }
                            if (result.trim() != "" && bufRes.trim() != "") result += " and " + bufRes;
                            else if (bufRes.trim() != "") result = bufRes;
                        }
                        if (result == '') result = '<<>>';
                        sql = sql.substring(0, start) + result + sql.substring(end + 2);
                        break;
                    }
                    else if (m < 0) {
                        break;
                    }
                }
            }
            if (level != 0) throw new Error(`Автогенерация. Ошибка при разборе ${sql}`);
        }

        sql = sql.replaceAll(/\s+and\s*<<>>/gi, " ");
        sql = sql.replaceAll(/\s+or\s*<<>>/gi, " ");
        sql = sql.replaceAll(/\s*<<>>\s*and\s+/gi, " ");
        sql = sql.replaceAll(/\s*<<>>\s*or\s+/gi, " ");
        sql = sql.replaceAll(/,\s*<<>>/gi, " ");
        sql = sql.replaceAll(/order\s+by\s*\,/gi, "order by  ");
        sql = sql.replaceAll(/order\s+by\s*limit/gi, "  limit");
        sql = sql.replaceAll(/order\s+by\s*$/gi, "  ");

        sql = sql.replaceAll(/\s+/gmi, " ");

        return sql;

    }

    static valuesToArray(values) {
        if (!Array.isArray(values)) {
            if (typeof values == 'string') {
                let avalues = values.replaceAll(';', ',').split(',');
                values = [];
                avalues.forEach(v => { v = v.trim(v); if (v) values.push(v) });
            }
            else values = [values];
        }
        return values;
    }


    /**
     * Фильтр like. Формирует условия отбора для условия like. 
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_like(paramName, fieldName, values, params) {
        let result = "";
        values = SQLConnection.valuesToArray(values);
        values.forEach(v => {
            if (v != '') {
                if (result != '') result += " or ";
                result += ` cast(${fieldName} as varchar) ~* $${this.addNamedParam(params, v)}`;
            }
        }, this);
        if (result.trim() != '') return `(${result})`;
        return result;
    }
    /**
     * Фильтр in. Формирует условия отбора для условия in. 
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_in(paramName, fieldName, values, params) {
        let result = "";
        let isNull = false;
        values = SQLConnection.valuesToArray(values);
        values.forEach(v => {
            if (v != '' && v != undefined) {
                if (v.toString().toUpperCase() != 'NULL') {
                    if (result != '') result += ", ";
                    result += `${this.prepareParam(v)}`;
                }
                else {
                    isNull = true;
                }
            }
        }, this);

        if (result && isNull) result = `((${fieldName} in (${result}) or ${fieldName} is null))`;
        else if (result) result = `(${fieldName} in (${result}))`;
        else if (isNull) result = `(${fieldName} is null)`;
        else result = '';

        return result;
    }
    /**
     * Фильтр overlap. Формирует условия отбора для двух строк параметра и значению в базе.
     * Из строк форируются массивы по разделителю ','. Условие считается выполненным, если
     * имеет место пересечение массивов.
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_overlap(paramName, fieldName, values, params) {
        if (values) {
            let result = (SQLConnection.valuesToArray(values) || []).join(',');
            if (result) return `string_to_array(${fieldName},',') && string_to_array('${result}',',')`;
        }
        return '';
    }
    /**
     * Фильтр date. Формирует условия отбора для интервала дат. В качестве параметра может задаваться
     * либо массив из двух дат, либо строку разделенною символом ~, которая преобразуется в две даты. 
     * Первая дата задает нижнюю границу, вторая верхнюю. Если одна из дат не задана, 
     * то соответствующая граница не проверяется.
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_date(paramName, fieldName, values, params) {
        let result = "";
        values = SQLConnection.valuesToArray(values);
        values.forEach(v => {
            if (v) {
                if (result != '') result += " or ";
                if (typeof v == 'string') v = v.split('~');
                if (!Array.isArray(v)) v = [v];
                if (v.length > 0) {
                    if (v == 'NULL') {
                        result += `${fieldName} is null`
                    }
                    else if (v == 'NOT NULL') {
                        result += `${fieldName} is not null`
                    }
                    else {
                        let vFrom = helpers.dateParse(v[0]);
                        let vTo = helpers.dateParse(v[v.length == 1 ? 0 : 1]);

                        if (v.length == 1) {
                            vFrom = helpers.dateWithoutTime(vFrom);
                            vTo = vFrom;
                            vTo.setDate(vTo.getDate() + 1);
                        }

                        if (!vFrom && vTo) result += `${fieldName} < $${this.addNamedParam(params, vTo)}`;
                        else if (vFrom && !vTo) result += `${fieldName} >= $${this.addNamedParam(params, vFrom)}`;
                        else if (vFrom && vTo) result += `${fieldName} >= $${this.addNamedParam(params, vFrom)} and ${fieldName} < $${this.addNamedParam(params, vTo)}`;
                    }
                }
            }
        }, this);
        if (result.trim() != '') return `(${result})`;
        return result;
    }
    /**
     * Фильтр bool. Формирует условия отбора для полей с типом boolean. Всегда проверяется
     * точное равенство. 
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_bool(paramName, fieldName, values, params) {
        let result = "";
        values = SQLConnection.valuesToArray(values);
        values.forEach(v => {
            if (v != undefined) {
                if (result != '') result += " or ";
                result += `${fieldName} = $${this.addNamedParam(params, v)}`;
            }
        }, this);
        if (result.trim() != '') return `(${result})`;
        return result;
    }
    _filter_operation(paramName, fieldName, values, params, operation) {
        let result = "";
        values = SQLConnection.valuesToArray(values);
        values.forEach(v => {
            if (v != '' && v != undefined) {
                if (result != '') result += " or ";
                result += `${fieldName} ${operation} $${this.addNamedParam(params, v)}`;
            }
        }, this);
        if (result.trim() != '') return `(${result})`;
        return result;
    }

    /**
     * Фильтр eq. Формирует условия отбора для полей по условию равно (=). 
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_eq(paramName, fieldName, values, params) { return this._filter_operation(paramName, fieldName, values, params, '='); }
    /**
     * Фильтр ne. Формирует условия отбора для полей по условию не равно (!=). 
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_ne(paramName, fieldName, values, params) { return this._filter_operation(paramName, fieldName, values, params, '!='); }
    /**
     * Фильтр gt. Формирует условия отбора для полей по условию больше ">". 
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_gt(paramName, fieldName, values, params) { return this._filter_operation(paramName, fieldName, values, params, '>'); }
    /**
     * Фильтр lt. Формирует условия отбора для полей по условию меньше(<). 
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_lt(paramName, fieldName, values, params) { return this._filter_operation(paramName, fieldName, values, params, '<'); }
    /**
     * Фильтр ge. Формирует условия отбора для полей по условию больше или равно(>=). 
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_ge(paramName, fieldName, values, params) { return this._filter_operation(paramName, fieldName, values, params, '>='); }
    /**
     * Фильтр le. Формирует условия отбора для полей по условию меньше или равно(<=). 
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_le(paramName, fieldName, values, params) { return this._filter_operation(paramName, fieldName, values, params, '<='); }

    /**
     * Фильтр текущий пользователь. Формирует условия отбора для полей содержащих id пользователя. 
     * В качестве значение всегда подствляется id текущего пользователя. 
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_curUser() {
        let result = "";
        if (values.length == 1) {
            for (let i in values) {
                if (values[i] == '1') return `${fieldName} = ${this.edm.user.id}`;
                else if (values[i] == '2') return `${fieldName} != ${this.edm.user.id}`;
            }
        }
        if (result.trim() != '') return `(${result})`;
        return result;
    }
    /**
     * Фильтр "как есть". Услове формируется из того что задано в фильтре.
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_asis(paramName, fieldName, values, params) {
        let result = '';
        if (values) result = fieldName;
        return result;
    }
    /**
     * Фильтр interval. Формирует условия отбора для интервала значений. В качестве параметра может задаваться
     * либо массив из двух числовых значений, либо строку разделенною символом ~, которая преобразуется в два значения. 
     * Первое значение задает нижнюю границу, второе верхнюю. Если одно из значений не задано, 
     * то соответствующая граница не проверяется.
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_interval(paramName, fieldName, values, params) {
        let result = "";
        values = SQLConnection.valuesToArray(values);
        values.forEach(v => {
            if (v) {
                if (result != '') result += " or ";
                if (typeof v == 'string') v = v.split('~');
                if (!Array.isArray(v)) v = [v];
                if (v.length > 0) {
                    if (v == 'NULL') {
                        result += `${fieldName} is null`
                    }
                    else if (v == 'NOT NULL') {
                        result += `${fieldName} is not null`
                    }
                    else {
                        let vFrom = +(v[0]);
                        let vTo = +(v[v.length == 1 ? 0 : 1]);

                        if (v.length == 1) {
                            vTo = vFrom;
                        }

                        if (!vFrom && vTo) result += `${fieldName} < $${this.addNamedParam(params, vTo)}`;
                        else if (vFrom && !vTo) result += `${fieldName} >= $${this.addNamedParam(params, vFrom)}`;
                        else if (vFrom && vTo) result += `${fieldName} >= $${this.addNamedParam(params, vFrom)} and ${fieldName} < $${this.addNamedParam(params, vTo)}`;
                    }
                }
            }
        }, this);
        if (result.trim() != '') return `(${result})`;
        return result;
    }
    /**
     * Фильтр для формирования правил сортировки. Правило сортировкм формируется из имени поля и модификатор
     * "asc" или "desc", которые передаются в параметрах.
     * Именованные параметры "накапливаются" в переданном списке именнованных параметров. 
     * Если переданы пустые значения то условия не формируются.
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {string} paramName имя параметрв
     * @param {string} fieldName имя поля
     * @param {any} values массив значений
     * @param {any} params список именованных параметров
     * @returns {string} сформированное условие
     */
    filter_order(paramName, fieldName, values, params) {
        let result = "";
        if (values == 'asc' || values === true) {
            result += ` ${fieldName} `;
        }
        if (values == 'desc') {
            result += ` ${fieldName} desc `;
        }
        if (result.trim() != '') return `${result}`;
        return result;
    }
    filter_vfield(paramName, fieldName, values, params) {
        let result = "";
        if (values) {
            result += ` (${fieldName}) as "${paramName}" `
        }
        return result;
    }

    async selectRefs(undefinedRefs) {
        let result = false;
        if (undefinedRefs) {
            for (let name in undefinedRefs) {
                let idList = undefinedRefs[name];
                if (idList && idList.length > 0) {
                    result = true;
                    await this.selectObj(name, `select * from ${this.getTableName(name)} where id in (${this.getIdList(undefinedRefs[name], name)})`);
                }
            }
        }
        return result;
    }
    getIdList(idList) {
        let s = '';
        idList.forEach(id => {
            if (s) s += ',';
            if (typeof id == 'object') s += id.id;
            else s += id;
        });
        return s;
    }

    /**
     * Переустановливает значение следующего id, которое будет выделяться для заданного класса.
     * @param {any} obj имя класса или EDMObj
     */
    async resetIdSequence(obj) {
        let def = this.edm.getModelDef(obj, ['table']);
        await this.query(`select setval('${def._mname}.${def._name.toLowerCase()}_id_seq',coalesce(max(id),1)) from "${def._mname}"."${def._name}" where id>0`, undefined, true);
    }
    /**
     * Возвращает значение следующего id, которое будет выделяться для заданного класса.
     * @param {any} obj имя класса или EDMObj
     * @returns {any} id
     */
    async nextId(obj) {
        let def = this.edm.getModelDef(obj, ['table']);
        let id = await this.query(`select nextval('${def._mname}.${def._name.toLowerCase()}_id_seq')`, undefined, true);
        return +id;
    }

    /**
     * Возвращает "правильное" имя таблицы как это принято для текущей базы данных по заданному классу или EDMObj. 
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {any} obj имя класса или EDMObj
     * @returns {string} имя таблицы
     */
    getTableName(obj) {
        let def = this.edm.getModelDef(obj, ['table']);
        if (def) return `"${def._mname}"."${def._name}"`;
        return `"${obj}"`;
    }

    getParamDef(name, cname, params, value) {
        let def = this.edm.getModelDef(name);
        if (def._def_) def = def._def_;
        let col = (typeof (cname) == 'string') ? def._childs[cname] : cname;
        if (!col || col._mtype != 'field') throw new Error(`Описатель параметра ${cname} для ${def._name} не найден`);
        params.push(this.getNullValue(col, value));
        return `$${params.length}::${this.getTypeString(col, true)}`;
    }
    getNullValue(fdef, value) {
        if (typeof (value) != 'undefined' && value !== '') return value;
        if (typeof (fdef._ptype) == 'undefined' || fdef._ptype == 'id' || fdef._ptype == 'props') {
            switch (fdef._type) {
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
        else if (fdef._ptype == 'ref') {
            let refDef = this.edm.getModelDef(fdef._type);
            if (!refDef) throw new Error(`POSTGRESQL. Определение типа данных. Ссылка ${fdef._type} не найдена`);
            let refIdColumn = refDef._childs['id'];
            if (!refIdColumn) throw new Error(`POSTGRESQL. Определение типа данных. Поле id для ${fdef._type} не найдено`);
            value = this.getNullValue(refIdColumn, true, value);
        }
        else if (fdef._ptype == 'reflist') {
            value = null;
        }
        else {
            throw new Error(`POSTGRESQL. Определение типа данных. Тип поля ${fdef._pype} не найден`);
        }
        return value;
    }

    /**
     * По описателю поля строку с типом данных как это принято в текущей базе
     * Внимание!!! Метод не должен вызываться напряму, а должен быть переопределен во всех классах потомках.
     * @param {object} fdef 
     * @returns {string} тип данных
     */
    getTypeString(fdef) {
        let r = '';
        if (typeof (fdef._ptype) == 'undefined' || fdef._ptype == 'id' || fdef._ptype == 'props') {
            if (!fdef._type) return '';
            switch (fdef._type) {
                case 'string':
                    {
                        if (fdef._len) r = `VARCHAR(${fdef._len})`;
                        else r = `TEXT`;
                        break;
                    }
                case 'int':
                    {
                        //if (column._ptype == 'id' && !refMode) r = 'SERIAL'
                        //else
                        r = `INTEGER`;
                        break;
                    }
                case 'long':
                    {
                        //if (column._ptype == 'id' && !refMode) r = 'BIGSERIAL'
                        //else
                        r = `BIGINT`;
                        break;
                    }
                case 'byte':
                case 'short':
                    {
                        //if (column._ptype == 'id' && !refMode) r = 'SMALLSERIAL'
                        //else
                        r = `SMALLINT`;
                        break;
                    }
                case 'float':
                    {
                        r = `REAL`;
                        break;
                    }
                case 'double':
                    {
                        r = `DOUBLE PRECISION`;
                        break;
                    }
                case 'decimal':
                    {
                        r = `DECIMAL(${fdef._len},${fdef._dec})`;
                        break;
                    }
                case 'money':
                    {
                        r = `MONEY`;
                        break;
                    }
                case 'date':
                    {
                        r = `DATE`;
                        break;
                    }
                case 'datetime':
                    {
                        r = `TIMESTAMP WITHOUT TIME ZONE`;
                        break;
                    }
                case 'time':
                    {
                        r = `TIME`;
                        break;
                    }
                case 'interval':
                    {
                        r = `INTERVAL`;
                        break;
                    }
                case 'bool':
                    {
                        r = `BOOLEAN`;
                        break;
                    }
                case 'guid':
                    {
                        r = `UUID`;
                        break;
                    }
                case 'json':
                    {
                        r = `JSON`;
                        break;
                    }
                case 'jsonb':
                    {
                        r = `JSONB`;
                        break;
                    }
                default: {
                    throw new Error(`DATA TYPE ${fdef._type} NOT FOUND`);
                }

            }
            if (fdef._array) r += '[]';
        }
        else if (fdef._ptype == 'ref') {
            let refDef = this.edm.getModelDef(fdef._type);
            if (!refDef) throw new Error(`POSTGRESQL. Определение типа данных. Ссылка ${fdef._type} не найдена`);
            let refIdColumn = refDef._childs['id'];
            if (!refIdColumn) throw new Error(`POSTGRESQL. Определение типа данных. Поле id для ${fdef._type} не найдено`);
            r = this.getTypeString(refIdColumn, true);
        }
        else if (fdef._ptype == 'reflist') {
            let refDef = this.edm.getModelDef(fdef._type);
            if (!refDef) throw new Error(`POSTGRESQL. Определение типа данных. Ссылка ${fdef._type} не найдена`);
            let refIdColumn = refDef._childs['id'];
            if (!refIdColumn) throw new Error(`POSTGRESQL. Определение типа данных. Поле id для ${fdef._type} не найдено`);
            if (refDef._mtype != 'cfg') throw new Error(`POSTGRESQL. Определение типа данных. Для reflist возможна ссылка только на конфигурацию (${fdef._type})`);
            r = `VARCHAR(1024)`;
        }
        else if (fdef._ptype == 'complex') {
            let mdef = this.edm.getModelDef(fdef._type, ['type'])
            r = `"${mdef._mname}"."${fdef._type}"`;
            if (fdef._array) r += '[]';
        }
        else {
            throw new Error(`POSTGRESQL. Определение типа данных. Тип поля ${fdef._ptype} не найден`);
        }
        if (!r) {
            throw new Error(`POSTGRESQL. Не удалось определить тип данных (${JSON.stringify(fdef, this.func.jsonReplacer)})`);
        }
        return r;
    }

    // /**
    //  * LOG
    //  */
    // async logAddJob(type) {
    //     let data = await this.insertObj('sysJob', { type: type, owner: this.edm.user.id, startTime: (new Date()) });
    //     return data.shift();
    // }
    // /**
    //  * Возвращает строку задания для формирования прогресс индикаторов. 
    //  * MaxMessId используется для обновления прочитанных строк sysLog
    //  * 
    //  * @param {*} jobid 
    //  */
    // async logGetJob(jobid) {
    //     let data = await this.selectObj('sysJob', `select j.* from [sysJob] j  where j.id=$id`, { id: jobid }, undefined, true);
    //     data = data.shift();
    //     if (data) {
    //         data.errors = await this.query(`select count(distinct l.id) from [sysLog] l left join [sysLogMess] m on l.id=m.log where l.job=$id and  (l.type = 'error' or  m.type = 'error')`, { id: jobid });
    //         data.warnings = await this.query(`select distinct count(l.id) from [sysLog] l left join [sysLogMess] m on l.id=m.log where l.job=$id and  (l.type = 'warning' or  m.type = 'warning')`, { id: jobid });
    //     }
    //     return data;
    // }
    // async logStartJob(jobid, startTime) {
    //     let data = await this.updateObj('sysJob', { id: jobid, startTime: startTime || (new Date()) }, undefined, true);
    //     return data.shift();
    // }
    // async logEndJob(jobid, endTime) {
    //     let data = await this.updateObj('sysJob', { id: jobid, endTime: endTime || (new Date()) }, undefined, true);
    //     return data.shift();
    // }
    // async logCancelJob(jobid) {
    //     let data = await this.updateObj('sysJob', { id: jobid, cancel: true }, undefined, true);
    //     return data.shift();
    // }
    // async logState(jobid, state) {
    //     let data = await this.updateObj('sysJob', { id: jobid, state: state }, undefined, true);
    //     return data.shift();
    // }
    // async logTotal(jobid, total) {
    //     let data = await this.updateObj('sysJob', { id: jobid, total: total }, undefined, true);
    //     return data.shift();
    // }
    // async logProgress(jobid, progress = 1) {
    //     let data = await this.selectObj('sysJob', 'update [sysJob] set progress=progress+$progress where id=$id returning *', { id: jobid, progress: progress }, undefined, true);
    //     return data.shift();
    // }
    // async logAdd(jobid, type, text) {
    //     let data = await this.insertObj('sysLog', { job: jobid, type: type, text: text }, undefined, true);
    //     return data.shift();
    // }
    // async logAddMess(logid, type, text) {
    //     let data = await this.insertObj('sysLogMess', { log: logid, type: type, text: text }, undefined, true);
    //     return data.shift();
    // }
    // /**
    //  * Возвращает все строки sysLog для задания. 
    //  * @param {*} jobid - id задагия
    //  * @param {*} lastid - последний прочитанный id используется для дочитки
    //  */
    // async logSelect(params) {
    //     params.job = params.job || params.jobid;
    //     let data = await this.selectObj('sysLog',
    //         `select $pref()$ l.*, sum(case when m.type='error' then 1 else 0 end) as errors, sum(case when m.type='warning' then 1 else 0 end) as warnings from [sysLog] l left join [sysLogMess] m on l.id=m.log
    //             where 1=1
    //             and ($like(text->l.text)$ or $like(text->m.text)$)
    //             and ($in(type->l.type)$ or $in(type->m.type)$)
    //             and $job=job 
    //             group by l.id
    //             order by l.id
    //             $suff()$`,
    //         params);
    //     return data;
    // }
    // async logSelectMess(logid) {
    //     let data = await this.selectObj('sysLogMess', `select * from [sysLogMess] where log=$logid and type!='ref' order by id`, { logid: logid }, undefined, true);
    //     return data;
    // }
    // async logSelectRef(logid) {
    //     let data = await this.selectObj('sysLogMess', `select * from [sysLogMess] where log=$logid and type='ref' order by id`, { logid: logid }, undefined, true);
    //     return data;
    // }

    // // getErrorMessage(e) {
    // //     return e.message;
    // // }
}

/*
class SQLLogger {
    constructor(client) {
        this.client = client;
    }
    async log(user, type, text) {
        try {
            await this.client.query(`insert into [sysLogger] ("user", "type", "text") values($1, $2, $3)`, [user, type, text]);
        }
        catch (e) {
            console.debug(text);
        }
    }
}
*/


/**
 * Соединение(контроллер) базы данных
 * @module proto
 */
module.exports = {
    /** Класс {@link SQLConnection} */
    SQLConnection: SQLConnection
    //SQLLogger: SQLLogger
};