'use strict'

const utils = require('./utils');
const helpers = require('./helpers');
const client = require('./client');
const model = require('./model');

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;


const edm = {
    models: model.models,
    classes: model.classes,
    cfg: model.cfg,
    helpers: helpers,
    utils: utils
}


/**
 * Класс EDMObj является прототипом всех объектом модели данных EDM.
 */
class EDMObj {

    /**
     * Класс объекта
     *
     * @type {string}
     */
    _type = undefined;


    /**
     * Описатель класса из модели
     *
     * @type {object}
     */
    _def_ = undefined;


    /**
     * Владелец. EDMData в которой был создан EDMObj
     *
     * @type {EDMData}
     */
    _edm_ = undefined;


    /**
     * значения свойст объекта
     *
     * @type {object}
     */
    _values_ = undefined;



    /**
     * Для всех EDMObj возвращает true
     *
     * @readonly
     * @type {boolean}
     */
    get isEDMObj() {
        return true;
    }

    _init(_def_, _edm_, values) {
        this._type = _def_._name;
        this._def_ = _def_;
        this._edm_ = _edm_;
        this._values_ = {};
        this.setValues(values);
    }

    _getDefault(name) {
        let fdef = this._def_._childs[name];
        return /*fdef._default ||*/ fdef._typedefault;
    }
    _getValue(name) {
        let v = this._values_[name];
        if (typeof (v) == 'undefined' || v == null) return this._getDefault(name);
        return v;
    }
    _getJsonValue(name) {
        let value = this._getValue(name);
        if (typeof value == 'string') {
            try {
                value = JSON.parse(value);
                this._setValue(name, value);
            }
            catch {
            }
        }
        return value;
    }
    _setValue(name, value) {
        let t = this._def_._childs[name]._type;
        if (t == 'date' || t == 'datetime') {
            if (typeof value == 'string') {
                value = Date.parse(value);
            }
            if (typeof value == 'number') {
                let d = new Date();
                d.setTime(value);
                value = d;
            }
        }
        else if (t == 'int' || t == 'long' || t == 'short' || t == 'byte') {
            if (typeof value == 'string') {
                value = parseInt(value);
            }
        }
        else if (t == 'float' || t == 'decimal' || t == 'money') {
            if (typeof value == 'string') {
                value = parseFloat(value);
            }
        }
        else if (t == 'bool') {
            if (typeof value == 'string') value = (value == '1' || value.toLowerCase() == 'true');
            else value = !!(value ?? false);
        }
        if (this._edm_) this._edm_.addUpdates(this, name, value);
        this._values_[name] = value;
    }
    _setJsonValue(name, value) {
        this._setValue(name, value);
    }
    _getRefValue(name, rname, type, mtype) {
        let id = this._values_[name];
        if (mtype == 'cfg') return this._edm_.getObj(type, id);
        else return this._edm_.getObj(type, id);
    }
    _getRefId(name, rname, type, mtype) {
        return this._values_[name];
    }
    _getObjValue(type, id) {
        return this._edm_.getObj(type, id);
    }
    _setRefValue(name, rname, type, mtype, value) {
        if (value === undefined || value === null) {
            delete this._values_[name];
        }
        else if (typeof value == 'object') {

            if (mtype == 'cfg') {
                if (!this._edm_.cfg[type]) this._edm_.cfg[type] = {};
                this._edm_.cfg[type][value.id] = this._edm_.newObj(type, value, true);
            }
            else {
                this._edm_.newObj(type, value, false);
            }
            this._setValue(name, value.id);
        }
        else {
            this._setValue(name, value);
        }
    }
    _setRefId(name, rname, type, mtype, value) {
        if (value === undefined || value === null) {
            this._setValue(name, undefined);
        }
        else {
            this._setValue(name, value);
        }
    }
    _getRefListValue(name, rname, type, mtype) {
        let list = [];
        let idList = this._values_[name];
        if (idList) {
            if (typeof idList == 'string') idList = idList.split(',');
            if (Array.isArray(idList)) {
                idList.forEach(id => {
                    if (mtype == 'cfg') list.push(this._edm_.getObj(type, id))
                    else list.push(this._edm_.getObj(type, id))
                });
            }
        }
        return list;
    }
    _setRefListValue(name, rname, type, mtype, value) {
        let idList = [];
        if (Array.isArray(value)) {
            for (let o of value) {
                // Добавить в словарь объект на который ссылка
                if (o != undefined && o != null) {
                    if (typeof o == 'object' && o != null && !o.isEDMObj) {
                        if (mtype == 'cfg') {
                            if (!this._edm_.cfg[type]) this._edm_.cfg[type] = {};
                            this._edm_.cfg[type][id] = this._edm_.newObj(type, o, true);
                        }
                        else {
                            this._edm_.newObj(type, o, false);
                        }
                    }
                    idList.push(o.id || o);
                }
            };
        }
        else if (typeof value == 'string') {
            value.split(',').forEach(id => {
                if (id != "") idList.push(id);
            });
        }
        else if (typeof value == 'object') {
            for (let id in value) {
                // Добавить в словарь объект на который ссылка
                if (typeof value[id] == 'object') {
                    value[id].id = id;
                    if (mtype == 'cfg') {
                        if (!this._edm_.cfg[type]) this._edm_.cfg[type] = {};
                        this._edm_.cfg[type][id] = this._edm_.newObj(type, value[id], true);
                    }
                    else {
                        this._edm_.newObj(type, value[id], false);
                    }
                }
                idList.push(value[id].id || id);
            }
        }
        this._setValue(name, idList);
    }
    _getRefListId(name, rname, type, mtype) {
        return this._values_[name];
    }
    _setRefListId(name, rname, type, mtype, value) {
        if (value === undefined || value === null) {
            this._setValue(name, undefined);
        }
        else {
            this._setValue(name, value);
        }
    }


