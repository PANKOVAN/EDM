const helpers = require('./helpers');
const path = require('path');

/**
 * Контроллер данных. Используется с одной строны как поставщик данных на клиент, 
 * с другой как базовый класс для всех специальных контроллеров данных. 
 * 
 * Контроллер данных умеет выполнять запросы к базе данных по имени класса и переданным параметрам. 
 * Ответственность за выделение имени класса и форирование параметров лежит на роудере данных из
 * которого предполагается вызывать контроллер. Функциональность контроллера по начитке данных ограничевается
 * возможностями автоматической генерации EDM. Если этой функциональности не хватает , то можно создать 
 * новый класс контроллера, используя в качестве прототипа DataController
 */
class DataController {

    /**
     * Создает новый экземпляр класса DataController. 
     * @param {string} name имя клааса модели EDM
     * @param {object} req запрос (см express)
     * @param {object} res ответ
     */
    constructor(name, req, res) {
        const edm = require('./edm');
        this.edmData = edm.getEDMData(req.user);
        this.params = helpers.prepareParams(req);
        this.baseName = path.basename(name, '.data');
    }

    /**
     * Подготоавливает данные для передачи на клиент
     * @param {array|object} data 
     * @returns {object}
     */
    prepareData(data) {
        return this.edmData.prepareData(data, this.params);
        //         if (params.paginator) {
        //             result.total_count = 0;
        //             //if (data && data.length > 0) result.total_count = data[0]._total_count || data.length || 0;
        //             if (data && data.length > 0 && data[0] && data[0]._total_count) result.total_count = data[0]._total_count;
        //             result.pos = Number.parseInt(params.start || "0");
        //         }
        //         else if (params.datafetch || params.repeat) {
        //             result.pos = Number.parseInt(params.start || "0");
        //         }
        //         if (typeof params._total != 'undefined') result.total = params._total;
        //         if (typeof params._progress != 'undefined') result.progress = params._progress;
    }
    /**
     * Освобождает все занятые ресурсы
     */
    free() {
        if (this.edmData) this.edmData.free();
    }


    /**
     * Проверяет разрешение для вызова метода(команды) контроллеры.
     *
     * @param {*} method  имя метода
     * @returns {*}
     */
    hasMethod(method) {
        return ['run', 'save', 'create', 'nextId', 'update', 'delete'].includes(method);
    }

    async getConnection(mname, name, accessType) {
        return await this.edmData.getConnection(mname, name, accessType);
    }

    async run() {
        if (this.baseName && this.edmData.classes[this.baseName]) {
            let connection = await this.getConnection(undefined, this.baseName, 'R');
            let data = await connection.selectObj(this.baseName, undefined, this.params);
            await connection.addRef();
            return data;
        }
        throw new Error(`Имя класса не задано или задано неправильно (${this.baseName})`);
    }
    async save() {
        let updates = this.params?.updates;
        if (updates && updates.length) {
            let connection = await this.getConnection(undefined, updates[0]._type, 'W');
            let data = await connection.saveData(updates);
            await connection.addRef();
            return data;
        }
    }
    async create() {
        let connection = await this.getConnection(undefined, this.baseName, 'W');
        let id = await connection.nextId(this.baseName);
        let obj = this.edmData.newObj(this.baseName, { id: id });
        return [obj];
    }
    async nextId() {
        let connection = await this.getConnection(undefined, this.baseName, 'W');
        let id = await connection.nextId(this.baseName);
        return [id];
    }
    async insert() {
        let connection = await this.getConnection(undefined, this.baseName, 'W');
        let data = connection.insertObj(this.baseName, this.params);
        return data;
    }
    async update() {
        let connection = await this.getConnection(undefined, this.baseName, 'W');
        let data = await connection.updateObj(this.baseName, this.params);
        return data;
    }
    async delete() {
        let connection = await this.getConnection(undefined, this.baseName, 'W');
        let obj = undefined;
        let id = this.params.id;
        obj = await connection.deleteObj(this.baseName, { id: id });
        return [obj];
    }
    incorectParams(condition, text) {
        if (!condition) this.throwError(text || 'Параметры не заданы или заданы неправильно');
    }
    throwError(text) {
        throw new Error(text);
    }

}
/**
 * Дополнительные классы
 * @module utils
 */
module.exports = {
    /**
     * Класс контроллер данных
     * @type DataController
     */
    DataController: DataController
}