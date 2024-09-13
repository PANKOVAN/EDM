'use strict'

const func = require('./helpers');

/**
 * Прототип всех объектов модели (классы, таблицы, конфигурации)
 * @ignore
 */
class ModelObj {
    /**
     * Конструктор
     * @param {string} name     наименование (id)
     * @param {string} label    название
     * @param {string} base     наименование базового описателя
     * @param {object} params   параметры
     * @param {object} childs   подчиненные описатели (таблицы, свойства)
     */
    constructor(name, label, base, params, childs) {
        this._mtype = "";
        let n = name.split(':');
        this._name = n.pop();
        this._dbtype = n.shift() || '';
        this._label = label;
        this._base = base;
        this._childs = {};
        if (params) {
            for (let n in params) {
                this[n] = params[n];
            }
        }
        if (childs) {
            for (let i in childs) {
                let child = childs[i];
                this._childs[child._name] = child;
                //child._parent_ = this;
            }
        }
    }
    /**
     * Возвращает объект как строку
     * @returns {string}
     */
    toString() {
        return `[${this._name}] ${this._label}`;
    }
}

/**
 * Прототип всех свойств объектов (полей таблицы)
 * @ignore
 */
class ModelProp extends ModelObj {
    /**
       * Конструктор
       * @param {string} name     наименование (id)
       * @param {string} label    название
       * @param {string} base     наименование базового описателя
       * @param {object} params   параметры
       */
    constructor(name, label, type, params, self) {
        super(name, label, null, params, null, self);
        if (type) {
            for (let n in type) {
                this[n] = type[n];
            }
        }
    }
}

/**
 * Модель данных системы. (как правило один описатель на всю систему, соответствует базеданных)
 * @ignore
 */
class Model extends ModelObj {

    /**
     * Конструктор
     * @param {string} name     наименование
     * @param {string} label    название
     * @param {string} base     наименование базового описателя
     * @param {object} params   параметры
     * @param {object} childs   подчиненные описатели (таблицы, свойства)
     */
    constructor(name, label, base, params, childs, self) {
        super(name, label, base, params, childs, self);
        this._mtype = "model";
    }

    /**
     * База ассоциированная с моделью
     */
    get db() {
        let db = func.getSettings()._dbtype_ || this._basetype;
        if (db) {
            if (!this._db_) this._db_ = require(`./${db}`)
            return this._db_;
        }
        return null;
    }

    /**
     * Найти описатель (таблицы, конфигурации и т.д.) по наименованию
     * @param {string} name наименование
     * @param {array} types список типов по умолчанию таблицы и конфигурации
     * @returns {ModelObj}
     */
    findDef(name, mtypes = ['table', 'cfg'], exeption = true) {
        let table = (typeof (name) == 'string') ? this._childs[name] : name;
        if (table && table._def_) table = table._def_;
        if (table && mtypes.indexOf(table._mtype) >= 0) return table;
        if (exeption === true) throw new Error(`Описатель ${name} не найдена в модели данных`);
        return null;
    }
}

/**
 * Базовый описатель. (используется для описание "однотипных" таблиц)
 * @ignore
 */
class Base extends ModelObj {

    /**
     * Конструктор
     * @param {string} name     наименование
     * @param {string} label    название
     * @param {string} base     наименование базового описателя
     * @param {object} params   параметры
     * @param {object} childs   подчиненные описатели (таблицы, свойства)
     */
    constructor(name, label, base, params, childs, self) {
        super(name, label, base, params, childs, self);
        this._mtype = "base";
    }
}

/**
 * Комплексный тип
 * @ignore
 */
class Type extends ModelObj {

    /**
       * Конструктор
       * @param {string} name     наименование
       * @param {string} label    название
       * @param {string} base     наименование базового описателя
       * @param {object} params   параметры
       * @param {object} childs   описатели полей таблицы
       */
    constructor(name, label, base, params, childs, self) {
        super(name, label, base, params, childs, self);
        this._mtype = "type";
    }
}
/**
 * Таблица базы данных
 * @ignore
 */
class Table extends ModelObj {