    /**
     * Устанавливает значения свойст из объекта
     *
     * @param {object} values
     */
    setValues(values) {
        if (typeof values == 'object') {
            for (let n in values) {
                if (this._def_._childs[n] && this._def_._childs[n]._mtype == 'method' && typeof values[n] == 'string') {
                    this[n] = eval('(' + values[n] + ')');
                }
                else {
                    this[n] = values[n];
                }
                //if (this._def_._childs[n]) this[n] = values[n];
                //else this._values_[n] = values[n];
            }
        }
    }
    /**
     * Возвращает значения свойств как простой объект
     * @returns {object}
     */
    getValues() {
        return this._values_ || {};
    }

    isvalidatedef(name) {
        if (name) {
            let fdef = this._def_._childs[name];
            if (fdef) {
                if (fdef._notempty) {
                    let v = (fdef._ptype == 'ref') ? this[name + 'Id'] : this[name];
                    if (v == undefined || v == '' || (v == 0 && fdef._type != 'string')) {
                        return `Значение для "${fdef._label}" не задано!!!`
                    }
                }
            }
        }
        return true;
    }

    /**
     * Возвращает признак объект только для чтения
     * @param {string} name 
     * @returns {boolean}
     */
    isreadonly(name) {
        return false;
    }


    getDefs(defs) {
        let result = [];
        for (let def of defs) {
            if (typeof def == 'string') def = { name: def };
            let _def = this._def_._childs[def.name];
            if (_def) {
                if (_def._mtype == 'field') {
                    result.push({
                        name: def.name,
                        label: def.label || _def._label,
                        type: def.type || _def._type,
                        len: def.len || _def._len,
                        ptype: def.ptype || _def._ptype,
                    });
                }
            }
        }
        return result;
    }
    getPropTypes(defs) {
        let result = [];
        if (this.type && this.type.getPropTypes) {
            result = this.type.getPropTypes();
        }
        return result;
    }
}
/**
 * Класс EDMData. Используется как единый шлюз для доступа к данным. Создается на время обработки
 * клиентского запроса, предполагающего доступ к данным и возврат значений. Содержит список соединений и словарь данных,
 * а также ссылки на список моделей, описателей классов и конфигураций.
 */
class EDMData {

    lessUpdates = 0;

    hasUpdates = false;

    updates = {}

    undo = {}

    static id = 0;

    /**
     * Создает новый экземпляр EDMData
     * @param {*} currentUser
     */
    constructor(currentUser) {
        EDMData.id++;
        this.id = EDMData.id;
        this.models = edm.models;
        this.classes = edm.classes;
        this.connections = [];
        this.cfg = edm.cfg;
        this.helpers = edm.helpers;
        this.utils = edm.utils;

        this.dic = {};

        if (currentUser) this.user = this.newObj('user', currentUser || { id: -100 }, false, true);
        try {
            if (!edm?.isClient) this.store = require('./db/store');
        }
        catch { }
    }



    /**
     * Получает соединение с базой по имени модели или имени класса
     * соединение содержит все методы необходимые для работы с базой
     * @param {string} mname имя модели
     * @param {string} name имя класса 
     * @param {string} accessType тип доступа, если задан то, то с помощью 
     * подсистемы разделения доступа проверяется разрешения на доступ к модели и таблице
     * @param {object} userDbCfg конфигураци для доступа к базе, которая если задана, то перешибает настройки конфигурации
     * @returns {SQLConnection} наследник SQLConnection
     */
    async getConnection(mname, name, accessType, userDbCfg) {
        const settings = helpers.getSettings();
        let dbcfg = {};
        if (mname || name) {
            //name = helpers.pathName(name);
            let model = this.getModel(mname, name);

            if (!accessType || ['R', 'A'].includes(accessType.toUpperCase())) accessType = 'view';
            else if (['U', 'W'].includes(accessType.toUpperCase())) accessType = 'edit';
            this.testAccess([model._name, name, accessType], true);

            let dbname = settings.models[model._mname] || settings.models['*'];
            if (typeof userDbCfg == 'string') dbname = userDbCfg;
            dbcfg = settings.db[dbname];
            if (typeof userDbCfg == 'object') dbcfg = userDbCfg;
        }
        else if (userDbCfg) {
            if (typeof userDbCfg == 'string') dbcfg = settings.db[userDbCfg] || {};
            if (typeof userDbCfg == 'object') dbcfg = userDbCfg;
        }
        else {
            let dbname = settings.models['*'];
            dbcfg = settings.db[dbname] || {};
        }
        if (!dbcfg.require) throw new Error("Не задан драйвер соединения");
        let db = require(`./db/${dbcfg.require}`)
        let connection = await db.getConnection(this, dbcfg);
        this.connections.push(connection);
        //console.error('connections', connection.pool.totalCount, connection.pool.idleCount, connection.pool.waitingCount);
        return connection;
    }
    /**
     * Освобождает занятые ресуры
     */
    async free() {
        for (let n in this.connections) {
            await this.connections[n].free();
        }
        this.dic = {};
        this.connections = [];
    }

