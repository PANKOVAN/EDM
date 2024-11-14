
'use strict'

const path = require('path');
const fs = require("fs");
const fsp = fs.promises;
const pathLib = require("path");
const bcrypt = require('bcrypt');
const uuid = require('uuid');
const buffer = require('buffer');
const { promises } = require('dns');


/**
 * Класс ServerHelpers содержит разные статические методы для работы на стороне серевера
 */
class ServerHelpers {
    /**
     * Добавляет новые настройки к существующим. Настроки с одинаковыми именами перекрывают старые.
     * @param {object} settings
     */
    static setSettings(settings) {
        this.settings = this.merge(settings || {}, this.settings || {});
        return this;
    }
    /**
     * Возвращает текущие настройки. Считывание настроек из папки проекта происходит только один раз. 
     * Папку проекта задавать имеет смысл только при первом вызове.
     * @param {dirname} - папка проекта
     */
    static getSettings(dirname) {
        if (!dirname && !this.settings) throw new Error('Папка проекта не задана')
        if (!this.settings) {
            for (let fn of this.getPrjFiles(/\.settings\.js$/i, dirname).sort((a, b) => {
                let sa = path.basename(a);
                let sb = path.basename(b);
                if (sa > sb) return 1;
                if (sb > sa) return -1;
                return 0;
            })) {
                let body = fs.readFileSync(fn, { encoding: 'utf8' });
                (new Function('settings', body))(function (o) {
                    this.setSettings(o);
                }.bind(this));

            }

        }
        return this.settings || {};
    }
    static merge(objFrom, objTo) {
        for (let name in objFrom) {
            let val = objFrom[name];
            if (typeof val == 'object' && val != null) {
                if (Array.isArray(val)) {
                    objTo[name] = val;
                }
                else {
                    if (!objTo[name]) objTo[name] = {};
                    this.merge(val, objTo[name]);
                }
            }
            else if (val == null || val == undefined) {
                if (objTo[name]) delete objTo[name];
            }
            else {
                objTo[name] = val;
            }
        }
        return objTo;
    }
    /**
     * Возвращает хеш код для пароля
     * @param {string} password - строка пароля
     * @returns {string}
     */
    static getPassCode(password) {
        return bcrypt.hashSync(password, 7);
    }
    /**
     * Проверяет соответствует ли пароль хеш коду
     * @param {string} password - пароль
     * @param {number} passcode - хеш код
     * @returns {boolean}
     */
    static testPassCode(password, passcode) {
        return bcrypt.compareSync(password, passcode);
    }
    /**
     * Возвращает GUID
     * @returns {string}
     */
    static getUUID() {
        return uuid();
    }
    /**
     * Подготавливает параметры переданные с клиента. Пытается привести строковые значения к числам
     * @param {object} req
     * @returns {obj}
     */
    static prepareParams(req) {
        let result = {};
        let params = req.query || {};
        let body = req.body;
        //let cookies = req.cookies;
        //let currentUser = req.user;

        for (let n in body) {
            let v = body[n];
            try {
                if (!isNaN(v) && v != '') result[n] = +v;
                else if (v == 'true' || v == 'True') result[n] = true;
                else if (v == 'false' || v == 'False') result[n] = false;
                else result[n] = JSON.parse(v);
            }
            catch (err) {
                result[n] = v;
            }
        }

        for (let n in params) {
            let v = params[n];
            try {
                if (!isNaN(v) && v != '') result[n] = +v;
                else if (v == 'true' || v == 'True') result[n] = true;
                else if (v == 'false' || v == 'False') result[n] = false;
                else result[n] = JSON.parse(v);
            }
            catch (err) {
                result[n] = v;
            }
        }
        // Разбор masterid
        if (result.masterid) {
            let a = params.masterid.split(':');
            if (a.length == 2) {
                result._mastertype = a[0];
                result._masterid = a[1];
            }
        }
        // Разбор parentId
        if (result.parentId) {
            let a = result.parentId.split(':');
            if (a.length == 2) {
                result._parenttype = a[0];
                result._parentid = a[1];
            }
        }

        // files
        if (req.files) {
            for (let n in req.files) {
                result[n] = req.files[n];
            }
        }
        return result;
    }
    /*
     * Подготовливает json для передачи на клиент. Используется для передачи на клиент макрокоманд.
     * Обходит json и преобразует встреченные функции к объектам {function: 'function() {...}'}
     * Кроме этого производится проверка прав(маркеров) доступа. Проверка производится если
     * имя или значение узла соответствует одному из шаблонов:
     *  ?имя узла/маркера/тип?
     *  ?имя узла/тип?
     *  ?имя узла?
     * Ключевым признаком в данном случае явлется наличие начального и концевого символа '?'.
     * Если маркер не задан, то он считается равным имени(имени узла), если тип достуа не задан,
     * то он считается равны А (Application).
     * Проверка производится функцией edm.testAccess(). Если для узла проверка прав прошла неудачно,
     * то этот узел не формируется, если упешно, то формируеится узел с именем равным имени узла.
     *
     * @param {obj} json
     */
    //TODO Следует убрать функционал наследованный от макросов

