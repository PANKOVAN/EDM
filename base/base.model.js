/**
 * Интерфейсы для валидации 
 * 
 * Для валидации значений полей допусается использовать специальные свойства с, 
 * которые долны возвращать true/false и которые будут проверены и на клиенте и на сервере при записи.
 * 
 *      isvalidate - проверка на валидность всей строки, если в модели есть такое свойство и если оно вернуло false, 
 *              то считается что строка не валидна ее нельзя изменять или добавлять в базу. 
 *              Об этом буде выдано стандартное сообщение. Если нужно вернуть нестандартное 
 *              сообщение неебходимо вернуть его в качестве результата. Валидный результат
 *              это только true.
 *      isreadonly - если такое свойство задано и если оно вернуло true то считается, что такая строка открыта
 *              толькон на чтение, ее нельзя не изменить, не удалить. При попытки это сделать будет
 *              сформировано стандартное сообщение. Если нужно нестандартное - верните строку.
 *      isreadonly.<field name> - если такое сввойство задано и оно вернуло true то при генерации update такие 
 *              поля исключаются из запроса
 *      afterInsert - если метод задан то он вызывается посля добавления строке в базу 
 *      afterUpdate - если метод задан то он вызывается посля изменения строки 
 *      beforeDelete - если метод задан то он вызывается перед удалением строки 
 * 
 * Эти функции вызываются из insertObj, updateObj, deleteObj, для прямой проверки используются validateObj и isReadOnlyObj    
 * 
 */



/**
 * MBuilder. Базовые классs
 */

scheme('edm', 'Базовые классы', null, {}, [
    base('idObj', 'Объект с автоинкрементным id', 'baseobj', null, [
        field('id', 'ID', id(int())),
        /**
         * Возвращает значения свойств для просмотра
         */
        method('getPropsValues', 'Возвращает значения свойств для просмотра', function (propList) {
            propList = propList || (this.type || {}).propList;
            let props = this.props || {};
            let result = [];
            if (Array.isArray(propList)) {
                propList.forEach(propType => {
                    if (!propType.isHide && !propType.isBuilder) {
                        let v = propType.stringify(props[propType.id]);
                        if (v) result.push({ id: propType.id, label: propType.name, value: v })
                    }
                });
            }
            return result;
        }),
        method('getPropValue', 'Возвращает значения одного свойства', function (id, def) {
            let propType;
            if (this._edm_) propType = this._edm_.cfg['propType'][id];
            else propType = edm.cfg.getObj('propType', id);

            if (propType) {
                if (this.props) {
                    let v;
                    if (propType.targetType == 1 || propType.targetType == 3) v = this.props[id];
                    else if (propType.targetType == 2 || propType.targetType == 4) v = this[id.split('.').pop()];
                    if (v !== undefined && propType.defaultValue != undefined && v != propType.defaultValue) {
                        return propType.stringify(v);
                    }
                }
                return def;
            }
            throw `Свойсто ${id} не найдено в списке свойств для ${this.type} или свойство не определено`;
        }),
        /**
         * Сохраняет значения свойств
         */
        method('setProps', 'Сохраняет значения свойств', function (control) {
            let result = false;
            if (control.isDirty()) {
                let propList = (this.type || {}).propList;
                let changes = control.getDirtyValues();
                if (Array.isArray(propList)) {
                    propList.forEach(element => {
                        if (element.editor && element.editor.ui && !element.isHide) {
                            let v = changes[element.id];
                            if (typeof v != 'undefined') {
                                result = true;
                                this.props[element.id] = v;
                            }
                            v = changes[element.id + '_UNIT'];
                            if (typeof v != 'undefined') {
                                result = true;
                                this.props[element.id + '_UNIT'] = v;
                            }
                        }
                    });
                }
            }
            return result;
        }),
        method('toString', 'Возвращает объект как строку', function () {
            return `${this._type}:${this.id}`;
        }),
        property('value', 'Возвращает объект как строку', function () {
            return this.name;
        }),
    ]),
    base('gidObj', 'Объект с дополнительным GUID', 'idObj', null, [
        field('gid', 'GUID', guid(true)),
        index('_gid', 'Индекс по gid', false, `(gid)`)
    ]),
    base('codeObj', 'Объект с кодом и наименованием', 'gidObj', { trans: true }, [
        field('code', 'Код', string(255, true), { translit: true }),
        field('name', 'Наименование', string(255, true)),
        //field('description', 'Описание', string(), { trans: true }),
        field('rem', 'Примечания', string(), { trans: true }),
        //field('createUser', 'Владелец', ref('user', 'restrict', true, undefined, function (value) { if (this.user && !value) return this.user.id })),
        //field('createDate', 'Дата создания', date(true)),
        property('value', 'Возвращает объект как строку', function () {
            if (this.code && !this.code.startsWith('#')) return `[${this.code}] ${this.name}`;
            return `${this.name}`;
        }),
        method('toString', 'Возвращает объект как строку', function () {
            if (this.code && !this.code.startsWith('#')) return `[${this.code}] ${this.name}`;
            return `${this.name}`;
        }),
        method('toHtml', 'Возвращает объект как HTML', function () {
            let result = ''
            if (this.code && !this.code.startsWith('#')) result = `<b>[${this.code}]</b> ${this.name}`;
            else result = `${this.name}`;
            if (this.index && this._type == 'revision') {
                result += `<span class="mbuilder-revision">[${this.index}]</span>`
            }
            return result;
        }),
    ]),

    base('cfgObj', 'Базовый объект конфигурации', null, { trans: true }, [
        field('id', 'ID', id(string())),
        field('abb', 'Сокращение', string(255)),
        field('name', 'Наименование', string(255), { trans: true }),
        field('rem', 'Примечания', string()),
        method('toString', 'Возвращает объект как строку', function () {
            /*if (this.abb) return `[${this.abb}] ${this.name}`;
            else*/ return this.name;
        }),
        property('value', 'Возвращает объект как строку', function () {
            return this.toString();
        }),
        property('img', 'Возвращает путь к иконке', function () {
            return `public/mbuilder/images/${this._type}/${this.id}.png`;
        }),
        // m.method('toString', 'Возврашает строку', function (source, clear = true) {
        //     return `[${this.id}] ${this.name}`;
        // }),
    ]),
    base('cfgExt', 'Объект конфигурации', 'cfgObj', null, [
        field('icon', 'Иконка', string(255)),
    ]),
    base('cfgRole', 'Объект роль', 'cfgObj', null, [
        field('description', 'Описание', string()),
        field('rem', 'Примечания', string()),
        field('markers', 'Маркер доступа', json()),
    ]),
]);