    /**
     * Получает модель данных по имени
     * @param {any} mname имя модели или собственно модель
     * @param {any} name имя класса (используется если mname не задана)
     * @param {boolean} exception если true то при ошибке выдается исключение
     * @returns {object} описатель модели
     */
    getModel(mname, name, exception = true) {
        let model = null;
        if (mname) {
            if (typeof (mname) == 'string') model = this.models[mname];
            else if (typeof (mname) == 'object') model = mname;
        }
        else {
            let def = this.getModelDef(name, undefined, false);
            if (def) model = this.models[def._mname];

        }
        if (!model && exception)
            throw `Модель  ${mname ? mname : 'для ' + name} не найдена`;
        return model;
    }

    /**
     * Получает описатель класса по имени
     * @param {any} name имя класс или объект EDMObj или описатель модели
     * @param {Array} mtypes
     * @param {boolean} exception
     * @returns {object} описатель класса
     */
    getModelDef(name, mtypes = ['table', 'cfg'], exception = true) {
        let def = null;
        if (typeof (name) == 'object') def = name._def_ || name;
        else if (typeof (name) == 'string') def = this.classes[name];
        if (def && !mtypes.includes(def._mtype)) def = undefined;
        if (!def && exception)
            throw new Error(`Описатель "${name}" не найден`);
        return def;
    }

    /**
     * Возвращает прототип объекта его классу.
     * @param {string} name класс 
     * @returns {EDMObj}
     */
    getObjProto(type) {
        let def = this.getModelDef(type, ['table', 'cfg']);
        if (def) return def._proto_;
        return undefined;
    }

    clear() {
        this.dic = {};
    }

    /**
     * Создает новый объект EDM по имени класса.
     * @param {string} name наименования
     * @param {object} values значения полей
     * @param {boolean} lessDic без сохранения в EDMData
     * @returns {EDMObj}
     */
    newObj(type, values, lessDic, lessUpdates) {
        if (lessUpdates) this.lessUpdates++;
        let obj = undefined;
        values = values || {};
        try {
            if (lessDic == undefined) lessDic = this.lessDic;
            let def = this.getModelDef(type, ['table', 'cfg']);

            if (def) {
                type = def._name
                if (lessDic || values.id == undefined) {
                    obj = {};
                    obj.__proto__ = def._proto_;
                    obj._init(def, this, values);
                }
                else {
                    let td = this.cfg[type] || this.dic[type];
                    if (!td) {
                        td = {};
                        if (def._mtype == 'cfg') this.cfg[type] = td
                        else this.dic[type] = td;
                    }
                    obj = td[values.id];
                    if (!obj) {
                        obj = {};
                        obj.__proto__ = def._proto_;
                        obj._init(def, this, values);
                        td[values.id] = obj;
                    }
                    else {
                        obj.setValues(values);
                    }
                }
                // Вызвать _init для полей
                for (let n in def._childs) {
                    //if (typeof obj._values_[n] == 'undefined') {
                    let fdef = def._childs[n];
                    if (fdef._mtype == 'field' && typeof fdef._init != 'undefined' && fdef._init != null) {
                        if (typeof fdef._init == 'function') {
                            let v = fdef._init.call(this, obj._values_[n]);
                            if (typeof v != 'undefined') obj[n] = v;
                        }
                        else if (typeof obj._values_[n] == 'undefined') {
                            obj._values_[n] = fdef._init;
                        }
                    }
                    //}
                }
            }
        }
        finally {
            if (lessUpdates) this.lessUpdates--;
        }
        obj.newobj = true;
        return obj;
    }


    /**
     * Сохраняет объект данных в EDMData
     * @param {EDMObj} obj объект данных
     */
    setObj(obj) {
        if (obj) {
            let def = this.getModelDef(obj._type, ['table', 'cfg']);
            let dic = (def._mtype == 'cfg') ? this.cfg : this.dic;
            let td = dic[obj._type];
            if (!td) {
                td = {};
                dic[obj._type] = td;
            }
            td[obj.id] = obj;
        }
    }