    /**
     * Подготавливает JSON для передачи на клиент
     * @param {object} source 
     * @param {EDMData} edm 
     * @param {boolean} idMode вместо вложенных EDMObj возврашать их id
     * @returns {object}
     */
    static prepareJson(source, edm, idMode) {
        //console.debug(source);
        if (Array.isArray(source)) {
            let target = [];
            for (let i in source) {
                let val = source[i];
                if (val && typeof (val) == 'object') {
                    if (idMode && val.isEDMObj) target.push(val.id);
                    else target.push(this.prepareJson(val, edm, idMode));
                }
                else {
                    target.push(val);
                }
            }
            return target;
        }
        else if (source && typeof (source) == 'object') {
            let target = {};
            // Встретили EDMObj
            if (source.isEDMObj) {
                target._type = source._type;
                for (let n in source._def_._childs) {
                    let fdef = source._def_._childs[n];
                    if (fdef._mtype == 'field') {
                        let v = source[n];
                        if (v != undefined && v != null) {
                            if (v.isEDMObj) target[n] = v.id;
                            else if (Array.isArray(v)) target[n] = this.prepareJson(v, edm, true);
                            else if (typeof v == 'function') target[n] = { function: v.toString() };
                            else target[n] = v;
                        }
                    }
                    else if (fdef._mtype == 'method') {
                        let v = source[n];
                        // Метод переопределен
                        if (source[n] && source.__proto__[n] && source[n] != source.__proto__[n]) {
                            target[n] = source[n].toString();
                        }
                    }
                }
            }
            // Другой объект
            else {
                let descriptors = Object.getOwnPropertyDescriptors(source);
                for (let name in descriptors) {
                    let descriptor = descriptors[name];
                    if (typeof (name) != 'string' || (!(name.startsWith('_') && name.endsWith('_')))) {
                        // свойство
                        if (descriptor.get || descriptor.set) {
                            target[name] = {
                                getter: (descriptor.get) ? descriptor.get.toString() : undefined,
                                setter: (descriptor.set) ? descriptor.set.toString() : undefined
                            };
                        }
                        else if (descriptor.value && typeof (descriptor.value) == 'function') {
                            target[name] = { function: descriptor.value.toString() };
                        }
                        else if (descriptor.value && typeof (descriptor.value) == 'object') {
                            if (name.startsWith('?') && name.endsWith('?')) {
                                let p = this._prepareGetTemplate(name);
                                let f = false;
                                if (edm) f = edm.testAccess(undefined, p.marker, p.type, false);
                                if (f) {
                                    target[p.name] = this.prepareJson(descriptor.value, edm);
                                }
                            }
                            else {
                                target[name] = this.prepareJson(descriptor.value, edm);
                            }
                        }
                        else {
                            let value = descriptor.value;
                            if (typeof (value) == 'string' && value.startsWith('?') && value.endsWith('?')) {
                                let p = this._prepareGetTemplate(value);
                                value = false;
                                if (edm) value = edm.testAccess(undefined, p.marker, p.type, false);
                            }
                            if (name.startsWith('?') && name.endsWith('?')) {
                                let p = this._prepareGetTemplate(name);
                                let f = false;
                                if (edm) f = edm.testAccess(undefined, p.marker, p.type, false);
                                if (f) {
                                    target[p.name] = value;
                                }
                            }
                            else {
                                target[name] = value;
                            }
                        }
                    }
                }
            }
            return target;
        }
        else if (typeof (source == 'function')) {
            return { function: source.toString() };
        }
        return source;
    }