    /**
       * Конструктор
       * @param {string} name     наименование
       * @param {string} label    название
       * @param {string} base     наименование базового описателя
       * @param {object} params   параметры
       * @param {object} childs   описатели полей таблицы
       */
    constructor(name, label, base, params, childs, self) {
        super(name, label, base, params, childs, self);
        this._mtype = "table";
    }
}

/**
 * Описатель конфигурации
 * @ignore
 */
class Cfg extends ModelObj {
    /**
       * Конструктор
       * @param {string} name     наименование
       * @param {string} label    название
       * @param {string} base     наименование базового описателя
       * @param {object} params   параметры
       * @param {object} childs   описатели полей
       */
    constructor(name, label, base, params, childs, self) {
        super(name, label, base, params, childs, self);
        this._mtype = "cfg";
    }
}

/**
 * Описатель поля базы данных
 * @ignore
 */
class Field extends ModelProp {

    /**
       * Конструктор
       * @param {string} name     наименование
       * @param {string} label    название
       * @param {object} type     описатель типа данных
       * @param {object} params   параметры
       */
    constructor(name, label, type, params, self) {
        super(name, label, type, params, self);
        this._mtype = "field";
    }
}


/**
 * Метод описателя таблицы или конфигурации
 * @ignore
 */
class Method {
    /**
       * Конструктор
       * @param {string} name     наименование
       * @param {func} f       функция
       */
    constructor(name, label, f) {
        let n = name.split(':');
        this._name = n.pop();
        this._dbtype = n.shift() || '';
        this._label = label;
        this._func = f;
        this._mtype = "method";
    }
}

/**
 * Свойство описателя таблицы или конфигурации
 * @ignore
 */
class Property {
    /**
       * Конструктор
       * @param {string} name     наименование
       * @param {func} getter     функция геттер
       * @param {func} setter     функция сеттeр
       */
    constructor(name, label, getter, setter, ptype, reftype) {
        let n = name.split(':');
        this._name = n.pop();
        this._dbtype = n.shift() || '';
        this._label = label;
        this._getter = getter;
        this._setter = setter;
        this._mtype = "property";
        this._ptype = ptype;
        this._reftype = reftype;
    }
}

/**
 * Индекс описателя таблицы
 * @ignore
*/
class Index {
    /**
       * Конструктор
       * @param {string} name     наименование
       * @param {func} unique     признак уникальности (true/false)
       * @param {func} script     выражение для вычисления индекса
       */
    constructor(name, label, unique, script) {
        let n = name.split(':');
        this._name = n.pop();
        this._dbtype = n.shift() || '';
        this._label = label;
        this._unique = unique;
        this._script = script;
        this._mtype = "index";
    }
}

/**
 * Произвольный сценарий SQL
 * @ignore
*/
class Script {
    /**
       * Конструктор
       * @param {string} name     наименование
       * @param {func} script     выражение для вычисления индекса
       */
    constructor(name, label, type, script) {
        let n = name.split(':');
        this._name = n.pop();
        this._dbtype = n.shift() || '';
        this._label = label;
        this._stype = type;
        this._script = script;
        this._mtype = "script";
    }
}

/**
 * Описатель фильтра источника данных
 * @ignore
 */
class Filter {
    constructor(name, label, filters, asis, params) {
        this._name = name;
        this._label = label;
        this._filters = filters;
        this._asis = asis;
        this._mtype = "filter";
        if (params) {
            for (let n in params) {
                this[n] = params[n];
            }
        }
    }
}

/**
 * Описатель для сортировки
 * @ignore
 */
class Order {
    constructor(name, label, filters, asis, params) {
        this._name = name;
        this._label = label;
        this._filters = filters;
        this._asis = asis;
        this._mtype = "order";
        if (params) {
            for (let n in params) {
                this[n] = params[n];
            }
        }
    }
}

/**
 * Методы, которые используюися непосредственно для формировани модели по описателю
 * @namespace modelMethods
 */