    removeObj(obj) {
        if (obj) {
            let td = this.cfg[obj._type] || this.dic[obj._type];
            if (td) {
                delete td[obj.id];
            }
            this.addOperation(obj, 'delete');
        }
    }


    /**
     * Получает объект данных из EDMData по имени класса и id
     * @param {string} type класс объекта
     * @param {any} id его id
     * @returns {EDMObj}
     */
    getObj(type, id) {
        let td = this.cfg[type] || this.dic[type];
        let obj;
        if (td) {
            obj = td[id];
        }
        return obj;
    }

    getObjByAbb(type, abb, def) {
        let td = this.cfg[type];
        this.abb = this.abb || {};
        let ad = this.abb[type];
        if (!ad) {
            ad = this.abb[type] = {};
            for (let id in td) {
                let o = td[id];
                if (o.abb) {
                    let abb = o.abb.toUpperCase();
                    if (ad[abb]) throw new Error(`Дублирование абревиатуры "${abb}" для конфигурации "${type}"`)
                    ad[abb] = o;
                }
            }
        }
        let ref = null;
        if (ad) ref = ad[abb.toUpperCase()];
        if (!ref) ref = td[abb];
        return ref || def;
    }


    /**
     * Проверяет наличие объекта данных в EDMData
     * @param {string} type тип объекта
     * @param {any} id его id
     * @returns {boolean}
     */
    hasObj(type, id) {
        if (!id) return false;
        let td = this.dic[type];
        if (!td) return false;
        let obj = td[id];
        return obj && typeof obj == 'object' && obj._values_ && !obj._values_._new;
    }

    /**
     * Возвращает массив id объектов заданного тип, находящихся в EDMData.
     * @param {string} name класс объекта
     * @param {function name(obj) {
     * @param {EDMObj} объект
     * @returns {boolean}
     * }} callback фильтр 
     * @returns {array}
     */
    getIdList(name, callback) {
        let result = [];
        let td = this.cfg[name] || this.dic[name];
        if (td) {
            for (let id in td) {
                if (!callback || callback(td[id])) {
                    result.push(id);
                }
            }
        }
        return result;
    }

    /**
     * Возвращает массив объектов заданного тип, находящихся в EDMData.
     * @param {string} name класс объекта
     * @param {function name(obj) {
     * @param {EDMObj} объект
     * @returns {boolean}
     * }} callback фильтр 
     * @returns {array}
     */
    getObjList(name, callback) {
        let result = [];
        let td = this.cfg[name] || this.dic[name];
        if (td) {
            for (let id in td) {
                if (!callback || callback(td[id])) result.push(td[id]);
            }
        }
        return result;
    }
    findObj(name, callback) {
        let result = [];
        let td = this.cfg[name] || this.dic[name];
        if (td) {
            for (let id in td) {
                if (callback(td[id])) return td[id];
            }
        }
        return undefined;
    }

    /**
     * Добавляет обработчик, который вызывается после изменения поля любого EDM объекта, находящегося
     * @param {function} func 
     */
    attachOnAfterUpdates(func) {
        this._onAfterUpdates = func;
    }
    detachOnAfterUpdates(func) {
        this._onAfterUpdates = undefined;
    }

    addOperation(obj, operation) {

        if (this.lessUpdates > 0 || obj._def_._mtype == 'cfg') return;

        let type = obj._type;
        let id = obj.id;


        if (!this.updates[type]) this.updates[type] = {};
        let updates = this.updates[type][id];
        if (!updates) this.updates[type][id] = updates = {};
        updates._operation = operation;
        this.hasUpdates = true;

        if (this._onAfterUpdates) {
            this._onAfterUpdates(obj, '_operation', operation);
        }
    }
    addUpdates(obj, name, value) {

        if (this.lessUpdates > 0 || obj._def_._mtype == 'cfg') return;

        let type = obj._type;
        let id = obj.id;

        if (!this.undo[type]) this.undo[type] = {};
        let undo = this.undo[type][id];
        if (!undo) this.undo[type][id] = Object.assign({}, obj._values_);

        if (!this.updates[type]) this.updates[type] = {};
        let updates = this.updates[type][id];
        if (!updates) this.updates[type][id] = updates = {};
        updates[name] = value;
        this.hasUpdates = true;

        if (this._onAfterUpdates) {
            this._onAfterUpdates(obj, name, value);
        }
    }
    clearUpdates() {
        this.updates = {};
        this.undo = {};
        this.hasUpdates = false;
    }

    getUpdates() {
        let updates = [];
        for (let type in this.updates) {
            let typeUpdates = this.updates[type];
            for (let id in typeUpdates) {
                updates.push(Object.assign({ _type: type, id: id }, typeUpdates[id]));
            }
        }
        return updates;
    }

    undoUpdates() {
        for (let type in this.undo) {
            let typeUndo = this.undo[type];
            for (let id in typeUndo) {
                let values = typeUndo[id];
                let obj = this.getObj(type, id);
                if (obj) obj._values_ = values;
            }
        }
        this.clearUpdates();
    }


