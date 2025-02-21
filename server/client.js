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

    /**
     * 
     * @param {string} source исходная строка в которую предполагется внедрить данные
     * @param {*} name имя внедренных данных (необязательно)
     * @param {*} obj объект данных
     * @param {*} scheme схема вида :
     *                              {
     *                                   <имя свойства>: <тип данных>,
     *                                   <имя свойства>: <тип данных>,
     * 
     *                                   <имя свойства>: <тип данных>,
     *                              }
     */


    static embeddedTypes = {
        BigInt64: 8,
        BigUint64: 8,
        Float32: 4,
        Float64: 8,
        Int16: 2,
        Int32: 4,
        Int8: 1,
        Uint16: 2,
        Uint32: 4,
        Uint8: 1,
    }
    static setEmbeddedData(source, name, obj, scheme) {
        source = source || '';
        name = name || '';
        obj = obj || {};
        scheme = scheme || {};

        // Длина внедряемых данных
        let l = 0;
        for (let n in scheme) {
            let t = scheme[n];
            let l1 = ClientHelpers.embeddedTypes[t];
            if (!l1) throw new Error(`Тип данных ${n}:${t} задан неправильно!!!`);
            l += l1;
        }


        // Положить все в буфер
        let a = new Uint8Array(l);
        let d = new DataView(a.buffer);
        let offset = 0;
        for (let n in scheme) {
            let t = scheme[n];
            d[`set${t}`](offset, obj[n]);
            offset += ClientHelpers.embeddedTypes[t];
        }

        // Строка для внедрения
        let s = btoa(String.fromCharCode(...a));

        // Внедрить строку в исходную
        let i = source.indexOf(`{{${name}=`);
        let j = source.indexOf(`}}`, i);
        s = `{{${name}=${s}}}`;

        if (i >= 0 && j > i) source = source.substring(0, i) + s + source.substring(j + 2);
        else source = source.trimEnd() + ' ' + s + '\n';

        return source;
    }
    static getEmbeddedData(source, name, obj, scheme) {
        source = source || '';
        name = name || '';
        obj = obj || {};
        scheme = scheme || {};

        // Длина внедряемых данных
        let l = 0;
        for (let n in scheme) {
            let t = scheme[n];
            let l1 = ClientHelpers.embeddedTypes[t];
            if (!l1) throw new Error(`Тип данных ${n} не определен`);
            l += l1;
        }

        // Прочитать данные в объект
        let i = source.indexOf(`{{${name}=`);
        let j = source.indexOf(`}}`, i);
        if (i >= 0 && j > i) {
            let s = source.substring(i + 2 + name.length + 1, j);
            let a = Uint8Array.from(atob(s), c => c.charCodeAt(0));
            if (a.byteLength == l) {
                let d = new DataView(a.buffer);
                let offset = 0;
                for (let n in scheme) {
                    let t = scheme[n];
                    obj[n] = d[`get${t}`](offset);
                    offset += ClientHelpers.embeddedTypes[t];
                }
            }
        }

        return obj;
    }
    static testEmbeddedData(source, name) {
        let i = source.indexOf(`{{${name}=`);
        let j = source.indexOf(`}}`, i);
        return (i >= 0 && j > i)
    }
    //     static setEmbeddedData(str, o) {
    //         if (!o) o = {};
    //         else if (typeof o != 'object' || Array.isArray(o)) o = { _: o };
    //         try {
    //             let s = '{' + JSON.stringify(o) + '}';
    //             let i = str.indexOf('{{');
    //             let j = str.lastIndexOf('}}');

    //             if (i >= 0 && j > i) str = str.substring(0, i) + s + str.substring(j + 2)
    //             else str = str + '\t' + s;

    //             return str;
    //         } catch { }
    //         return '{{}}'
    //     }
    //     static getEmbeddedData(str) {
    //         /*
    //         try {
    //             debugger;
    //             let a = new Float32Array([
    //                 0.123456789,
    //                 0.123456789,
    //                 0.123456789,
    //                 0.123456789,
    //                 0.123456789,
    //                 12345.123456789,
    //                 12345.123456789,
    //                 12345.123456789,
    //                 12345.123456789,
    //                 12345.123456789,
    //             ]);
    //             console.log(JSON.stringify(a));
    //             let b = a.buffer;
    //             console.log(b.byteLength);

    //             let s = btoa(String.fromCharCode(...new Uint8Array(b)));
    //             console.log(s);

    //             let u = Uint8Array.from(atob(s), c => c.charCodeAt(0));
    //             let a1 = new Float32Array(u.buffer);
    //             console.log(JSON.stringify(a1));

    //         }
    //         catch (e) {
    //             console.log(e);
    //             debugger;
    //         }
    // */


    //         try {
    //             let i = str.indexOf('{{');
    //             let j = str.lastIndexOf('}}');

    //             if (i >= 0 && j > i) str = str.substring(i + 1, j + 1);
    //             else str = {};

    //             return JSON.parse(str);
    //         } catch { }
    //         return {}
    //     }

}
module.exports = ClientHelpers