const modelMethods = {
    /**
     * Сформировать описатель модели
     * @param {string} name наименование
     * @param {string} label название
     * @param {string} base наименование базовой модели
     * @param {object} params параметры
     * @param {object} childs список таблиц
     */
    scheme: function (name, label, base, params, childs) {
        let model = new Model(name, label, base, params, childs, this);
        if (model) {
            let prevModel = this.models[model._name] || {};
            if (model._name) {
                this.models[model._name] = model;
                model._version = model._version || prevModel._version;
                for (let m in this.models) {
                    let model = this.models[m];
                    for (let d in model._childs) {
                        let def = model._childs[d];
                        def._mname = model._name;
                        let c = this.classes[def._name]
                        if (c) {
                            for (let fId in def._childs) {
                                c._childs[fId] = def._childs[fId];
                            }
                        }
                        else {
                            this.classes[def._name] = def;
                        }
                    }
                    delete model._childs;
                }
            }
        }

    },

    /**
     * Сформировать базовый описатель
     * @param {string} name наименование
     * @param {string} label название
     * @param {string} base наименование базового описателя
     * @param {object} params параметры
     * @param {object} childs список полей
     */
    base: function (name, label, base, params, childs) {
        return new Base(name, label, base, params, childs, this);
    },

    /**
     * Сформировать описатель комплексного типа
     * @param {string} name наименование
     * @param {string} label название
     * @param {string} base наименование базового описателя
     * @param {object} params параметры
     * @param {object} childs список полей
     */
    type: function (name, label, base, params, childs) {
        return new Type(name, label, base, params, childs, this);
    },
    /**
     * Сформировать описатель таблицы
     * @param {string} name наименование
     * @param {string} label название
     * @param {string} base наименование базового описателя
     * @param {object} params параметры
     * @param {object} childs список полей
     */
    table: function (name, label, base, params, childs) {
        return new Table(name, label, base, params, childs, this);
    },

    /**
     * Сформировать описатель конфигурации
     * @param {string} name наименование
     * @param {string} label название
     * @param {string} base наименование базового описателя
     * @param {object} params параметры
     * @param {object} childs список полей
     */
    cfg: function (name, label, base, params, childs) {
        return new Cfg(name, label, base, params, childs, this);
    },

    /**
     * Сформировать описатель поля
     * @param {string} name наименование
     * @param {string} label название
     * @param {string} type описатель типа данных
     * @param {object} params параметры
     */
    field: function (name, label, type, params) {
        params = params || {};
        if (['ref', 'date', 'datetime'].includes(type._ptype) && type._notnull && params._notempty == undefined) params._notempty = true;
        return new Field(name, label, type, params, this);
    },
    /**
     * storage - хранилище
     */
    storage: function (_init = null) {
        return { _ptype: "storage", _type: "string", _default: "", _init: _init };
    },

    /**
     * Метод
     * @param {string} name наименование
     * @param {func|string} f функция
     */
    method: function (name, label, f) {
        return new Method(name, label, f);
    },

    /**
     * Свойство
     * @param {*} name наименование
     * @param {*} getter геттер
     * @param {*} setter сеттер
     */
    property: function (name, label, getter = null, setter = null) {
        return new Property(name, label, getter, setter);
    },
    /**
     * Индекс
     * @param {*} name наименование
     * @param {*} unique признак уникальности
     * @param {*} script значение индекса
     */
    index: function (name, label, unique, script) {
        return new Index(name, label, unique, script);
    },
    /**
     * Сценарий SQL
     * @param {*} name наименование
     * @param {*} script сценарий
     */
    script: function (name, label, type, script) {
        return new Script(name, label, type, script);
    },
    /**
     * Свойство (ссылка)
     * @param {*} name наименование
     * @param {*} getter геттер
     * @param {*} setter сеттер
     */
    refproperty: function (name, label, getter = null, setter = null) {
        return new Property(name, label, getter, setter, 'ref', 'table');
    },
    filter: function (name, label, filters, asis, params) {
        return new Filter(name, label, filters, asis, params, this);
    },
    order: function (name, label, filters, asis, params) {
        return new Order(name, label, filters, asis, params, this);
    },
    vfield: function (name, label, type, filters, asis, params) {
        //return new VField(name, label, order, asis, params, this);
        params = params || {};
        params._filters = filters;
        params._asis = asis;
        params.virtual = true;
        return new Field(name, label, type, params, this);
    },



    /**
     * Методы для формирования описателей типов данных
     */

    /**
     * Id - уникальный идентификатор таблицы
     */
    id: function (type, autoincrement = true) {
        type._ptype = 'id';
        type._notnull = true;
        type._autoincrement_ = autoincrement;
        return type;
    },

    /**
     * GUID глобальный уникальный идентификатор
     */
    guid: function (_notnull = false, _default = null, _init = null) {
        return { _type: "guid", _default: _default, _notnull: _notnull, _init: _init };
    },

    /**
     * int - целое
     */
    int: function (_notnull = true, _default = null, _init = null) {
        return { _type: "int", _typedefault: 0, _default: _default, _notnull: _notnull, _init: _init };
    },

    /**
     * long - длинное целое
     */
    long: function (_notnull = true, _default = null, _init = null) {
        return { _type: "long", _typedefault: 0, _default: _default, _notnull: _notnull, _init: _init };
    },

    /**
     * short - короткое целое
     */
    short: function (_notnull = true, _default = null, _init = null) {
        return { _type: "short", _typedefault: 0, _default: _default, _notnull: _notnull, _init: _init };
    },

    /**
     * byte - байт
     */
    byte: function (_notnull = true, _default = null, _init = null) {
        return { _type: "byte", _typedefault: 0, _default: _default, _notnull: _notnull, _init: _init };
    },

    /**
     * string - строка
     */
    string: function (_len = 0, _notnull = true, _default = null, _init = null) {
        return { _type: "string", _len: _len, _typedefault: "", _default: _default, _notnull: _notnull, _init: _init };
    },

    /**
     * real - с плаваюшей точкой
     */
    real: function (_notnull = true, _default = null, _init = null) {
        return { _type: "double", _typedefault: 0, _default: _default, _notnull: _notnull, _init: _init };
    },

    /**
     * float - с плаваюшей точкой
     */
    float: function (_notnull = false, _default = null, _init = null) {
        return { _type: "float", _typedefault: 0, _default: _default, _notnull: _notnull, _init: _init };
    },

    /**
     * decimal - десятичное
     */
    decimal: function (_len = 16, _dec = 4, _notnull = true, _default = null, _init = null) {
        return { _type: "decimal", _typedefault: 0, _default: _default, _notnull: _notnull, _init: _init, _len: _len, _dec: _dec };
    },

    /**
     * money - денежный тип
     * @param {money} _default значение по умолчанию (если не задано, то 0)
     */
    money: function (_notnull = false, _default = null, _init = null) {
        return { _type: "money", _typedefault: 0, _default: _default, _notnull: _notnull, _init: _init };
    },

    /**
     * date - дата
     * @param {date} _default значение по умолчанию
     */
    date: function (_notnull = false, _default = null, _init = null) {
        return { _type: "date", _default: _default, _notnull: _notnull, _init: _init };
    },
    /**
     * date - дата
     * @param {date} _default значение по умолчанию
     */
    datetime: function (_notnull = false, _default = null, _init = null) {
        return { _type: "datetime", _default: _default, _notnull: _notnull, _init: _init };
    },

    /**
     * bool - булевский тип
     * @param {boolean} _default значение по умолчанию (если не задано, то false)
     */
    bool: function (_notnull = true, _default = null, _init = null) {
        return { _type: "bool", _typedefault: false, _default: _default, _notnull: _notnull, _init: _init };
    },

    /**
     * json - тип JSON
     * @param {json} _default значение по умолчанию (если не задано, то null)
     */
    json: function (_notnull = false, _default = null, _init = null) {
        return { _type: "json", _typedefault: null, _default: _default, _notnull: _notnull, _init: _init };
    },
    /**
     * jsonb - тип JSON
     * @param {json} _default значение по умолчанию (если не задано, то null)
     */
    jsonb: function (_notnull = false, _default = null, _init = null) {
        return { _type: "jsonb", _typedefault: null, _default: _default, _notnull: _notnull, _init: _init };
    },
    /**
     * jsonb - тип JSON
     * @param {json} _default значение по умолчанию (если не задано, то null)
     */
    complex: function (_type, _notnull = false, _default = null, _init = null) {
        return { _type: _type, _ptype: 'complex', _typedefault: null, _default: _default, _notnull: _notnull, _init: _init };
    },

    /**
     * ref - ссылка
     * @param {string} _ref наименование таблицы или конфигурации
     * @param {none|restrict|cascade|default} _mode режим (допускается сокращения n|r|c|d)
     */
    ref: function (_ref = "", _mode = "none", _notnull = false, _default = null, _init = null) {
        return { _ptype: "ref", _type: _ref, _mode: _mode, _init: _init, _notnull: _notnull, _default: _default };
    },
    /**
     * reflist - список
     * @param {string} _ref наименование таблицы или конфигурации
     * @param {none|restrict|cascade|default} _mode режим (допускается сокращения n|r|c|d)
     */
    reflist: function (_ref = "", _mode = "none", _init = null) {
        return { _ptype: "reflist", _type: _ref, _mode: _mode, _default: '', _typedefault: '', _init: _init };
    },
    /**
     * rolelist - список
     * @param {string} _ref наименование таблицы или конфигурации
     * @param {none|restrict|cascade|default} _mode режим (допускается сокращения n|r|c|d)
     */
    rolelist: function () {
        return { _ptype: "rolelist", _type: '', _mode: '', _default: '', _typedefault: '', _init: _init };
    },
    /**
     * props - свойства
     */
    props: function (_init = null) {
        return { _ptype: "props", _type: "jsonb", _typedefault: null, _default: null, _notnull: false, _init: _init };
    },

    /**
     * list - список
     * @param {*} _ref наименование таблицы
     */
    list: function (_ref = "", _init = null) {
        return { _ptype: "list", _type: _ref, _init: _init };
    },

    data: function (name, configuration) {
        let index = 0;
        let edm = require('./edm');
        let edmData = edm.getEDMData();
        if (edmData.classes[name]?._mtype == 'cfg') {

            if (name == 'enum') {
                for (let e in configuration) {
                    this.cfg[e] = configuration[e];
                }
            }
            else {
                if (!this.cfg[name]) this.cfg[name] = {};
                let curCfg = this.cfg[name];
                for (let id in configuration) {
                    index++;
                    let curObj = configuration[id];
                    if (!curCfg[id]) {
                        let newObj = edmData.newObj(name, curObj, true);
                        newObj.id = id;
                        curCfg[id] = newObj;
                    }
                    else {
                        curCfg[id].setValues(curObj);
                    }
                    curCfg[id].index = index;
                }
            }
        }
    },
}