    /**
     * Возвращает список всех неразрешенных ссылок в объектах EDMData
     * @returns {object}
     */
    getUndefinedRef() {
        let result = {};
        for (let t in this.dic) {
            let typeDic = this.dic[t];
            for (let id in typeDic) {
                let o = typeDic[id];
                o._def_._refs.forEach(r => {
                    if (r.refType == 'table') {
                        if (r.pType == 'ref' && !this.hasObj(r.objType, o._values_[r.refName])) {
                            let l = result[r.objType];
                            let refId = o._values_[r.refName];
                            if (refId) {
                                if (!l) {
                                    l = [];
                                    result[r.objType] = l;
                                }
                                if (!l.includes(refId)) l.push(refId);
                            }
                        }
                        else if (r.pType == 'refList') {
                            let list = o._values_[r.refName];
                            if (list) {
                                list.forEach(refId => {
                                    if (!this.hasObj(r.objType, refId)) {
                                        let l = result[r.objType];
                                        if (refId) {
                                            if (!l) {
                                                l = [];
                                                result[r.objType] = l;
                                            }
                                            if (!l.includes(refId)) l.push(refId);
                                        }
                                    }
                                });
                            }
                        }
                    }
                });
            }
        }
        return result;
    }
    /**
     * Добавляет ссылку в список неразрешенных ссылок
     * @param {string} type - класс объекта
     * @param {string} id - id
     * @param {object} refs - список неразрешенных ссылок
     */
    addUndefinedRef(type, id, refs) {
        if (!refs[type]) refs[type] = [];
        let typerefs = refs[type];
        if (!typerefs.includes(id)) typerefs.push(id);
        return refs;
    }

    /**
     * Подготавлвает данные для передачи на клиент.
     * В словарь добавляются только объекты на которые имеются ссылки(вложенные) объектов data
     * @param {array} data список объектов данных (EDMObj)
     * @returns {obj}
     */
    prepareData(data, params) {
        if (Array.isArray(data)) {
            let _dic = {};
            let _data = [];
            for (let i in data) {
                let _obj = data[i];
                if (_obj) {
                    if (_obj._type) {
                        this._prepareDataRefs(_obj, data, _dic);
                        _obj = this._prepareDataObj(_obj)
                    }
                    _data.push(_obj);
                }
            }
            return { data: _data, dic: _dic, parent: params.parent, total_count: data[0]?.total_count || _data.length };
        }
        else if (typeof data == 'object') {
            let _dic = {};
            let _data = undefined;
            let _obj = data;
            if (_obj) {
                if (_obj._type) {
                    this._prepareDataRefs(_obj, [_obj], _dic);
                    _obj = this._prepareDataObj(_obj)
                }
                _data = _obj;
            }
            return { data: _data, dic: _dic, parent: params.parent, total_count: data[0]?.total_count || _data.length };
        }
        return data;
    }
    _prepareDataRefs(obj, data, dic) {
        if (obj._def_) {
            obj._def_._refs.forEach(r => {
                if (r.refType == 'table') {
                    let v = obj[r.refName];// || this.getObj(r.objType, obj[r.refName]);
                    if (Array.isArray(v)) {
                        v.forEach(v1 => {
                            if (v1 && v1.id) {
                                let typeDic = dic[v1._type];
                                if (!typeDic) {
                                    typeDic = {};
                                    dic[v1._type] = typeDic;
                                }
                                if (!typeDic[v1.id] && !data.includes(v1)) {
                                    typeDic[v1.id] = this._prepareDataObj(v1);
                                    this._prepareDataRefs(v1, data, dic)
                                }
                            }
                        })
                    }
                    else {
                        if (v && v.id) {
                            let typeDic = dic[v._type];
                            if (!typeDic) {
                                typeDic = {};
                                dic[v._type] = typeDic;
                            }
                            if (!typeDic[v.id] && !data.includes(v)) {
                                typeDic[v.id] = this._prepareDataObj(v);
                                this._prepareDataRefs(v, data, dic)
                            }
                        }
                    }
                }
            });
        }
    }
    _prepareDataObj(obj) {
        let _obj = obj._values_ || {};
        _obj._type = obj._type;
        _obj.webix_kids = obj.webix_kids;
        return _obj;
    }
    /**
     * Проверка доступа
     * @param {string} group  групповое имя ресурса 
     * @param {string} name имя ресурса
     * @param {string} type тип резурса
     * @param {boolean} exception создавать исключение при неудаче
     * @returns {boolean}
     */
    testAccess(tokens, exception) {

        let result = undefined;

        if (!Array.isArray(tokens)) tokens = (tokens || '').split('.');
        let stokens = tokens.join('.');


        if (tokens.length < 2) result = false;
        if (!this.user) result = true;
        else if (this.user.login == 'madmin') result = true;

        if (result == undefined) {
            while (tokens.length) {
                result = this.user.tokens[tokens.join('.')];
                if (result == undefined) {
                    tokens.splice(tokens.length - 2, 1);
                }
                else {
                    break;
                }
            }
        }

        if (exception && !result) throw new Error(`Доступ запрещен!!! (${stokens})`);

        return !!result;
    }