    static _prepareGetTemplate(name) {
        let p = {};
        let t = name.substring(1, name.length - 2).split('/');
        if (t.length == 1) {
            p.name = t[0];
            p.marker = p.name;
            p.type = 'A';
        }
        else if (t.length == 2) {
            p.name = t[0];
            p.marker = p.name;
            p.type = t[1].toUpperCase();
        }
        else {
            p.name = t[0];
            p.marker = t[1];
            p.type = t[2].toUpperCase();
        }
        return p;
    }
    /**
     * Преобразует JSON в XML
     * @param {*} json
     */
    static prepareXML(json, cfgMode, f) {
        let xml = '';
        if (json) {
            if (json.getDate) json = '';
            if (typeof json == 'object' && json.isEDMObj && json._def_._mtype == 'cfg' && !cfgMode) json = '';
            if (Array.isArray(json) /* && !ServerHelpers._isStringArray(json)*/) {
                if (!f) xml += `<root>`;
                for (let i = 0; i < json.length; i++) {
                    let node = json[i];
                    let nodeName = ServerHelpers.str2Xml(node._type || 'row');
                    xml += `<${nodeName}${ServerHelpers._prepareAttr(node, cfgMode)}>${this.prepareXML(node, cfgMode, true)}</${nodeName}>`;
                }
                if (!f) xml += `</root>`;
            }
            else if (typeof json == 'object') {
                let t1 = '';
                if (!f) {
                    let a = ServerHelpers._prepareAttr(json, cfgMode);
                    t1 = ServerHelpers.str2Xml(json._type || '_');
                    xml += `<${t1} ${a}>`;
                }
                let values = json;
                if (json.isEDMObj) values = json._values_;
        /*if (!ServerHelpers._isStringArray(values))*/ {
                    for (let n in values) {
                        let value = json[n];
                        if (!(typeof value == 'object' && value.isEDMObj && value._def_._mtype == 'cfg' && !cfgMode) &&
                            !(typeof value == 'object' && value.isEDMObj && value._def_._mtype == 'table' && !value.id)
                        ) {
                            let v = this.prepareXML(value, cfgMode, true);
                            let a1 = ServerHelpers._prepareAttr(value, cfgMode);
                            let n1 = ServerHelpers.str2Xml(n);
                            if (v) {
                                xml += `<${n1}${a1}>${v}</${n1}>`;
                            }
                            else if (a1) {
                                xml += `<${n1}${a1}/>`;
                            }
                        }
                    }
                }
                if (!f) xml += `</${t1}>`;
            }
            else {
                xml = ServerHelpers.str2Xml(json);
            }
        }
        return xml;
    }
    static _prepareAttr(json, cfgMode) {
        let xml = '';
        if (!Array.isArray(json) && typeof (json) == 'object' && !json.getDate) {
            let values = json;
            if (json.isEDMObj) {
                xml += ` _type="${ServerHelpers.str2XmlAttr(json._type)}"`;
                values = json._values_;
                for (let n in json) {
                    if (!n.startsWith('_')) {
                        let v = json[n];
                        let t = typeof v;
                        if (v && t != 'object' && t != 'function') {
                            values[n] = v;
                        }
                    }
                }
            }
            for (let n in values) {
                let v = json[n];
                if (v) {
                    if (ServerHelpers._isStringArray(v)) v = ServerHelpers._getStringArray(v);
                    else if (v.getDate) v = v.toLocaleString();
                    if (typeof v != 'object' && typeof v != 'function') {
                        xml += ` ${n}="${ServerHelpers.str2XmlAttr(v)}"`;
                    }
                    else if (typeof v == 'object' && v.isEDMObj && v._def_._mtype == 'cfg' && v.id) {
                        xml += ` ${n}="${ServerHelpers.str2XmlAttr(v.id)}"`;
                    }
                }
            }
        }
        return xml;
    }
    /**
      * заменяет спецсиволы в строке для корректного размещения в XML
      * @param {string} str 
      */
    static str2Xml(str) {
        str = (str || '').toString();
        return str.replace(/\&/g, '&amp;')
            .replace(/\"/g, '&quot;')
            .replace(/\'/g, '&apos;')
            .replace(/\</g, '&lt;')
            .replace(/\>/g, '&gt;');
    }
    /**
     * заменяет спецсиволы в строке для корректного размещения в атрибуте XML
     * @param {string} str 
     */
    static str2XmlAttr(str) {
        return ServerHelpers.str2Xml(str)
            .replace(/\n/g, '&#xA;')
            .replace(/\r/g, '&#xD;')
            .replace(/\t/g, '&#x9;');
    }
    static _isStringArray(v) {
        let f = Array.isArray(v);
        if (f) v.forEach(element => {
            let t = typeof element;
            f = f && (t != 'object' && t != 'function') || typeof element.getDate == 'function';
        });
        return f;
    }
    static _getStringArray(v) {
        let r = "";
        v.forEach(element => {
            if (r) r += ',';
            if (element.getDate) r += element.toLocaleString();
            else r += element.toString();
        });
        return r;
    }

    static prepareSimpleJson(json, level = 0, maxlevel = 1) {
        let r;
        if (json == null) json = undefined;
        if (level > 100) {
            return r;
        }
        if (json && json.isEDMObj && level > maxlevel) {
            json = json.id;
        }
        if (Array.isArray(json)) {
            r = [];
            json.forEach(obj => {
                if (typeof obj != 'function') {
                    r.push(this.prepareSimpleJson(obj, level, maxlevel))
                }
            }, this);
        }
        else if (typeof json == 'object') {
            r = {};
            if (json.isEDMObj) {
                for (let n in json._values_) {
                    if (!(n.startsWith('_') && n.endsWith('_'))) {
                        let obj = json[n];
                        if (typeof obj != 'function') {
                            r[n] = this.prepareSimpleJson(obj, level + 1, maxlevel);
                        }
                    }
                }
            }
            {
                for (let n in json) {
                    if (!(n.startsWith('_') && n.endsWith('_'))) {
                        let obj = json[n];
                        if (typeof obj != 'function') {
                            r[n] = this.prepareSimpleJson(obj, level + 1, maxlevel);
                        }
                    }
                }
            }
        }
        else {
            r = json;
        }
        return r;
    }


    /*
     * Обходит и подготавливает данные для передачи на клиент.
     * @param {any} source
     */
    /*
    prepareData: function (source) {
        if (Array.isArray(source)) {
            let target = [];
            for (let i in source) {
                let val = source[i];
                if (val && typeof (val) == 'object') {
                    target.push(this.prepare(val));
                }
                else {
                    target.push(val);
                }
            }
            return target;
        }
        else if (source && typeof (source) == 'object') {
            let target = {};
            // Встретили EDMObj
            if (source.isEDMObj) {
                target._type = source._type;
                for (let n in source._def_._childs) {
                    let fdef = source._def_._childs[n];
                    if (fdef._mtype == 'field') {
                        target[n] = source[n];
                    }
                }
            }
            // Другой объект
            else {
                let descriptors = Object.getOwnPropertyDescriptors(source);
                for (let name in descriptors) {
                    let descriptor = descriptors[name];
                    if (typeof (name) != 'string' || (!(name.startsWith('_') && name.endsWith('_')))) {
                        // свойство
                        if (descriptor.get || descriptor.set) {
                            target[name] = {
                                getter: (descriptor.get) ? descriptor.get.toString() : undefined,
                                setter: (descriptor.set) ? descriptor.set.toString() : undefined
                            };
                        }
                        else if (descriptor.value && typeof (descriptor.value) == 'function') {
                            target[name] = { function: descriptor.value.toString() };
                        }
                        else if (descriptor.value && typeof (descriptor.value) == 'object') {
                            target[name] = this.prepare(descriptor.value);
                        }
                        else {
                            target[name] = descriptor.value;
                        }
                    }
                }
            }
            return target;
        }
        else if (typeof (source == 'function')) {
            return { function: source.toString() };
        }
        return undefined;
    },
    */

    /*
     * Используется для фильтрации JSON уходящего на клиент. Не пропуска.тся свойст начинающиеся и заканчивающиеся символом '_'.
     * @param {string} key
     * @param {string} value
     */
    static jsonReplacer(key, value) {
        if (key.startsWith('_') && key.endsWith('_')) value = undefined;
        return value;
    }
    /**
     * Формирует JSON содержащий информацию об ошибке для отправки на клиент
     * @param {string} message
     * @param {obj} exception
     * @param {obj} req
     * @returns {obj}
     */
    static errorJson(message, exception, req) {
        let user = '';
        if (req.user) user = req.user.login || '';
        console.error(exception);

        if (typeof exception == 'object') return {
            _error: message,
            message: exception.message,
            severity: exception.severety,
            stack: exception.stack
        };
        if (typeof exception == 'string') return {
            _error: exception,
        };
        return { _error: message };
    }
    /*
     * Превращает строку вила <name 1>="<value 1>"...<name n>="<value n>" в объект
     * @param {*} s 
     */
    /*
    getAttrs: function (s, nameToLower = false) {
        s = s || '';
        let result = {};
        let matches = s.matchAll(/(\w+)="([^"]+)"/g);
        for (let match of matches) {
            let n = match[1];
            if (nameToLower) n = n.toLowerCase();
            result[n] = match[2];
        }
        return result;
    },
    getAttrsWithoutBrackets: function (s, nameToLower = false) {
        s = s || '';
        let result = {};
        if (s) {
            s.substring(s.indexOf('?') + 1).split('&').forEach(a => {
                let i = a.indexOf('=');
                let n = a;
                let v = true;
                if (i >= 0) {
                    n = a.substring(0, i);
                    v = a.substring(i + 1);
                }
                if (nameToLower) n = n.toLowerCase();
                result[n] = v;
            });
        }
        return result;
    },
    */

    static copy(source, target) {
        if (target == undefined) target = {};
        if (typeof (source) == 'object' && typeof (target) == 'object') {
            for (let n in source) {
                target[n] = source[n];
            }
        }
        return target;
    }
    static safeJson(val, level = 0) {
        if (level > 4) return undefined;

        if (Array.isArray(val)) {
            let copy = [];
            for (let v of val) {
                v = this.safeJson(v, level + 1);
                if (v != undefined) copy.push(v);
            }
            return copy;
        }
        else if (typeof val == 'object' && val && !val.getYear) {
            let copy = {};
            for (let n of Object.getOwnPropertyNames(val)) {
                if (!n.startsWith('_') && typeof val != 'function') {
                    let v = this.safeJson(val[n], level + 1);
                    if (v != undefined) copy[n] = v;
                }
            }
            return copy;
        }
        else if (typeof val == 'function') {
            return undefined;
        }
        return val;
    }

    /**
     * Начитывает список файлов проекта, удоалетворяющих маске. Файлы отсортированы по алфавиту, но первыми
     * идут файлы начинаюшиеся на edm или лежащие в папках начинающихся на edm. Это позволяет файлам проекта 
     * (например макрокоманда) переопредеять стандартные
     * @param {*} mask - регулярное выражение
     * @param {*} dirname - путь (не обязательно)
     * @param {*} files - список файлов (не обязательно)
     * @returns {array}
     */
    static getPrjFiles(mask, dirname, exclude, files) {

        // Первый уровень
        if (!files) {
            files = [];
            this.getPrjFiles(mask, __dirname, exclude, files);
            if (dirname) this.getPrjFiles(mask, dirname, exclude, files);
            return files;
        }
        else {
            fs.readdirSync(dirname, { withFileTypes: true })
                .sort((fa, fb) => {
                    let a = fa.name.toLowerCase();
                    let b = fb.name.toLowerCase();
                    let r = (a.startsWith('edm') ? 0 : 1) - (b.startsWith('edm') ? 0 : 1);
                    if (r == 0) {
                        if (a < b) r = -1;
                        else if (a > b) r = 1;
                    }
                    return r;
                })
                .forEach(fn => {
                    if (fn.isDirectory() || fn.isSymbolicLink()) {
                        if (!fn.name.startsWith('.')) {
                            if (!exclude || !fn.name.search(exclude))
                                this.getPrjFiles(mask, pathLib.join(dirname, fn.name), exclude, files);
                        }
                    }
                    else if (fn.isFile()) {
                        if (fn.name.search(mask) >= 0) {
                            files.push(pathLib.join(dirname, fn.name));
                        }
                    }
                });
        }
    }

    //TODO Кешировать модули

    /**
     * Находит модуль в проекте по имени 
     * @param {string} name имя модуля
     * @param {string} dirname папка проекта
     * @returns {any}
     */
    static getModule(name, dirname) {
        let files = this.getPrjFiles(name, dirname);
        if (!files.length) throw new Error(`Модуль ${name} не найден`);
        if (files.length > 1) throw new Error(`По имени ${name} найдено несколько модулей`);
        let m = require(files[0]);
        return m;
    }

    /*
        testNotUndefined(value, mess) {
            let f = (value !== undefined && value !== null);
            if (mess && !f) throw mess;
            return f;
        },
        */
    /*
     * Возвращает nickname для заданной строки
     * @param {*} name
     * @param {*} len
     */
    /*
    nick: function (name, len = 2) {
        if (typeof name != 'string') name = "???";
        if (name.length < 3) name += '???';
        if (len == 1) return name[0].toUpperCase();
        else if (len == 2) return name[0].toUpperCase() + name[1].toLowerCase();
        else return name[0].toUpperCase() + name[1].toLowerCase() + name[2].toLowerCase();
    },
    */
    /*
    softString: function (s, keepSpace) {
        if (typeof s == 'object') s = s._value_;
        s = (s || '').toString();
        s = s.toUpperCase(s);
        s = s.replace(/У/g, 'Y');
        s = s.replace(/К/g, 'K');
        s = s.replace(/Е/g, 'E');
        s = s.replace(/Н/g, 'H');
        s = s.replace(/Х/g, 'X');
        s = s.replace(/В/g, 'B');
        s = s.replace(/А/g, 'A');
        s = s.replace(/Р/g, 'P');
        s = s.replace(/О/g, 'O');
        s = s.replace(/С/g, 'C');
        s = s.replace(/М/g, 'M');
        s = s.replace(/Т/g, 'T');
        s = s.replace(/,/g, '.');
        if (!keepSpace) s = s.replace(/\s+/g, ' ');
        return s;
    },
    */
    /*
     * Работа с консолью
     */
    //TODO ликвидировать консоль
    // console: {
    //     isTrace: false,
    //     isFileTrace: false,
    //     _logger: false,
    //     /**
    //      * Подготовка фалов лога
    //      */
    //     async prepareConsole() {
    //         try {
    //             if (this.isFileTrace && !this._logger) {
    //                 let pg = require("./postgresql");
    //                 this._logger = await pg.getLogger();
    //             }
    //             this.server('Запуск сервера', 'SYSTEM');
    //         }
    //         catch (e) {
    //             console.error(`| SYSTEM | error | ${e.message} |`);
    //         }
    //     },
    //     /**
    //      * console.log
    //      * @param {string} mess - текст сообщения,
    //      * @param {string} type - тип сообщения,
    //      * @param {string} user - логин пользователя
    //      */
    //     async log(user, type, mess, isTrace = false) {
    //         try {
    //             if (!isTrace || this.isTrace) {
    //                 mess = mess || '';
    //                 type = type || '';
    //                 user = user || '';
    //                 // if (this._logger) {
    //                 //     await this._logger.log(user, type, mess);
    //                 // }
    //                 // else {
    //                 switch (type) {
    //                     case "debug": {
    //                         console.debug(`| ${user} | ${type} | ${mess} |`);
    //                         break;
    //                     }
    //                     case "error": {
    //                         console.error(`| ${user} | ${type} | ${mess} |`);
    //                         break;
    //                     }
    //                     case "warning": {
    //                         console.warn(`| ${user} | ${type} | ${mess} |`);
    //                         break;
    //                     }
    //                     case "info": {
    //                         console.info(`| ${user} | ${type} | ${mess} |`);
    //                         break;
    //                     }
    //                     default: {
    //                         console.debug(`| ${user} | ${type} | ${mess} |`);
    //                     }
    //                 }
    //                 //}
    //             }
    //         }
    //         catch (e) {
    //             console.error(`| SYSTEM | error | ${e.message} |`);
    //         }
    //     },
    //     /*
    //      * Сообщение для отладки
    //      * @param {string} mess - текст сообщения
    //      * @param {string} user - логин пользователя
    //      */
    //     debug: function (mess, user) {
    //         this.log(user, 'debug', mess);
    //     },
    //     /**
    //      * Информационное сообщение
    //      * @param {string} mess  - текст сообщения
    //      */
    //     info: function (mess, user) {
    //         this.log(user, 'info', mess);
    //     },
    //     /**
    //      * Предупреждение
    //      * @param {string} mess  - текст сообщения
    //      */
    //     warning: function (mess, user) {
    //         this.log(user, 'warning', mess);
    //     },
    //     /**
    //      * Ошибка
    //      * @param {string} mess  - текст сообщения
    //      */
    //     error: function (mess, user) {
    //         if (typeof mess == 'object') {
    //             let e = mess;
    //             mess = e.message;
    //             if (e.stack) mess += '\n\n' + e.stack;
    //         }
    //         this.log(user, 'error', mess);
    //     },
    //     /**
    //      * серверные сообщения
    //      * @param {string} mess - текст сообщения.
    //      */
    //     server: async function (mess) {
    //         this.log('SYSTEM', 'server', mess);
    //     },
    //     /**
    //      * Хранилище
    //      * @param {string} mess
    //      */
    //     store: function (mess, user) {
    //         this.log(user, 'store', mess, true);
    //     },
    //     /**
    //      * БД
    //      * @param {string} mess
    //      */
    //     sql: function (mess, user) {
    //         this.log(user, 'sql', mess, true);
    //     },
    //     /**
    //      * HTTP
    //      * @param {string} mess
    //      */
    //     http: async function (mess, user) {
    //         this.log(user, 'http', mess, true);
    //     },
    // },

    /*
    ljoin: function () {
        if (arguments.length == 1) return pathLib.join(arguments[0]).replace(/\\/g, '/');
        if (arguments.length == 2) return pathLib.join(arguments[0], arguments[1]).replace(/\\/g, '/');
        if (arguments.length == 3) return pathLib.join(arguments[0], arguments[1], arguments[3]).replace(/\\/g, '/');
        if (arguments.length == 4) return pathLib.join(arguments[0], arguments[1], arguments[3], arguments[4]).replace(/\\/g, '/');
        throw "func.ljoin - максимальное количество параметров - 4";
    },
    */

    /**
     * Возвращает объект как строку, если не пусто, то добавляется преффикс и суффикс 
     * @param {any} obj 
     * @param {string} preffix 
     * @param {string} suffix 
     * @returns {string}
     */
    static objToString(obj, preffix = '', suffix = '') {
        if (obj == undefined) return '';
        else if (obj.self) return preffix + obj.self.toString() + suffix;
        else if (obj.getYear) return preffix + obj.toLocaleDateString('ru-ru') + suffix;
        else if (obj) return preffix + obj.toString() + suffix;
        return '';
    }

    /*
    fspStat: async function (path) {
        let stat = null;
        try {
            stat = await fsp.stat(path);
        }
        catch {
        }
        return stat;
    },
    fspIsDirectory: async function (path) {
        let stat = await this.fspStat(path);
        return stat && stat.isDirectory();
    },
    fspIsFile: async function (path) {
        let stat = await this.fspStat(path);
        return stat && stat.isFile();
    },
    fspCP: async function (fromPath, toPath) {
        let stat = await this.fspStat(fromPath);
        if (!stat) throw `Не найден путь ${fromPath}`;
        if (stat.isDirectory()) {
            let statTo = await this.fspStat(toPath);
            if (statTo && statTo.isFile()) {
                await fsp.rm(toPath);
                statTo = null;
            }
            if (!statTo) {
                await fsp.mkdir(toPath, { recursive: true })
            }
            let lst = (await fsp.readdir(fromPath)) || [];
            for (let name of lst) {
                if (name == '.' || name == '..') continue;
                await this.fspCP(pathLib.join(fromPath, name), pathLib.join(toPath, name));
            }
        }
        if (stat.isFile()) {
            let toDir = pathLib.dirname(toPath);
            let statTo = await this.fspStat(toDir);
            if (statTo && statTo.isFile()) {
                await fsp.rm(toDir);
                statTo = null;
            }
            if (statTo && !statTo.isDirectory()) {
                await fsp.mkdir(toDir, { recursive: true })
            }
            let fromFile = await fsp.open(fromPath, 'r');
            let toFile = await fsp.open(toPath, 'w');
            try {
                const buf = buffer.Buffer.alloc(4100);
                while (true) {
                    let obj = await fromFile.read(buf, 0, 4096);
                    if (!obj.bytesRead) break;
                    await toFile.write(buf, 0, obj.bytesRead);
                }
            }
            finally {
                if (fromFile) fromFile.close();
                if (toFile) toFile.close();
            }
        }
    },
*/

    /**
     * Очищает дату от времени
     * @param {Date} date 
     * @returns {Date}
     */
    static dateWithoutTime(date) {
        if (!date) return date;
        let result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return result;
    }
    /**
     * Возвращает дату с добавленными временными значениями
     * @param {date} date 
     * @param {int|object} количество дней или объект 
     * @param {int} [m=0] количество месяцев
     * @param {int} [y=0] количество лет
     * @param {int} [h=0] количество часов
     * @param {int} [mm=0] количество минут
     * @param {int} [s=0] количество секунд
     * @param {int} [ms=0] количество милисекунд
     * @type {date}
     * @returns = date + y + m + d + h + mm + s + ms
     */
    static dateAdd(date, d = 0, m = 0, y = 0, h = 0, mm = 0, s = 0, ms = 0) {
        if (!date) return date;
        if (typeof d === 'object' && d !== null && !Array.isArray(d)) {
            ms = d.millisecond || 0;
            s = d.second || 0;
            mm = d.minute || 0;
            h = d.hour || 0;
            y = d.year || 0;
            m = d.month || 0;
            d = d.day || 0;
        }
        ms = ms || 0;
        s = s || 0;
        mm = mm || 0;
        h = h || 0;
        y = y || 0;
        m = m || 0;
        d = d || 0;
        let result = new Date(date);
        if (y) result = new Date(result.setFullYear(result.getFullYear() + y));
        if (m) result = new Date(result.setMonth(result.getMonth() + m));
        if (d) result = new Date(result.setDate(result.getDate() + d));
        if (h) result = new Date(result.setHours(result.getHours() + h));
        if (mm) result = new Date(result.setMinutes(result.getMinutes() + mm));
        if (s) result = new Date(result.setSeconds(result.getSeconds() + s));
        if (ms) result = new Date(result.setMilliseconds(result.getMilliseconds() + ms));
        return result;
    }

    /**
     * Преобразовывает дату в строку вида YYYYMMDD
     * @param {Date} date дата
     * @param {boolean} withTime добавить время
     * @param {string} separator разделитель
     * @returns {string}
     */
    static dateToYYYYMMDD(date, withTime = false, separator = '') {
        let t = date.getFullYear()
            + separator + (date.getMonth() + 1).toString().padStart(2, '0')
            + separator + date.getDate().toString().padStart(2, '0');
        if (withTime) t = t
            + separator + date.getHours().toString().padStart(2, 0)
            + separator + date.getMinutes().toString().padStart(2, 0)
            + separator + date.getSeconds().toString().padStart(2, 0);
        //+ separator + date.getMilliseconds().toString().padStart(3, 0);
        return t;
    }
    /**
     * Преобразовывает дату в строку вида YYYYDDMM
     * @param {Date} date дата
     * @param {boolean} withTime добавить время
     * @param {string} separator разделитель
     * @returns {string}
     */
    static dateToYYYYDDMM(date, withTime = false, separator = '') {
        let t = date.getFullYear()
            + separator + date.getDate().toString().padStart(2, '0')
            + separator + (date.getMonth() + 1).toString().padStart(2, '0');
        if (withTime) t = t
            + separator + date.getHours().toString().padStart(2, 0)
            + separator + date.getMinutes().toString().padStart(2, 0)
            + separator + date.getSeconds().toString().padStart(2, 0);
        //+  separator + date.getMilliseconds().toString().padStart(3, 0);
        return t;
    }
    /**
     * Преобразовывает дату в строку вида YYYY-MM-DD HH:MM:SS.MS
     * @param {Date} date дата
     * @param {boolean} withTime добавить время
     * @param {string} separator разделитель
     * @returns {string}
     */
    static dateToYYYY_MM_DD(date, withTime = false) {
        let t = date.getFullYear() + '-' + (date.getMonth() + 1).toString().padStart(2, '0') + '-' + date.getDate().toString().padStart(2, '0');
        if (withTime) t += ' ' + date.getHours().toString().padStart(2, 0) + ':' + date.getMinutes().toString().padStart(2, 0) + ':' + date.getSeconds().toString().padStart(2, 0) + '.' + date.getMilliseconds().toString().padStart(3, 0);
        return t;
    }
    /**
     * Преобразовывает дату в строку "для драйвера базы данных"
     * @param {Date} date дата
     * @param {boolean} withTime добавить время
     * @param {string} separator разделитель
     * @returns {string}
     */
    dateToDbString(date) {
        date = date || (new Date());
        return JSON.stringify(date).replaceAll('"', '');
    }
    static dateParseRegex1 = /(\d\d)\.(\d\d)\.(\d\d\d?\d?)\s+(\d\d):(\d\d):(\d\d)/;
    static dateParseRegex2 = /(\d\d\d?\d?)-(\d\d)-(\d\d)\s+(\d\d):(\d\d):(\d\d)/;
    static dateParseRegex3 = /(\d\d\d\d)(\d\d)(\d\d)/;

    /**
     * Преобразует то что передали в дату
     * @param {any} date 
     * @returns {Date}
     */
    static dateParse(date) {
        if ((typeof date == 'number' || (typeof date == 'string' && !isNaN(date))) && date.toString().length == 4) {
            date = new Date(parseInt(date, 0, 1));
            return date;
        }
        else if (typeof date == 'string') {
            let date1 = undefined;
            let m = date.match(this.dateParseRegex1);
            if (m) {
                let y = +m[3];
                if (m < 100) {
                    if (m > 60) y += 1900;
                    else y += 2000;
                }
                date = new Date(y, +m[2] - 1, +m[1], +m[4], +m[5], +m[6]);
            }
            else {
                let m = date.match(this.dateParseRegex3);
                if (m) {
                    date = new Date(+m[1], +m[2] - 1, +m[3]);
                }
                else {
                    date1 = new Date(date);
                    if (date1 && date1.toString() != 'Invalid Date') date = date1;
                    else date = undefined;
                }
            }
            return date;
        }
        else if (date?.getYear) {
            return date;
        }
        return undefined;
    }
    /**
     * Возвращает максимальную дату из двух
     * @param {Date} d1 
     * @param {Date} d2 
     * @returns {Date}
     */
    static dateMax(d1, d2) {
        if (d1 && d2) {
            if (d2 > d1) return d2;
            return (d1);
        }
        else if (d1) return d1;
        else if (d2) return d2;
        return undefined;
    }
    /**
     * Ждет заданное количество милисекунд
     * @param {number} ms 
     * @returns {promises}
     */
    static delay(ms) {
        return new Promise((resolve, reject) => {
            setTimeout(resolve, ms);
        });
    }

    static normTime(t) {
        t = (t || '').toString().trim();
        let stime = t.split(':');

        let hour = stime[0];
        let buf = parseInt(hour);
        if (isNaN(buf)) hour = 0;
        else hour = buf;
        if (hour < 0 || hour >= 24) hour = "00";
        else if (hour < 10) hour = "0" + hour;

        let minute = stime[1] || '00';
        buf = parseInt(minute);
        if (isNaN(buf)) minute = 0;
        else minute = buf;
        if (minute < 0 || minute >= 60) minute = "00";
        else if (minute < 10) minute = "0" + minute;

        let result = hour + ":" + minute;
        return result;
    }



    /**
     * Возвращает разницу между датами в милисекундах
     * @param {Date} date1 
     * @param {Date} date2 
     * @returns {number}
     */
    static duration(date1, date2) {
        date1 = date1 || new Date();
        date2 = date2 || new Date();
        return this.dateParse(date2).getTime() - this.dateParse(date1).getTime();
    }

    /**
     * Разницу в милисекундах преобразует в строку
     * @param {number} duration 
     * @returns {string}
     */
    static durationToString(duration) {
        let ms = duration % 1000;
        let s = Math.floor(duration / 1000) % 60;
        let m = Math.floor(duration / 1000 / 60) % 60;
        let h = Math.floor(duration / 1000 / 60 / 60);
        return `${h.toString().padStart(2, 0)}:${m.toString().padStart(2, 0)}:${s.toString().padStart(2, 0)}.${ms.toString().padStart(3, 0)}`
    }

    /*
    objVal(obj, path, def = '') {
        if (!obj) return def;
        for (let name of path.split('.')) {
            obj = obj[name];
            if (obj == undefined) return def;
        }
        return obj;
    },
    objHtml(obj, path, def = '') {
        return this.toHtml(this.objVal(obj, path, def));
    },
    toHtml(val) {
        if (val == undefined) return '';
        return val.toString().replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', "'");
    }
    */

    /**
     * Возвращает корневую папку библиотеки EDM
     */
    static getEDMFolder() {
        return path.join(__dirname, '../');
    }
}

module.exports = ServerHelpers;