/**
 * Модель базы данных
 * @module model
 */
module.exports = {
    /**
     * Список загруженных моделей
     */
    models: {},
    /**
     * Список загруженных описателей слассов модели
     */
    classes: {},

    /**
    * Список загруженных конфигураций
    */
    cfg: {},

    /**
     * Инициализация. Загружает все js-файлы из папки model.
     * Проверяет и подготавливает описатели к работе;
     */
    init: function (dirname) {
        this._init(dirname, false);
        this._init(dirname, true);
    },

    _init: function (dirname, dataMode) {
        const edm = require('./edm');
        const fs = require('fs');

        // Подготовить методы к вызову
        let settings = func.getSettings(dirname);
        let names = [];
        let methods = [];
        let stub = function () { };
        for (let name in modelMethods) {
            names.push(name);
            if (dataMode) {
                if (name == 'data') methods.push(modelMethods[name].bind(this));
                else methods.push(stub);
            }
            else {
                if (name != 'data') methods.push(modelMethods[name].bind(this));
                else methods.push(stub);
            }

        }


        // Загрузить модели и конфигураций
        {
            let fns = func.getPrjFiles(/\.(model|cfg)\.js$/i, dirname);
            let excludePaths = settings.models?.excludes || [];
            if (!Array.isArray(excludePaths)) excludePaths = [excludePaths];
            for (let fn of fns) {
                let exclude = false;
                for (let excludePath of excludePaths) {
                    exclude = exclude || (fn.substring(dirname.length + 1).startsWith(excludePath));
                }
                if (!exclude) {
                    try {
                        let body = fs.readFileSync(fn, { encoding: 'utf8' });
                        (new Function(...names, 'settings', body))(...methods, settings);
                    }
                    catch (e) {
                        console.error(`Ошибки при загрузке модели ${fn}: ${e}`);
                    }
                }
            }
        }
        // Загрузить конфигураций настроенных из MBuilder
        if (dataMode) {
            let edmData = edm.getEDMData();
            let fns = func.getPrjFiles(/\.(cfg)\.json$/i, dirname);
            let excludePaths = settings.models?.excludes || [];
            if (!Array.isArray(excludePaths)) excludePaths = [excludePaths];
            for (let fn of fns) {
                let exclude = false;
                for (let excludePath of excludePaths) {
                    exclude = exclude || (fn.substring(dirname.length + 1).startsWith(excludePath));
                }
                if (!exclude) {
                    try {
                        let values = JSON.parse(fs.readFileSync(fn, { encoding: 'utf8' }));
                        if (values._type && values.id) {
                            let curObj = edmData.getObj(values._type, values.id);
                            if (!curObj) edmData.newObj(values._type, values);
                            else curObj.setValues(values);
                        }
                    }
                    catch (e) {
                        console.error(`Ошибки при загрузке модели ${fn}: ${e}`);
                    }
                }
            }
        }





        // Скопировать свойства(описатели полей) из базовых описателей
        const setBaseProp = function (root, base,) {
            if (root._mtype == 'table' || root._mtype == 'cfg') {
                if (base) {
                    if (root != base) {
                        for (let n in base) {
                            if (n == '_childs') {
                                let rootChilds = root._childs;
                                root._childs = {};

                                for (let c in base._childs) {
                                    root._childs[c] = base._childs[c];
                                }
                                for (let c in rootChilds) {
                                    root._childs[c] = rootChilds[c];
                                }
                            }
                            if (typeof root[n] == "undefined") root[n] = base[n];
                        }
                    }
                    setBaseProp(root, this.classes[base._base]);
                }
            }
        }.bind(this);

        if (!dataMode) {
            for (let n in this.classes) {
                setBaseProp(this.classes[n], this.classes[n]);
            }
            // Проверить правильность наименования поле ссылок
            for (let n in this.classes) {
                let table = this.classes[n];
                if (table) {
                    if (table._mtype == 'table' || table._mtype == 'cfg') {
                        for (let c in table._childs) {
                            let column = table._childs[c];
                            if (column._ptype == 'id') {
                                if (column._name != 'id') throw `Имя первичного ключа таблицы всегда id (${table})`
                            }
                        }
                    }
                }
            }
            // Создать прототип для объектов соответствующих описателю
            for (let n in this.classes) {
                edm.EDMData.createProto(this.classes[n], this.classes);
            }
            // Удалить из модели лишние описатели
            for (let n in this.classes) {
                if (!['type', 'table', 'cfg', 'script'].includes(this.classes[n]._mtype)) {
                    delete this.classes[n];
                }
            }
        }
    },
    initTables: async function (dirname) {
        const fs = require('fs');

        // Подготовить методы к вызову
        let settings = func.getSettings();
        let names = [];
        let methods = [];
        let stub = function () { };
        for (let name in modelMethods) {
            names.push(name);
            if (name == 'data') methods.push(this.tableLoader.bind(this));
            else methods.push(stub);
        }


        // Загрузить модели
        let excludePaths = settings.models?.excludes || [];
        if (!Array.isArray(excludePaths)) excludePaths = [excludePaths];
        let fns = func.getPrjFiles(/\.(model|cfg)\.js$/i, dirname);
        for (let fn of fns) {
            let exclude = false;
            for (let excludePath of excludePaths) {
                exclude = exclude || (fn.substring(dirname.length + 1).startsWith(excludePath));
            }
            if (!exclude) {
                try {
                    let body = fs.readFileSync(fn, { encoding: 'utf8' });
                    await (new Function(...names, 'settings', body))(...methods, settings);
                }
                catch (e) {
                    console.error(`Ошибки при загрузке таблицы ${fn}: ${e}`);
                }
            }
        }
    },
    async tableLoader(name, configuration) {
        if (this.classes[name]?._mtype == 'table') {
            let table = this.classes[name];
            console.debug(`INIT TABLE "${table._mname}"."${table._name}"`)
            let settings = func.getSettings();
            let dbcfg = settings.models['*'];
            let edm = require('./edm');
            let edmData = edm.getEDMData();
            let connection = await edmData.getConnection(table._mname, null, null, dbcfg);

            for (let id in configuration) {
                let values = { ...configuration[id] }
                values.id = id;
                await connection.insert(name, values);
            }

            await connection.free();



        }
    },

};