    /**
     * Находит в входном потоке данных(объект, массив), которые можно конвертировать в EDMObj и конвертирует их.
     * @param {any} data 
     * @returns {any} то что передали
     */
    parse(data) {
        if (data != undefined && data != null && !data.isEDMObj) {
            if (Array.isArray(data)) {
                for (let i in data) {
                    data[i] = this.parse(data[i]);
                }
            }
            else if (typeof data == 'object') {
                if (data._type) {
                    data = this.newObj(data._type, data, false, true);
                }
                else {
                    for (let n in data) {
                        data[n] = this.parse(data[n]);
                    }
                }

            }
        }

        return data;
    }

    /**
     * Формирует прототип EDM объекта по его описателю. Прототипы объектов хранятся в свойствах _proto своих описателей
     * и используются как прототипы соответствующих объектов данных. Прототипы содержат умолчания для всех свойств, также
     * методы и свойства заданные в описателе.
     * @param {object} def описатель объекта
     * @param {object} classes список классов
     */
    static createProto(def, classes) {
        if (def._mtype == 'table' || def._mtype == 'cfg') {
            def._refs = [];
            let props = {};
            def._proto_ = new EDMObj();
            EDMData._createProto(def._proto_, def, props, classes);
            Object.defineProperties(def._proto_, props);
        }
    }
    static _createProto(proto, def, props, classes) {
        // Создаем свойства по описателям свойст
        for (let n in def._childs) {
            let fdef = def._childs[n];
            if (fdef._mtype == "field" || fdef._mtype == "vfield") {
                props[fdef._name] = {
                    get: new Function(`return this._get${fdef._type.startsWith('json') ? 'Json' : ''}Value('${fdef._name}','${fdef._default}')`),
                    set: new Function('val', `this._set${fdef._type.startsWith('json') ? 'Json' : ''}Value('${fdef._name}', val)`),
                }
                if (fdef._ptype == 'ref') {
                    //let rname = fdef._name.substr(0, fdef._name.length - 2);
                    let refClass = classes[fdef._type];
                    if (refClass) {
                        props[fdef._name] = {
                            get: new Function(`return this._getRefValue('${fdef._name}','${fdef._name}','${refClass._name}','${refClass._mtype}')`),
                            set: new Function('val', `this._setRefValue('${fdef._name}','${fdef._name}','${refClass._name}','${refClass._mtype}',val)`),
                        }
                        props[fdef._name + 'Id'] = {
                            get: new Function(`return this._getRefId('${fdef._name}','${fdef._name}','${refClass._name}','${refClass._mtype}')`),
                            set: new Function('val', `this._setRefId('${fdef._name}','${fdef._name}','${refClass._name}','${refClass._mtype}',val)`),
                        }
                        def._refs.push({ refName: fdef._name, objName: fdef._name, objType: refClass._name, refType: refClass._mtype, pType: 'ref' });
                    } else {
                        throw `Тип не определен. \n Объект:"${def}"\n Свойство: "${fdef._name}"\n Тип: "${fdef._type}`;
                    }
                }
                else if (fdef._ptype == 'reflist') {
                    //let rname = fdef._name.substr(0, fdef._name.length - 4);
                    let refClass = classes[fdef._type];
                    if (refClass) {
                        props[fdef._name] = {
                            get: new Function(`return this._getRefListValue('${fdef._name}','${fdef._name}','${refClass._name}','${refClass._mtype}')`),
                            set: new Function('val', `this._setRefListValue('${fdef._name}','${fdef._name}','${refClass._name}','${refClass._mtype}',val)`),
                        }
                        props[fdef._name + 'Id'] = {
                            get: new Function(`return this._getRefListId('${fdef._name}','${fdef._name}','${refClass._name}','${refClass._mtype}')`),
                            set: new Function('val', `this._setRefListId('${fdef._name}','${fdef._name}','${refClass._name}','${refClass._mtype}',val)`),
                        }
                        def._refs.push({ refName: fdef._name, objName: fdef._name, objType: refClass._name, refType: refClass._mtype, pType: 'refList' });
                    } else {
                        throw `Тип ${fdef._type} не определен.`;
                    }
                }
            }
            else if (fdef._mtype == "method") {
                proto[fdef._name] = EDMData.getFunc(fdef._func);
            }
            else if (fdef._mtype == "property") {
                props[fdef._name] = {};
                if (fdef._getter) props[fdef._name].get = EDMData.getFunc(fdef._getter);
                if (fdef._setter) props[fdef._name].set = EDMData.getFunc(fdef._setter);
                if (fdef._ptype == 'ref') {
                    def._refs.push({ refName: fdef._name, objName: fdef._name, objType: null, refType: fdef._reftype, pType: 'ref' });
                }
            }
        }
        // Проверяем наличие функций в описателях
        for (let n in def._childs) {
            let fdef = def._childs[n];
            if (fdef._mtype != "method" && fdef._mtype != "property") {
                for (let fn in fdef) {
                    if (fdef[fn]?.function) {
                        fdef[fn] = EDMData.getFunc(fdef[fn]);
                    }
                }
            }
        }
    }
    static getFunc(func) {
        if (typeof func == 'object' && func.function) return eval('(' + func.function + ')');
        if (typeof func == "function") return func;
        else if (typeof func == "undefined") return undefined;
        throw '!!!!!!!!!!!!!!!!!!!!';
        return new Function(func);
    }


