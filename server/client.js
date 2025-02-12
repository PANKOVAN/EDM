/**
 * Класс ClientHelpers содержит разные статические методы для работы на стороне клиента
 */
class ClientHelpers {
    /**
     * Используется для правильной "десериализации" на строне клиента данных содержащих программный код
     * @param {json} json данные
     * @returns {json} преобразованные данные
     */
    static prepareJson(json) {
        for (let name in json) {
            let val = json[name];
            if (name == 'function') {
                json = ClientHelpers.eval(val);
            }
            else if (val) {
                if (typeof (val) == 'object') {
                    if (val.function) {
                        json[name] = ClientHelpers.eval(val.function);
                    }
                    else if (val.getter || val.setter) {

                        Object.defineProperty(json, name, {
                            enumerable: true,
                            get: this.getFunc(val.getter),
                            set: this.getFunc(val.setter)
                        });

                    }
                    else {
                        this.prepareJson(val);
                    }
                }
            }
        }
        return json;
    }
    static getFunc(func) {
        let f = new Function("return " + func);
        return f();
    }
    static eval(val) {
        try {
            return eval('(' + val + ')')
        }
        catch (e) {
            edm.main.error(e);
        }
    }
    /**
     * Дополнительная обработка списка классов модели при загрузке
     * @param {json} classes данные
     * @returns {json} преобразованные данные
     */
    static prepareClasses(classes) {
        for (let n in classes) {
            edm.EDMData.createProto(classes[n], classes);
        }
        return classes;
    }
    /**
     * Дополнительная обработка конфигураций при загрузке
     * @param {json} cfg данные
     * @returns {json} преобразованные данные
     */
    static prepareCfg(cfg) {
        let edmData = new edm.EDMData();
        for (let className in cfg) {
            let data = cfg[className];
            for (let id in data) {
                let values = data[id];
                values.id = id;
                edmData.newObj(className, values, false, true).newobj = false;
            }

        }
        return edmData.cfg;
    }
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
    static setEmbeddedData(str, o) {
        try {
            let s = '{{' + JSON.stringify(o) + '}}';
            let i = str.indexOf('{{');
            let j = str.lastIndexOf('}}');

            if (i >= 0 && j > i) str = str.substring(0, i) + s + str.substring(j + 2)
            else str = str + '\t' + s;

            return str;
        } catch { }
        return '{{}}'
    }
    static getEmbeddedData(str) {
        try {
            let i = str.indexOf('{{');
            let j = str.lastIndexOf('}}');

            if (i >= 0 && j > i) str = str.substring(i + 2, j);
            else str = '';

            return JSON.parse(str);
        } catch { }
        return undefined
    }

}
module.exports = ClientHelpers