    //#region Хранилище

    getStoreBasePath() {
        let result = helpers.getSettings()?.store?.path;
        if (!result) throw new Error('Путь к хранилищу не задан');
        return result;
    }
    getStorePath(obj, ...folders) {
        let result;
        if (typeof obj == 'string') {
            if (obj.startsWith('store\\')) obj = obj.substring(6);
            result = obj;
        }
        else {
            let id = obj?.id;
            let type = obj?._type;
            let gid = obj?.gid || obj?.id || '';

            if (!id || !type) throw new Error('Парраметр obj не задан или задан неправильно');

            id = id.toString(32).padStart(8, 0);
            result = type + '/' + id.substr(0, 2) + '/' + id.substr(2, 2) + '/' + id.substr(4, 2) + '/$' + gid.toString();
        }
        for (let folder of folders) {
            result += '/' + folder;
        }
        return result;
    }
    /**
     * Возвращает путь к папке, в которой хранятся все статьи ревизии.
     * Изпользуется для файловой системы.
     * Если заданы дополнительные параметры, то к пути добавляются подпапки
     * @param {object} obj ревизия
     */

    getStoreObjPath(obj, ...folders) {
        let result = this.getStoreBasePath() + '/' + this.getStorePath(obj, ...folders);
        if (result.startsWith('/')) result = result.replaceAll('\\', '/');
        return result;
        //return result.replace(/\\/g, '/').replace('/store//store', '/store').replace('/store/store', '/store');
    }
    /**
     * Возвращает путь к папке, в которой хранятся все статьи ревизии.
     * Изпользуется для url.
     * Если заданы дополнительные параметры, то к пути добавляются подпапки.
     * @param {object} revision ревизия
     */
    getStoreUrlPath(obj, ...folders) {
        let result = 'store' + '/' + this.getStorePath(obj, ...folders);
        return result;

        //return '/' + result.replace(/\\/g, '/').replace(/\#/g, '%23');
    }

    /**
     * Возвращает список файлов ревизии для заданной папки
     * Для каждого файла устанавливает "атрибуты" - массив подстрок имени файла разбитого через точку и переведенного в нижний регистр
     * @param {object} obj ревизия
     */
    async getStroreObjFileList(obj, ...folders) {
        let objPath = this.getStoreObjPath(obj, ...folders);

        let f = (await (fsp.access(objPath).then(() => true).catch(() => false)));
        if (f) {
            let files = await fsp.readdir(objPath, { withFileTypes: true });
            files.forEach(file => {
                file.attrs = file.name.toLowerCase().split('.');
            });
            return files;
        }
        return [];
    }
    /**
     * Возвращает список файлов c полными путями (гкд) ревизии для заданной папки 
     * Для каждого файла устанавливает "аттрибуты" - массив подстрок имени файла разбитого через точку и переведенного в нижний регистр
     * @param {object} obj ревизия
     */
    async getStoreUrlFileList(obj, ...folders) {
        let objPath = this.getStoreObjPath(obj, ...folders);
        let storePath = this.getStoreUrlPath.apply(this, arguments);
        let f = (await (fsp.access(objPath).then(() => true).catch(() => false)));
        if (f) {
            let files = await fsp.readdir(objPath, { withFileTypes: true });
            files.forEach(file => {
                file.attrs = file.name.toLowerCase().split('.');
                file.path = storePath + '/' + file.name;
            });
            return files;
        }
        return [];
    }
    /**
     * Читает заданный файл
     * @param {object} obj ревизия
     */
    async readStoreFile(obj, ...folders) {
        let objPath = this.getStoreObjPath(obj, ...folders);
        let f = (await (fsp.access(objPath).then(() => true).catch(() => false)));
        if (f) return await fsp.readFile(objPath);
        return undefined;
    }
    async saveStoreFile(obj, data, ...folders) {
        let objPath = this.getStoreObjPath(obj, ...folders);
        await this.makeStoreFolder(path.dirname(objPath));
        return await fsp.writeFile(objPath, data);
    }
    async makeStoreFolder(dirName) {
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
    }
    async copyStoreFile(obj, srcFileName, ...folders) {
        let tarFileName = this.getStoreObjPath(obj, ...folders);
        srcFileName = srcFileName.replace(/\\/g, '/');
        await this.makeStoreFolder(path.dirname(tarFileName));
        await fsp.copyFile(srcFileName, tarFileName);
        return tarFileName;
    }
    async removeFolderFromStore(obj, ...folders) {
        let tarFileName = this.getStoreObjPath(obj, ...folders);
        let f = (await (fsp.access(tarFileName).then(() => true).catch(() => false)));
        if (f) {
            await fsp.rm(tarFileName, { recursive: true });
        }
        return tarFileName;
    }
    async removeFileFromStore(obj, ...folders) {
        let tarFileName = this.getStoreObjPath(obj, ...folders);
        let f = (await (fsp.access(tarFileName).then(() => true).catch(() => false)));
        if (f) {
            await fsp.unlink(tarFileName);
        }
        return tarFileName;
    }
    async copyStoryObj(sourceObj, targetObj) {
        await this.copyStoreFolder(this.getStoreObjPath(sourceObj), this.getStoreObjPath(targetObj));
    }
    async copyStoreFolder(source, target, level = 0) {
        let f = (await (fsp.access(target).then(() => true).catch(() => false)));
        if (!f) {
            await this.makeStoreFolder(target);
        }
        if (await (fsp.access(source).then(() => true).catch(() => false))) {
            let files = await fsp.readdir(source, { withFileTypes: true });
            for (let i in files) {
                let file = files[i];
                let sourceFile = path.join(source, file.name);
                let targetFile = path.join(target, file.name);
                if (file.isDirectory()) {
                    if (file.name.toLowerCase() != 'import') {
                        await this.copyStoreFolder(sourceFile, targetFile, level + 1);
                    }
                }
                else {
                    await fsp.copyFile(sourceFile, targetFile);
                }
            }
        }
    }
    refreshModel() {
        for (let k of Object.keys(model.cfg)) delete model.cfg[k];
        for (let k of Object.keys(model.models)) delete model.models[k];
        for (let k of Object.keys(model.classes)) delete model.classes[k];
        model.init();
    }

}


/**
 * Ядро EDM
 * @module edm
 */
module.exports = {

    /** Класс {@link EDMObj} */
    EDMObj: EDMObj,
    /** Класс {@link EDMData} */
    EDMData: EDMData,

    /** список классов */
    classes: model.classes,
    /** список моделей */
    models: model.models,
    /** список конфигураций */
    cfg: model.cfg,
    /** модуль {@link utils} */
    utils: utils,
    /** модуль {@link helpers} */
    helpers: helpers,
    /** модуль {@link client} */
    client: client,

    /**
     * Возвращает объект {EDMData}. 
     *
     * @param {*} currentUser
     * @returns {EDMData}
     */
    getEDMData(currentUser) {
        return new EDMData(currentUser);
    },

    getEDM() {
        return `
            ${EDMObj}
            ${EDMData}
            ${client}
            edm={
                isClient:true, 
                EDMObj:EDMObj,
                EDMData:EDMData,
                helpers:ClientHelpers,
                models:${JSON.stringify(helpers.prepareJson(model.models))},
                classes:${JSON.stringify(helpers.prepareJson(model.classes))},
                cfg:{},
                getEDMData:function(currentUser) {return new EDMData(currentUser)},
                app:${JSON.stringify(helpers.getSettings()?.app)},
            }
            edm.models=edm.helpers.prepareJson(edm.models);
            edm.classes=edm.helpers.prepareClasses(edm.classes);
            edm.cfg=edm.helpers.prepareCfg(${JSON.stringify(helpers.prepareJson(model.cfg))});
        `;
    },


    /**
     * Синхронизирует модель данных. 
     * Модель данных и настройки должны быть начитаны.
     */
    initModel: async function () {
        const settings = helpers.getSettings();
        console.debug(`INIT MODEL START`);
        for (let passing of [1, 2]) {
            for (let n in this.models) {
                let model = this.models[n];
                try {
                    let dbname = settings.models[model._mname] || settings.models['*'];
                    let dbcfg = settings.db[dbname];
                    let db = require(`./db/${dbcfg.require}`)
                    if (db) await db.sync(model, passing);
                }
                catch (e) {
                    console.error(`Ошибки при инициализации модели ${n}: ${e} \n${e.stack}`);
                }
            }
        }


        console.debug(`INIT MODEL END`);
    },


    // getErrorMessage(e, connection = null) {
    //     if (typeof e == 'object' && connection && connection.getErrorMessage) {
    //         e = connection.getErrorMessage(e);
    //     }
    //     let message = e;
    //     if (typeof ((e || {}).message) != 'undefined') message = e.message;
    //     return message;
    // },

    /**
     * Сканирует папку проекта, начитывает настройки и описания модели данных и синхронизирует базу данных.
     * @param {string} dirname 
     */
    sync: async function (dirname = '') {
        // func.getSettings(dirname);
        //  INIT EDM
        helpers.getSettings(dirname)
        require('./model').init(dirname);
        this.initModel(dirname).then(() => {
            require('./model').initTables(dirname).then(() => {
                console.debug("READY!!!.......................................");
            });
        }).catch((err => {
            console.error(err)
        }));
    }

};
